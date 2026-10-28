import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { ChatGPTBrokerCredentialStore } from "../src/agent/chatgpt-broker.ts";
import { piChatGPTModels } from "../src/agent/models.ts";

const require = createRequire(import.meta.url);
type RecordValue = Record<string, unknown>;
type Store = {
  read(id: string): Promise<RecordValue | undefined>;
  modify(id: string, transform: (current: RecordValue | undefined) => Promise<RecordValue>, options?: {signal?: AbortSignal}): Promise<RecordValue | undefined>;
  delete(id: string, options?: {expectedRefresh?:string}): Promise<RecordValue | false>;
};
const native = require("../electron/chatgpt-oauth.cjs") as {
  createEncryptedCredentialStore(file: string, backend: RecordValue): Store;
  createChatGPTOAuthRuntime(options: RecordValue): Promise<{brokerUrl: string; brokerSecret: string; close(): void}>;
};
function encryptedBackend() {
  const key = crypto.randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString: (data: string) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    decryptString: (data: Buffer) => {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
    },
  };
}
async function scratch(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-adversarial-"));
  try { await run(dir); }
  finally { await fs.rm(dir, {recursive: true, force: true, maxRetries: 3, retryDelay: 50}); }
}
describe("adversarial ChatGPT private-provider checks", () => {

  it("revokes precisely the rotated refresh token that local disconnect actually deletes", async () => {
    await scratch(async dir => {
      const safeStorage=encryptedBackend();
      const store=native.createEncryptedCredentialStore(path.join(dir,"chatgpt-oauth.enc.json"),safeStorage);
      await store.modify("openai",async()=>({
        type:"oauth", access:"old-access",refresh:"old-refresh",clientId:"client",
        subject:"verified-user",expires:Date.now()-10_000,
        scopes:["openid","profile","email","offline_access","resource.invoke","chatgpt.tokens.use.direct"],
      }));
      const oldFetch=globalThis.fetch;
      let revoked:string|null=null;
      globalThis.fetch=async(input,init)=>{
        const url=String(input);
        if(url.startsWith("http://127.0.0.1:"))return oldFetch(input,init);
        if(url.endsWith("/.well-known/openid-configuration"))return Response.json({
          issuer:"https://auth.openai.com",
          authorization_endpoint:"https://auth.openai.com/oauth/authorize",
          token_endpoint:"https://auth.openai.com/oauth/token",
          jwks_uri:"https://auth.openai.com/.well-known/jwks.json",
          revocation_endpoint:"https://auth.openai.com/oauth/revoke",
        });
        if(url.endsWith("/oauth/token"))return Response.json({
          access_token:"new-access",refresh_token:"new-refresh",token_type:"bearer",
          scope:"openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",expires_in:3600,
        });
        if(url.endsWith("/oauth/revoke")){
          revoked=new URLSearchParams(init?.body as string).get("token");
          return new Response(null,{status:200});
        }
        throw new Error("Unexpected remote request: "+url);
      };
      const handlers=new Map<string,(event?:unknown)=>Promise<unknown>>();
      const runtime=await native.createChatGPTOAuthRuntime({
        userDataDir:dir,safeStorage,shell:{openExternal:async()=>undefined},
        ipcMain:{handle:(name:string,fn:(event?:unknown)=>Promise<unknown>)=>{handlers.set(name,fn);}},
        authorizeIpc:()=>true,log:()=>undefined,
      });
      try{
        const headers={authorization:`Bearer ${runtime.brokerSecret}`};
        const token=await fetch(runtime.brokerUrl+"/v1/token",{method:"POST",headers});
        assert.equal(token.status,200);
        assert.equal((await token.json()).accessToken,"new-access");
        const active=await store.read("openai");
        assert.equal(active?.refresh,"new-refresh");
        const output=await handlers.get("lh:chatgpt:disconnect")!() as {connected:boolean};
        assert.equal(output.connected,false);
        assert.equal(revoked,"new-refresh","remote revoke must use the token actually removed after rotation");
        assert.equal(await store.read("openai"),undefined);
      }finally{runtime.close();globalThis.fetch=oldFetch;}
    });
  });

  it("compare-and-delete cannot wipe a newly reconnected account after a stale invalid-grant refresh", async()=>{
    await scratch(async dir=>{
      const store=native.createEncryptedCredentialStore(path.join(dir,"vault.json"),encryptedBackend());
      await store.modify("openai",async()=>({type:"oauth",refresh:"refresh-before",access:"old"}));
      await store.modify("openai",async()=>({type:"oauth",refresh:"refresh-after",access:"new"}));
      const stale=await store.delete("openai",{expectedRefresh:"refresh-before"});
      assert.equal(stale,false);
      assert.equal((await store.read("openai"))?.refresh,"refresh-after");
      const deleted=await store.delete("openai",{expectedRefresh:"refresh-after"});
      assert.notEqual(deleted,false);
      assert.equal(deleted ? deleted.refresh : undefined,"refresh-after");
      assert.equal(await store.read("openai"),undefined);
    });
  });


  it("fails closed for malformed saved OAuth credentials and API keys masquerading as OAuth", async () => {
    const {validCredential}=native as unknown as {validCredential:(value:unknown)=>boolean};
    const baseline = {
      type:"oauth",access:"eyJ.test",refresh:"refresh-token",
      clientId:"client-test",subject:"verified-subject",
      expires:Date.now()+3600000,
      scopes:["openid","profile","email","offline_access","resource.invoke","chatgpt.tokens.use.direct"],
    };
    assert.equal(validCredential(baseline),true);
    for(const broken of [
      {...baseline,access:"sk-platform-api-key"},
      {...baseline,clientId:"dynamic_agent_client"},
      {...baseline,scopes:["chatgpt.tokens.use.direct"]},
      {...baseline,refresh:""},
      {...baseline,subject:""},
      {...baseline,expires:Infinity},
      {...baseline,expires:-1},
      {...baseline,type:"api-key"},
    ]) assert.equal(validCredential(broken),false);
    await scratch(async dir => {
      const safeStorage=encryptedBackend();
      const file=path.join(dir,"chatgpt-oauth.enc.json");
      const store=native.createEncryptedCredentialStore(file,safeStorage);
      await store.modify("openai",async()=>({...baseline,access:"sk-platform-api-key"}));
      const runtime=await native.createChatGPTOAuthRuntime({
        userDataDir:dir,safeStorage,shell:{openExternal:async()=>undefined},
        ipcMain:{handle:()=>undefined},authorizeIpc:()=>true,log:()=>undefined,
      });
      try{
        const headers={authorization:`Bearer ${runtime.brokerSecret}`};
        const status=await (await fetch(runtime.brokerUrl+"/v1/status",{headers})).json();
        assert.equal(status.connected,false);
        const token=await fetch(runtime.brokerUrl+"/v1/token",{method:"POST",headers});
        assert.equal(token.status,401);
      }finally{runtime.close();}
    });
  });


  it("invalid_grant refresh invalidates the saved connection rather than retrying forever", async () => {
    await scratch(async dir => {
      const safeStorage=encryptedBackend();
      const store=native.createEncryptedCredentialStore(path.join(dir,"chatgpt-oauth.enc.json"),safeStorage);
      await store.modify("openai",async()=>({
        type:"oauth", access:"expired",refresh:"revoked",clientId:"client",
        expires:Date.now()-5000,subject:"test-user",scopes:["openid","profile","email","offline_access","resource.invoke","chatgpt.tokens.use.direct"],
      }));
      const oldFetch=globalThis.fetch;
      globalThis.fetch=async(input,init)=>{
        const url=String(input);
        if(url.startsWith("http://127.0.0.1:")) return oldFetch(input,init);
        if(url.endsWith("/.well-known/openid-configuration")) return Response.json({
          issuer:"https://auth.openai.com",
          authorization_endpoint:"https://auth.openai.com/oauth/authorize",
          token_endpoint:"https://auth.openai.com/oauth/token",
          jwks_uri:"https://auth.openai.com/.well-known/jwks.json",
          revocation_endpoint:"https://auth.openai.com/oauth/revoke"
        });
        if(url.endsWith("/oauth/token"))return Response.json({error:"invalid_grant"}, {status:400});
        throw new Error("Unexpected remote request "+url);
      };
      const runtime=await native.createChatGPTOAuthRuntime({
        userDataDir:dir,safeStorage,
        shell:{openExternal:async()=>undefined}, ipcMain:{handle:()=>undefined},
        authorizeIpc:()=>true,log:()=>undefined
      });
      try {
        const headers={authorization:`Bearer ${runtime.brokerSecret}`};
        const denied=await fetch(runtime.brokerUrl+"/v1/token",{method:"POST",headers});
        assert.equal(denied.status,500);
        assert.equal(await store.read("openai"),undefined);
        const status=await (await fetch(runtime.brokerUrl+"/v1/status",{headers})).json();
        assert.equal(status.connected,false);
        assert.match(status.error,/Reconnect/);
        const noToken=await fetch(runtime.brokerUrl+"/v1/token",{method:"POST",headers});
        assert.equal(noToken.status,401);
      } finally {runtime.close();globalThis.fetch=oldFetch;}
    });
  });


  it("filters available ChatGPT models to the signed-in account's visible roster, never leaking bearer tokens", async () => {
    await scratch(async dir => {
      const oldFetch = globalThis.fetch;
      const safeStorage = encryptedBackend();
      const file = path.join(dir, "chatgpt-oauth.enc.json");
      const store = native.createEncryptedCredentialStore(file, safeStorage);
      await store.modify("openai", async () => ({
        type: "oauth", access: "test-oauth-bearer", refresh: "refresh",
        clientId: "client", expires: Date.now() + 3600000, subject:"test-user",
        scopes:["openid","profile","email","offline_access","resource.invoke","chatgpt.tokens.use.direct"],
      }));
      let networkCalls = 0;
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.startsWith("http://127.0.0.1:")) return oldFetch(input, init);
        if (url === "https://api.openai.com/v1/models") {
          networkCalls++;
          assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-oauth-bearer");
          assert.equal(process.env.OPENAI_API_KEY === "test-oauth-bearer", false);
          return Response.json({
            models: [
              {slug:"gpt-4o",display_name:"Account GPT 4o",visibility:"list"},
              {slug:"gpt-4o",display_name:"duplicate",visibility:"list"},
              {slug:"secret-hidden",display_name:"Hidden",visibility:"hidden"},
              {slug:"../bad",display_name:"Invalid",visibility:"list"},
              {slug:"gpt-6.1-sol",display_name:"Supported",visibility:"list"},
            ],
          });
        }
        throw new Error("Unexpected token request: " + url);
      };
      const runtime = await native.createChatGPTOAuthRuntime({
        userDataDir: dir, safeStorage,
        shell:{openExternal:async()=>undefined},
        ipcMain:{handle:()=>undefined},
        authorizeIpc:()=>true, log:()=>undefined,
      });
      try {
        const headers = { authorization: `Bearer ${runtime.brokerSecret}` };
        const one = await fetch(runtime.brokerUrl + "/v1/models", {headers});
        assert.equal(one.status, 200);
        const data = await one.json() as {models: {id:string;name:string}[]};
        assert.deepEqual(data.models, [
          {id:"gpt-4o",name:"Account GPT 4o"},
          {id:"gpt-6.1-sol",name:"Supported"},
        ]);
        assert.doesNotMatch(JSON.stringify(data), /test-oauth-bearer|secret-hidden|refresh/);
        const two = await fetch(runtime.brokerUrl + "/v1/models", {headers});
        assert.equal(two.status, 200);
        assert.equal(networkCalls, 1, "repeated model requests should hit one-minute authenticated cache");
        assert.equal((await fetch(runtime.brokerUrl + "/v1/models")).status,404);
      } finally { runtime.close(); globalThis.fetch = oldFetch; }
    });
  });

  it("fails account model discovery closed rather than guessing the static provider catalog", async () => {
    await scratch(async dir => {
      const oldFetch = globalThis.fetch;
      const safeStorage = encryptedBackend();
      const store = native.createEncryptedCredentialStore(path.join(dir, "chatgpt-oauth.enc.json"), safeStorage);
      await store.modify("openai", async()=>({type:"oauth", access:"synthetic",refresh:"refresh",clientId:"client",expires:Date.now()+3600000,subject:"test-user",scopes:["openid","profile","email","offline_access","resource.invoke","chatgpt.tokens.use.direct"]}));
      globalThis.fetch = async (input,init) => {
        const url = String(input);
        if(url.startsWith("http://127.0.0.1:"))return oldFetch(input,init);
        return Response.json({models:"not-an-array"});
      };
      const runtime = await native.createChatGPTOAuthRuntime({
        userDataDir:dir,safeStorage,shell:{openExternal:async()=>undefined},
        ipcMain:{handle:()=>undefined},authorizeIpc:()=>true,log:()=>undefined,
      });
      try {
        const response = await fetch(runtime.brokerUrl + "/v1/models", {headers:{authorization:`Bearer ${runtime.brokerSecret}`}});
        assert.equal(response.status,503);
        assert.deepEqual(await response.json(),{error:"chatgpt_models_unavailable"});
      } finally {runtime.close();globalThis.fetch=oldFetch;}
    });
  });


  it("refuses insecure Linux-style basic_text key storage even when encryption reports available", async () => {
    const { storageSecure } = native as unknown as {storageSecure: (backend: RecordValue) => boolean};
    assert.equal(storageSecure({
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => "basic_text",
    }), false);
    assert.equal(storageSecure({
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => "unknown",
    }), false);
    await scratch(async dir => {
      const file = path.join(dir, "vault.json");
      const store = native.createEncryptedCredentialStore(file, {
        ...encryptedBackend(),
        getSelectedStorageBackend: () => "basic_text",
      });
      await assert.rejects(store.modify("openai", async () => ({type: "oauth", access: "secret"})), /Secure credential storage is unavailable/);
      await assert.rejects(fs.readFile(file), {code:"ENOENT"});
    });
  });

  it("denies status, login and disconnect IPC from untrusted frames, allowing only the exact approved event", async () => {
    await scratch(async dir => {
      const handlers = new Map<string,(event?: unknown) => Promise<unknown>>();
      const goodEvent = { trusted: true };
      const runtime = await native.createChatGPTOAuthRuntime({
        userDataDir: dir,
        safeStorage: encryptedBackend(),
        shell: {openExternal: async () => undefined},
        ipcMain: {handle: (channel:string, handler:(event?:unknown)=>Promise<unknown>) => {handlers.set(channel,handler);}},
        authorizeIpc: (event:unknown) => event === goodEvent,
        log: () => undefined,
      });
      try {
        for (const channel of ["lh:chatgpt:status", "lh:chatgpt:sign-in", "lh:chatgpt:disconnect", "lh:chatgpt:open-authorization"]) {
          await assert.rejects(async () => handlers.get(channel)!({trusted:true}), /Untrusted ChatGPT IPC sender/);
          await assert.rejects(async () => handlers.get(channel)!(), /Untrusted ChatGPT IPC sender/);
        }
        assert.equal((await handlers.get("lh:chatgpt:status")!(goodEvent) as {connected:boolean}).connected, false);
      } finally {runtime.close();}
    });
  });

  it("disconnects LOCALLY after remote revocation fails and never serves the old token again", async () => {
    await scratch(async dir => {
      const handlers = new Map<string,(event?:unknown)=>Promise<unknown>>();
      const safeStorage = encryptedBackend();
      const oldFetch = globalThis.fetch;
      const file = path.join(dir, "chatgpt-oauth.enc.json");
      const store = native.createEncryptedCredentialStore(file, safeStorage);
      await store.modify("openai", async () => ({
        type: "oauth",
        access: "old-token",
        refresh: "old-refresh",
        clientId: "local-test",
        expires: Date.now() + 3600000,
      }));
      globalThis.fetch = async (input, init) => {
        const target = String(input);
        if (target.startsWith("http://127.0.0.1:")) return oldFetch(input, init);
        if (target.endsWith("/.well-known/openid-configuration")) {
          return Response.json({
            issuer: "https://auth.openai.com",
            authorization_endpoint: "https://auth.openai.com/oauth/authorize",
            token_endpoint: "https://auth.openai.com/oauth/token",
            jwks_uri: "https://auth.openai.com/.well-known/jwks.json",
            revocation_endpoint: "https://auth.openai.com/oauth/revoke",
          });
        }
        if (target.endsWith("/oauth/revoke")) return new Response("outage", {status: 503});
        throw new Error("Unexpected network request: " + target);
      };
      const runtime = await native.createChatGPTOAuthRuntime({
        userDataDir: dir,
        safeStorage,
        shell: {openExternal: async () => undefined},
        ipcMain: {handle: (channel:string, handler:(event?:unknown)=>Promise<unknown>) => {handlers.set(channel, handler);}},
        authorizeIpc: () => true,
        log: () => undefined,
      });
      try {
        const outcome = await handlers.get("lh:chatgpt:disconnect")!() as {connected:boolean,error?:string};
        assert.equal(outcome.connected,false);
        assert.match(outcome.error ?? "", /Disconnected locally/);
        assert.equal(await store.read("openai"), undefined);
        const token = await fetch(runtime.brokerUrl + "/v1/token", {
          method: "POST",
          headers: {authorization: `Bearer ${runtime.brokerSecret}`},
        });
        assert.equal(token.status, 401);
      } finally {
        runtime.close();
        globalThis.fetch = oldFetch;
      }
    });
  });

  it("refuses to write credentials when OS encryption is unavailable; never falls back to plaintext", async () => {
    await scratch(async dir => {
      const file = path.join(dir, "vault.json");
      const store = native.createEncryptedCredentialStore(file, {isEncryptionAvailable: () => false});
      await assert.rejects(store.modify("openai", async () => ({type: "oauth", access: "MUST_NOT_PERSIST"})), /Secure credential storage is unavailable/);
      await assert.rejects(fs.readFile(file), {code: "ENOENT"});
    });
  });

  it("fails closed on tampered and malformed credential vaults without replacing them", async () => {
    await scratch(async dir => {
      const file = path.join(dir, "vault.json");
      const store = native.createEncryptedCredentialStore(file, encryptedBackend());
      await store.modify("openai", async () => ({type: "oauth", access: "never-print-this", expires: Date.now() + 3600000}));
      const original = await fs.readFile(file, "utf8");
      assert.doesNotMatch(original, /never-print-this/);
      const object = JSON.parse(original) as {ciphertext: string};
      const ciphertext = Buffer.from(object.ciphertext, "base64");
      ciphertext[ciphertext.length - 1] = ciphertext[ciphertext.length - 1]! ^ 1;
      await fs.writeFile(file, JSON.stringify({...object, ciphertext: ciphertext.toString("base64")}));
      const tampered = await fs.readFile(file, "utf8");
      await assert.rejects(store.read("openai"));
      await assert.rejects(store.modify("openai", async () => ({type: "oauth", access: "bad"})));
      assert.equal(await fs.readFile(file, "utf8"), tampered, "failed decrypt must not overwrite recoverable evidence");
      await fs.writeFile(file, '{"version": 1, "ciphertext": 42}');
      await assert.rejects(store.read("openai"), /unsupported format/);
    });
  });

  it("serializes simultaneous token refresh updates for one provider", async () => {
    await scratch(async dir => {
      const file = path.join(dir, "vault.json");
      const store = native.createEncryptedCredentialStore(file, encryptedBackend());
      await store.modify("openai", async () => ({count: 0}));
      await Promise.all(Array.from({length: 20}, () =>
        store.modify("openai", async current => ({count: Number(current?.count ?? 0) + 1}))));
      assert.equal((await store.read("openai"))?.count, 20);
    });
  });

  it("aborted vault writes must not create persistent OAuth state", async () => {
    await scratch(async dir => {
      const file = path.join(dir, "vault.json");
      const store = native.createEncryptedCredentialStore(file, encryptedBackend());
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(store.modify("openai", async () => ({type: "oauth"}), {signal: controller.signal}));
      await assert.rejects(fs.readFile(file), {code: "ENOENT"});
    });
  });

  it("with unavailable secure storage, status denies connection, broker hides from unauthorized callers, and sign-in fails", async () => {
    await scratch(async dir => {
      const handlers = new Map<string, () => Promise<unknown>>();
      let opened = 0;
      const runtime = await native.createChatGPTOAuthRuntime({
        userDataDir: dir,
        safeStorage: {isEncryptionAvailable: () => false},
        shell: {openExternal: async () => { opened++; }},
        ipcMain: {handle: (name: string, handler: () => Promise<unknown>) => {handlers.set(name, handler);}},
        log: () => undefined,
        authorizeIpc: () => true,
      });
      try {
        assert.equal((await fetch(runtime.brokerUrl + "/v1/status")).status, 404);
        const headers = {authorization: `Bearer ${runtime.brokerSecret}`};
        const response = await fetch(runtime.brokerUrl + "/v1/status", {headers});
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          available: false, connected: false, error: "Secure credential storage is unavailable on this system."
        });
        assert.equal((await fetch(runtime.brokerUrl + "/v1/token", {method: "GET", headers})).status, 404);
        assert.equal((await fetch(runtime.brokerUrl + "/v1/token", {method: "POST", headers: {authorization: "Bearer wrong"}})).status, 404);
        await assert.rejects(handlers.get("lh:chatgpt:sign-in")!(), /Secure credential storage is unavailable/);
        assert.equal(opened, 0);
      } finally {runtime.close();}
    });
  });

  it("401 broker denial with a paid API key present cannot authenticate the subscription provider", async () => {
    const old = {
      key: process.env.OPENAI_API_KEY,
      url: process.env.LH_CHATGPT_BROKER_URL,
      secret: process.env.LH_CHATGPT_BROKER_SECRET,
      fetch: globalThis.fetch,
    };
    try {
      process.env.OPENAI_API_KEY = "sk-MUST-NOT-FALLBACK";
      process.env.LH_CHATGPT_BROKER_URL = "http://127.0.0.1:12345";
      process.env.LH_CHATGPT_BROKER_SECRET = "secret";
      globalThis.fetch = async () => new Response('{"error":"not_connected"}', {status: 401});
      assert.equal(await new ChatGPTBrokerCredentialStore().read("openai"), undefined);
      assert.equal(await piChatGPTModels().getAuth("openai"), undefined);
    } finally {
      for (const [field, value] of [["OPENAI_API_KEY", old.key], ["LH_CHATGPT_BROKER_URL", old.url], ["LH_CHATGPT_BROKER_SECRET", old.secret]] as const) {
        if (value === undefined) delete process.env[field];
        else process.env[field] = value;
      }
      globalThis.fetch = old.fetch;
    }
  });
});

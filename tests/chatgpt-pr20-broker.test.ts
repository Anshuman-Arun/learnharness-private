import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const { createChatGPTOAuthRuntime, createEncryptedCredentialStore } =
  require("../electron/chatgpt-oauth.cjs") as {
    createChatGPTOAuthRuntime: (options: Record<string, unknown>) => Promise<{
      brokerUrl:string; brokerSecret:string; close():void;
    }>;
    createEncryptedCredentialStore: (
      name:string, safeStorage:Record<string, unknown>
    ) => {modify:(id:string, update:()=>Promise<Record<string,unknown>>)=>Promise<unknown>};
  };

describe("PR20 real localhost broker (no account/network required)", () => {
  it("rejects unknown clients; exposes account state but never tokens in status/IPC", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pr20-broker-"));
    const key=crypto.randomBytes(32);
    const safeStorage={
      isEncryptionAvailable:()=>true,
      encryptString:(str:string)=>{
        const nonce=crypto.randomBytes(12);
        const cipher=crypto.createCipheriv("aes-256-gcm",key,nonce);
        const body=Buffer.concat([cipher.update(str,"utf8"),cipher.final()]);
        return Buffer.concat([nonce,cipher.getAuthTag(),body]);
      },
      decryptString:(input:Buffer)=>{
        const decipher=crypto.createDecipheriv("aes-256-gcm",key,input.subarray(0,12));
        decipher.setAuthTag(input.subarray(12,28));
        return Buffer.concat([decipher.update(input.subarray(28)),decipher.final()]).toString("utf8");
      }
    };
    const ipcHandlers = new Map<string,(event?: unknown)=>Promise<unknown>>();
    let runtime:Awaited<ReturnType<typeof createChatGPTOAuthRuntime>>|undefined;
    try {
      runtime=await createChatGPTOAuthRuntime({
        userDataDir:directory,safeStorage,
        shell:{openExternal:async()=>undefined},
        ipcMain:{handle:(channel:string,handler:(event?: unknown)=>Promise<unknown>)=>ipcHandlers.set(channel,handler)},
        authorizeIpc:()=>true,
        log:()=>undefined
      });
      const base=runtime.brokerUrl;
      const headers={authorization:`Bearer ${runtime.brokerSecret}`};
      const bad=await fetch(base+"/v1/status");
      assert.equal(bad.status,404,"Without bearer capability, broker is not visible");
      const noConnection=await fetch(base+"/v1/status",{headers});
      assert.equal(noConnection.status,200);
      assert.deepEqual((await noConnection.json()).connected,false);
      const noToken=await fetch(base+"/v1/token",{method:"POST",headers});
      assert.equal(noToken.status,401,"Signed-out session cannot generate fake credentials");

      const store=createEncryptedCredentialStore(path.join(directory,"chatgpt-oauth.enc.json"),safeStorage);
      await store.modify("openai",async()=>({
        type:"oauth",access:"private-test-access-should-not-leak",
        refresh:"private-test-refresh-should-not-leak",expires:Date.now()+3_600_000,
        scopes:["openid","profile","email","offline_access","resource.invoke","chatgpt.tokens.use.direct"],clientId:"local-test",subject:"test-user"
      }));
      const saved=await fs.readFile(path.join(directory,"chatgpt-oauth.enc.json"),"utf8");
      assert.doesNotMatch(saved,/private-test-(access|refresh)/,"Credentials must be encrypted at rest");

      const ipcStatus=await ipcHandlers.get("lh:chatgpt:status")?.();
      assert.equal((ipcStatus as {connected?:boolean})?.connected,true);
      assert.doesNotMatch(JSON.stringify(ipcStatus),/private-test-(access|refresh)/);
      const connectedStatus=await (await fetch(base+"/v1/status",{headers})).json();
      assert.equal(connectedStatus.connected,true);
      assert.doesNotMatch(JSON.stringify(connectedStatus),/private-test-(access|refresh)/);
      const authorised=await fetch(base+"/v1/token",{method:"POST",headers});
      assert.equal(authorised.status,200);
      assert.equal((await authorised.json()).accessToken,"private-test-access-should-not-leak");
      const wrong=await fetch(base+"/v1/token",{
        method:"POST",headers:{authorization:"Bearer invalid-secret"}
      });
      assert.equal(wrong.status,404);
    } finally {
      runtime?.close();
      await fs.rm(directory,{recursive:true,force:true,maxRetries:4,retryDelay:60});
    }
  });
});

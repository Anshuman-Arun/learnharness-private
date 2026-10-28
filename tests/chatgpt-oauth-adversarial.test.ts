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
      return Buffer.concat([iv, cipher.getAuthTag(), cipher.update(data, "utf8"), cipher.final()]);
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

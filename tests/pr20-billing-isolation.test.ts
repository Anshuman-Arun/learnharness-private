import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { piChatGPTModels, piEngineForSpec } from "../src/agent/models.ts";

const initial = {
  apiKey: process.env.OPENAI_API_KEY,
  brokerUrl: process.env.LH_CHATGPT_BROKER_URL,
  brokerSecret: process.env.LH_CHATGPT_BROKER_SECRET,
};
afterEach(() => {
  if(initial.apiKey === undefined)delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY=initial.apiKey;
  if(initial.brokerUrl === undefined)delete process.env.LH_CHATGPT_BROKER_URL;
  else process.env.LH_CHATGPT_BROKER_URL=initial.brokerUrl;
  if(initial.brokerSecret === undefined)delete process.env.LH_CHATGPT_BROKER_SECRET;
  else process.env.LH_CHATGPT_BROKER_SECRET=initial.brokerSecret;
});
describe("PR20 subscription billing isolation", () => {
  it("must not resolve a paid API key when signed out, even if OPENAI_API_KEY is configured", async () => {
    process.env.OPENAI_API_KEY="sk-paid-api-key-must-not-be-used";
    delete process.env.LH_CHATGPT_BROKER_URL;
    delete process.env.LH_CHATGPT_BROKER_SECRET;
    assert.equal(await piChatGPTModels().getAuth("openai"),undefined);
    const available=piChatGPTModels().getModels("openai");
    assert.ok(available.length > 0);
    assert.ok(piEngineForSpec({provider:"openai-chatgpt",id:available[0]!.id}).streamFn);
  });
});

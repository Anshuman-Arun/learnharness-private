import assert from "node:assert/strict";
import {describe,it} from "node:test";
import { CHATGPT_PLAN_NOT_CONNECTED, providerKeyMissing, isProviderKeyRefusal } from "../src/core/settings.ts";
import { parseProviderKeyRefusal } from "../components/chat.tsx";

describe("subscription refusal protocol remains machine-readable across UI/transport", () => {
  it("does not direct subscription users to buy an API key", () => {
    const e=providerKeyMissing("openai-chatgpt",["strong"]);
    assert.equal(e.error,CHATGPT_PLAN_NOT_CONNECTED);
    assert.match(e.error,/ChatGPT plan/);
    assert.doesNotMatch(e.error,/add one|API key/i);
    assert.equal(isProviderKeyRefusal(e.error),true);
  });
  it("parses subscription sign-out by code regardless of human wording", () => {
    const envelope=providerKeyMissing("openai-chatgpt",["strong"]);
    assert.equal(parseProviderKeyRefusal(JSON.stringify(envelope)),true);
    assert.equal(parseProviderKeyRefusal(JSON.stringify({...envelope,error:"Subscription was disconnected"})),true);
    assert.equal(parseProviderKeyRefusal(JSON.stringify({code:"chatgpt_model_unavailable",error:"Account lacks selected model"})),true);
    assert.equal(parseProviderKeyRefusal(JSON.stringify({code:"provider_key_missing",error:123})),false);
    assert.equal(parseProviderKeyRefusal(JSON.stringify({code:"unrelated",error:"Unexpected error"})),false);
  });
});

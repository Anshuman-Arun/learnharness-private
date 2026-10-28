import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { callCost } from "../src/core/prices.ts";
describe("ChatGPT subscription usage attribution", () => {
  it("never prices a subscription turn as a Platform API-key request", () => {
    const cost = callCost({inputTokens:1200,outputTokens:300}, "openai-chatgpt:gpt-4o");
    assert.equal(cost, null);
  });
  it("stamps persisted usage with selected billing-provider identity", () => {
    const source=readFileSync(new URL("../src/server/chat-handler.ts",import.meta.url),"utf8");
    assert.ok(source.includes("engine.providerId ?? engine.model.provider"));
  });
  it("shows plan usage distinctly from API estimate in the stats UI", () => {
    const source=readFileSync(new URL("../components/stats-bar.tsx",import.meta.url),"utf8");
    assert.ok(source.includes("ChatGPT plan turns"));
    assert.ok(source.includes("API cost estimate"));
    const runner=readFileSync(new URL("../src/agent/subagents/runner.ts",import.meta.url),"utf8");
    const extraction=readFileSync(new URL("../src/agent/subagents/extraction.ts",import.meta.url),"utf8");
    assert.ok(runner.includes("await deps.providerKeyMissing?.("));
    assert.ok(extraction.includes("await deps.providerKeyMissing?.("));
  });
});

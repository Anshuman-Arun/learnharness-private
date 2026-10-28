import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore } from "@earendil-works/pi-ai";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-teaching-mode-"));
process.env.LH_DATA_DIR = scratch;
const { PATCH, PUT } = await import("../app/api/chats/[id]/settings/route.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { createTeacherAgent, composeInstructions } = await import("../src/agent/teacher-agent.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function request(id: string, body: unknown) {
	return PATCH(new Request("http://test/settings", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}

describe("session teaching preference", () => {
	it("switches both ways, survives a reload, and never changes another session or model", async () => {
		const a = chatStore.createChat("A"), b = chatStore.createChat("B");
		const model = { provider: "example", id: "preserved" };
		chatStore.saveSettings(a.id, { model, thinkingLevel: "low" });
		for (const teachingMode of ["guided", "explain", "guided"] as const) {
			const response = await request(a.id, { teachingMode });
			assert.equal(response.status, 200);
			assert.deepEqual(chatStore.getChat(a.id)?.settings, { model, thinkingLevel: "low", teachingMode });
			assert.equal(chatStore.getChat(b.id)?.settings, undefined);
		}
	});
	it("rejects malformed or overbroad updates without changing stored settings", async () => {
		const a = chatStore.createChat("Validate");
		for (const body of [null, [], {}, { teachingMode: "forever" }, { teachingMode: false }, { teachingMode: "guided", model: { provider: "x", id: "y" } }]) {
			assert.equal((await request(a.id, body)).status, 400);
			assert.equal(chatStore.getChat(a.id)?.settings, undefined);
		}
		assert.equal((await request("missing", { teachingMode: "guided" })).status, 404);
	});
	it("a legacy model-control write cannot erase a mode selected in another control", async () => {
		const a = chatStore.createChat("Model control");
		await request(a.id, { teachingMode: "guided" });
		const response = await PUT(new Request("http://test/settings", { method: "PUT", body: "{}" }), { params: Promise.resolve({ id: a.id }) });
		assert.equal(response.status, 200);
		assert.deepEqual(chatStore.getChat(a.id)?.settings, { teachingMode: "guided" });
	});
	it("constructs the next agent with the current mode after all source instructions", () => {
		const faux = createFauxCore({});
		const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
		const original = createTeacherAgent(undefined, { engine }).state.systemPrompt;
		assert.equal(original, composeInstructions("teacher"));
		const guided = createTeacherAgent(undefined, { engine, teachingMode: "guided" }).state.systemPrompt;
		assert.ok(guided.startsWith(original));
		assert.ok(guided.lastIndexOf("Session teaching preference: Guided") > guided.indexOf("Teach first, check second"));
		assert.match(guided, /ONE minimal hint/);
		const direct = createTeacherAgent(undefined, { engine, teachingMode: "explain" }).state.systemPrompt;
		assert.match(direct, /Session teaching preference: Explain/);
		assert.ok(!direct.includes("ONE minimal hint"), "switching back does not retain the guided policy");
	});
});

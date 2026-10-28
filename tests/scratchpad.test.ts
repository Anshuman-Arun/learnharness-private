import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { emptyScratchpad, parseScratchpad } from "../src/core/scratchpad.ts";
import { parseLearningEvidence, evidenceDescription } from "../src/core/learning-evidence.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-scratchpad-"));
process.env.LH_DATA_DIR = scratch;
const { listScratchpads, saveScratchpad } = await import("../src/server/scratchpad.ts");
const { PUT, GET } = await import("../app/api/training/scratchpad/route.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const stroke = { id: "stroke-1", type: "freedraw", x: 0, y: 0, width: 100, height: 20, angle: 0, points: [[0, 0], [100, 20]], pressures: [0.1, 0.8], version: 1, isDeleted: false };

describe("session scratch work", () => {
	it("persists editable vector pages, pressure data, viewport and question association", () => {
		const pad = emptyScratchpad("pad-1", "page-1", "chat-1", "question-1");
		pad.pages[0]!.elements = [stroke];
		pad.pages.push({ ...pad.pages[0]!, id: "page-2", name: "Another approach", elements: [] });
		const saved = saveScratchpad(pad);
		assert.equal(saved.revision, 1);
		assert.deepEqual(listScratchpads()[0], saved);
		assert.deepEqual(saved.pages[0]!.elements[0]!.pressures, [0.1, 0.8]);
		assert.equal(saved.questionId, "question-1");
		assert.equal(parseScratchpad({ ...saved, questionId: "functions.quiz:0" }).questionId, "functions.quiz:0");
		pad.pages[0]!.elements[0]!.x = 99;
		assert.equal(saved.pages[0]!.elements[0]!.x, 0, "stored scene is a frozen snapshot, not mutable canvas objects");
	});
	it("rejects stale-device saves and keeps the newer drawing", () => {
		const saved = saveScratchpad(emptyScratchpad("concurrent", "page"));
		saveScratchpad({ ...saved, title: "Newer drawing" });
		assert.throws(() => saveScratchpad({ ...saved, title: "Old device" }), /another device/);
		assert.equal(listScratchpads().find((pad) => pad.id === saved.id)?.title, "Newer drawing");
	});
	it("rejects unsupported embeds, unsafe references, duplicate pages and invalid geometry", () => {
		const pad = emptyScratchpad("validate", "page");
		for (const element of [{ ...stroke, type: "iframe" }, { ...stroke, link: "javascript:alert(1)" }, { ...stroke, x: Infinity }, { ...stroke, width: 1e99 }]) assert.throws(() => parseScratchpad({ ...pad, pages: [{ ...pad.pages[0], elements: [element] }] }));
		assert.throws(() => parseScratchpad({ ...pad, id: "../outside" }));
		assert.throws(() => parseScratchpad({ ...pad, pages: [pad.pages[0], pad.pages[0]] }));
	});
	it("preserves origin identity in the model's evidence description", () => {
		const evidence = parseLearningEvidence({ code: [{ name: "scratch.txt", language: "text", source: "Reasoning" }], source: { kind: "scratchpad", id: "pad-1", pageId: "page-1", sessionId: "chat-1", questionId: "question-1" } });
		assert.match(evidenceDescription(evidence), /question-1/);
		assert.match(evidenceDescription(evidence), /page-1/);
	});
	it("round-trips through the actual save/list routes without an LLM", async () => {
		const response = await PUT(new Request("http://test/scratchpad", { method: "PUT", body: JSON.stringify(emptyScratchpad("api-pad", "api-page")) }));
		assert.equal(response.status, 200);
		assert.ok((await GET().json()).pads.some((pad: { id: string }) => pad.id === "api-pad"));
	});
});

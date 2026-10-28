import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createPairingManager } from "../runner/tablet-service.mjs";
import { emptyScratchpad } from "../src/core/scratchpad.ts";
import { recoverTabletElements, type TabletLink } from "../src/core/tablet.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-tablet-"));
process.env.LH_DATA_DIR = scratch;
const { stores } = await import("../src/server/stores.ts");
const { saveScratchpad, getScratchpad } = await import("../src/server/scratchpad.ts");
const { applyTabletEvent } = await import("../src/server/tablet.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const element = (id: string, version = 1) => ({ id, type: "freedraw", version, versionNonce: 10, x: 0, y: 0, width: 20, height: 10, angle: 0, points: [[0, 0], [20, 10]], pressures: [0.2, 0.8] });

describe("tablet pairing credentials", () => {
	it("expires a code, consumes a valid code once and revokes its scoped token", async () => {
		let now = 1000;
		const manager = createPairingManager(() => now), expired = manager.create("pad", "page");
		now += 120001;
		await assert.rejects(manager.pair(expired.code, "device", async () => ({ link: { expiresAt: now + 10000 } })));
		const created = manager.create("pad", "page");
		const result = await manager.pair(created.code, "device", async (id: string) => ({ link: { id, expiresAt: now + 10000 } }));
		assert.equal(manager.authorize(result.token).id, created.id);
		await assert.rejects(manager.pair(created.code, "device", async () => ({})));
		manager.revoke(created.id); assert.throws(() => manager.authorize(result.token));
	});
	it("limits failed code attempts and rejects unauthenticated access", async () => {
		const manager = createPairingManager(() => 1000);
		for (let index = 0; index < 5; index++) await assert.rejects(manager.pair("bad", "same-device", async () => ({})));
		await assert.rejects(manager.pair("bad", "same-device", async () => ({})), /one minute/);
		assert.throws(() => manager.authorize("not-a-token"));
	});
});

describe("one-page tablet writing lease", () => {
	it("stores acknowledged strokes once, refuses stale sequences, and keeps all other pages unchanged", () => {
		const pad = emptyScratchpad("paired-pad", "page-one", "chat-one", "functions.quiz:0");
		pad.pages.push({ ...pad.pages[0]!, id: "private-page", elements: [element("private-stroke")] });
		const saved = saveScratchpad(pad);
		const link: TabletLink = { version: 1, id: "tablet-one", padId: pad.id, pageId: "page-one", active: true, state: "waiting", expiresAt: Date.now() + 120000, lastSequence: 0 };
		stores.trainingStore.write("tablet-link", link);
		applyTabletEvent({ id: link.id, action: "activate" });
		const frame = { id: link.id, action: "scene", sequence: 1, elements: [element("tablet-stroke")] };
		const first = applyTabletEvent(frame);
		const again = applyTabletEvent(JSON.parse(JSON.stringify(frame)));
		assert.deepEqual(again, first, "lost acknowledgments can replay the same frame without another save");
		assert.equal(getScratchpad(pad.id)?.pages[0]?.elements.length, 1);
		assert.deepEqual(getScratchpad(pad.id)?.pages[1]?.elements, saved.pages[1]?.elements);
		assert.throws(() => applyTabletEvent({ ...frame, elements: [element("different")] }), /sequence/);
		assert.throws(() => applyTabletEvent({ ...frame, sequence: 3 }), /sequence/);
		assert.throws(() => saveScratchpad({ ...getScratchpad(pad.id), title: "Desktop overwrite" }), /Disconnect/);
		applyTabletEvent({ id: link.id, action: "revoke" });
		const editable = saveScratchpad({ ...getScratchpad(pad.id), title: "Desktop resumed" });
		assert.equal(editable.title, "Desktop resumed");
		assert.throws(() => applyTabletEvent({ ...frame, sequence: 2 }), /disconnected/);
	});
	it("recovers offline strokes without dropping independently saved strokes or newer deletions", () => {
		const recovered = recoverTabletElements([element("saved"), { ...element("deleted", 3), isDeleted: true }], [element("offline"), element("deleted", 2)]);
		assert.equal(recovered.length, 3);
		assert.equal(recovered.find((item) => item.id === "deleted")?.isDeleted, true);
	});
});

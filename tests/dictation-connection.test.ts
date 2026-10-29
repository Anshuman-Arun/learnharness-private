import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dictationStatusText } from "../components/dictation.tsx";

describe("dictation capture / network connection feedback", () => {
	it("does not claim the socket is connected before Deepgram opens", () => {
		assert.equal(dictationStatusText("connecting", false), "Requesting microphone");
		assert.equal(dictationStatusText("connecting", true), "Mic on · connecting");
		assert.equal(dictationStatusText("recording", true), "Connected · listening");
		assert.equal(dictationStatusText("stopping", true), "Finishing transcription");
		assert.equal(dictationStatusText("idle", false), "Microphone off");
	});
	it("keeps keyboard stop/voice feedback and an obvious live status surface", () => {
		const ui = readFileSync("components/dictation.tsx", "utf8");
		assert.match(ui, /data-testid="dictation-connection-state"/);
		assert.match(ui, /aria-live="polite"/);
		assert.match(ui, /data-dictation-phase=\{phase\}/);
		assert.match(ui, /levelRef\.current/);
		assert.match(ui, /METER_TICK_MS/);
		assert.match(ui, /onClick=\{toggle\}/);
		assert.match(ui, /selectedMicrophone\(\)/);
	});
});

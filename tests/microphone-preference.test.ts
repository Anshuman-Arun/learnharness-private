import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dictationAudioConstraints } from "../components/dictation.tsx";
import { sanitizeUserSettings } from "../src/core/settings.ts";
import { resolveSettings } from "../src/core/settings-resolution.ts";
import { parseGeneralSettingsBody } from "../src/server/settings-body.ts";

describe("persisted microphone preference", () => {
	it("system default uses no deviceId constraint", () => {
		assert.deepEqual(dictationAudioConstraints(), {
			audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
		});
	});
	it("named microphone is selected exactly and preserves audio processing", () => {
		assert.deepEqual(dictationAudioConstraints("usb-mic-123"), {
			audio: { deviceId: { exact: "usb-mic-123" }, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
		});
	});
	it("general section accepts a microphone and retains auto-update on roundtrip", () => {
		const parsed = parseGeneralSettingsBody({ autoUpdate: false, microphoneId: "usb-mic-123" });
		assert.deepEqual(parsed, { ok: true, settings: { autoUpdate: false, microphoneId: "usb-mic-123" } });
		const stored = sanitizeUserSettings({ version: 1, general: parsed.ok ? parsed.settings : {} });
		assert.equal(stored?.general?.microphoneId, "usb-mic-123");
		assert.equal(resolveSettings(stored).general.microphoneId, "usb-mic-123");
		assert.equal(resolveSettings(stored).general.autoUpdate, false);
	});
	it("default for older records remains the system microphone", () => {
		assert.equal(resolveSettings(sanitizeUserSettings({ version: 1, general: { autoUpdate: true } })).general.microphoneId, "default");
	});
	it("rejects invalid device IDs rather than silently saving them", () => {
		assert.equal(parseGeneralSettingsBody({ microphoneId: "" }).ok, false);
		assert.equal(parseGeneralSettingsBody({ microphoneId: "x".repeat(513) }).ok, false);
		assert.equal(parseGeneralSettingsBody({ microphoneId: "bad\nvalue" }).ok, false);
	});
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dictationAudioConstraints, findMicrophoneByLabel, shouldReconnectDictation } from "../components/dictation.tsx";
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
		const parsed = parseGeneralSettingsBody({ autoUpdate: false, microphoneId: "usb-mic-123", microphoneLabel: "USB Headset" });
		assert.deepEqual(parsed, { ok: true, settings: { autoUpdate: false, microphoneId: "usb-mic-123", microphoneLabel: "USB Headset" } });
		const stored = sanitizeUserSettings({ version: 1, general: parsed.ok ? parsed.settings : {} });
		assert.equal(stored?.general?.microphoneId, "usb-mic-123");
		assert.equal(stored?.general?.microphoneLabel, "USB Headset");
		assert.equal(resolveSettings(stored).general.microphoneId, "usb-mic-123");
		assert.equal(resolveSettings(stored).general.microphoneLabel, "USB Headset");
		assert.equal(resolveSettings(stored).general.autoUpdate, false);
	});
	it("default for older records remains the system microphone", () => {
		assert.equal(resolveSettings(sanitizeUserSettings({ version: 1, general: { autoUpdate: true } })).general.microphoneId, "default");
		assert.equal(resolveSettings(sanitizeUserSettings({ version: 1, general: { autoUpdate: true } })).general.microphoneLabel, "");
	});
	it("rejects invalid device IDs rather than silently saving them", () => {
		assert.equal(parseGeneralSettingsBody({ microphoneId: "" }).ok, false);
		assert.equal(parseGeneralSettingsBody({ microphoneId: "x".repeat(513) }).ok, false);
		assert.equal(parseGeneralSettingsBody({ microphoneId: "bad\nvalue" }).ok, false);
		assert.equal(parseGeneralSettingsBody({ microphoneLabel: "bad\nvalue" }).ok, false);
	});
	it("remaps an origin-specific device ID only when its microphone label is unique", () => {
		const devices: Array<Pick<MediaDeviceInfo, "kind" | "label" | "deviceId">> = [
			{ kind: "audioinput", label: "USB Headset", deviceId: "new-origin-id" },
			{ kind: "audioinput", label: "Laptop Mic", deviceId: "internal-id" },
		];
		assert.equal(findMicrophoneByLabel("USB Headset", devices), "new-origin-id");
		assert.equal(findMicrophoneByLabel("Unknown", devices), undefined);
		assert.equal(findMicrophoneByLabel("USB Headset", [...devices, { kind: "audioinput", label: "USB Headset", deviceId: "duplicate" }]), undefined);
	});
});

describe("dictation lifecycle and Bluetooth startup cases", () => {
	it("never reconnects after learner presses Stop, even on abnormal network close", () => {
		for (const code of [1000, 1001, 1006, 1011, 4000]) {
			assert.equal(shouldReconnectDictation(code, true, 0), false);
		}
	});
	it("allows only one reconnect while actively recording, not on normal closure", () => {
		assert.equal(shouldReconnectDictation(1006, false, 0), true);
		assert.equal(shouldReconnectDictation(1006, false, 1), false);
		assert.equal(shouldReconnectDictation(1000, false, 0), false);
	});
});

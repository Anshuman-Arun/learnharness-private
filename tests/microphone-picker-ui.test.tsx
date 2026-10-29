import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MicrophonePicker } from "../components/settings/microphone-picker.tsx";

describe("editorial microphone picker UI", () => {
  it("offers system default and explicit Detect/Refresh controls",()=>{
    const html=renderToStaticMarkup(<MicrophonePicker value="default" label="" onChange={()=>{}}/>);
    assert.ok(html.includes('data-testid="microphone-preference"'));
    assert.ok(html.includes('data-testid="microphone-select"'));
    assert.ok(html.includes('value="default"'));
    assert.ok(html.includes("System default"));
    assert.ok(html.includes("Detect microphones"));
    assert.ok(html.includes('data-testid="microphone-refresh"'));
  });
  it("never silently swaps an unplugged saved microphone to the system default",()=>{
    const html=renderToStaticMarkup(<MicrophonePicker value="usb-stale-id" label="USB Headset" onChange={()=>{}}/>);
    assert.ok(html.includes('value="usb-stale-id"'));
    assert.ok(html.includes("Saved microphone (not currently detected)"));
    assert.ok(html.includes("Connect it"));
  });
});

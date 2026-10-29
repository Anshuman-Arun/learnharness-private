import React, { act, useState } from "react";
import assert from "node:assert/strict";
import { it } from "node:test";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { EvidenceInput, EvidencePreview } from "../components/learning-evidence.tsx";
import type { LearningEvidence } from "../src/core/learning-evidence.ts";

(globalThis as Record<string, unknown>).React = React;
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzFoAAAAASUVORK5CYII=";

it("previews the actual saved image and source as inert learner work", () => {
	const html = renderToStaticMarkup(<EvidencePreview evidence={{ images: [{ name: "sketch.png", mimeType: "image/png", data: png }], code: [{ name: "main.cpp", language: "cpp", source: "<script>notExecutable()</script>" }] }} />);
	assert.ok(html.includes(`data:image/png;base64,${png}`));
	assert.ok(html.includes("&lt;script&gt;"));
	assert.ok(!html.includes("<script>notExecutable()"));
});

it("adds an image to the pending submission and removes it through real UI events", async () => {
	const { window } = parseHTML("<html><body><div id='root'></div></body></html>");
	const previous = { window: globalThis.window, document: globalThis.document, FileReader: globalThis.FileReader };
	class Reader {
		result = `data:image/png;base64,${png}`;
		onload?: () => void;
		onerror?: () => void;
		readAsDataURL() { queueMicrotask(() => this.onload?.()); }
	}
	Object.assign(globalThis, { window, document: window.document, FileReader: Reader, IS_REACT_ACT_ENVIRONMENT: true });
	let submitted: LearningEvidence | undefined;
	function Harness() {
		const [value, setValue] = useState<LearningEvidence>();
		return <><EvidenceInput value={value} onChange={setValue} /><button id="send" onClick={() => { submitted = value; }}>Submit</button></>;
	}
	const container = window.document.getElementById("root")!;
	const root = createRoot(container as unknown as HTMLElement);
	try {
		await act(async () => root.render(<Harness />));
		const input = container.querySelector('input[type="file"]')!;
		Object.defineProperty(input, "files", { value: [{ name: "sketch.png", type: "image/png", size: 68 }], configurable: true });
		await act(async () => { input.dispatchEvent(new window.Event("change", { bubbles: true })); });
		assert.ok(container.textContent?.includes("sketch.png"));
		await act(async () => container.querySelector<HTMLButtonElement>("#send")!.click());
		assert.equal(submitted?.images?.[0]?.data, png);
		await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Remove sketch.png"]')!.click());
		await act(async () => container.querySelector<HTMLButtonElement>("#send")!.click());
		assert.equal(submitted, undefined);
	} finally {
		await act(async () => root.unmount());
		Object.assign(globalThis, previous);
	}
});

it("keeps code attached while an asynchronous image read is pending", async () => {
	const { window } = parseHTML("<html><body><div id='root'></div></body></html>");
	const previous = { window: globalThis.window, document: globalThis.document, FileReader: globalThis.FileReader };
	let finish: () => void;
	class Reader {
		result = `data:image/png;base64,${png}`;
		onload?: () => void;
		readAsDataURL() { finish = () => this.onload?.(); }
	}
	Object.assign(globalThis, { window, document: window.document, FileReader: Reader, IS_REACT_ACT_ENVIRONMENT: true });
	let current: LearningEvidence | undefined;
	function Harness() {
		const [value, setValue] = useState<LearningEvidence>();
		current = value;
		return <><EvidenceInput value={value} onChange={setValue} /><button id="code" onClick={() => setValue({ ...value, code: [{ name: "main.cpp", language: "cpp", source: "int main(){}" }] })}>Attach code</button></>;
	}
	const root = createRoot(window.document.getElementById("root")! as unknown as HTMLElement);
	try {
		await act(async () => root.render(<Harness />));
		const input = window.document.querySelector('input[type="file"]')!;
		Object.defineProperty(input, "files", { value: [{ name: "sketch.png", type: "image/png", size: 68 }] });
		await act(async () => input.dispatchEvent(new window.Event("change", { bubbles: true })));
		await act(async () => window.document.getElementById("code")!.click());
		assert.equal(current?.code?.length, 1);
		await act(async () => finish());
		assert.equal(current?.images?.length, 1);
		assert.equal(current?.code?.length, 1);
	} finally {
		await act(async () => root.unmount());
		Object.assign(globalThis, previous);
	}
});

import React, { act } from "react";
import assert from "node:assert/strict";
import { it } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { PracticeDock } from "../components/practice-dock.tsx";
import { SessionModel } from "../components/session-core.ts";

Object.assign(globalThis, { React });
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzFoAAAAASUVORK5CYII=";

it("retains practice attachments across a refused POST, prevents duplicates, and clears on acceptance", async () => {
	const { window } = parseHTML("<html><body><div id='root'></div></body></html>");
	const previous = { window: globalThis.window, document: globalThis.document, FileReader: globalThis.FileReader };
	class Reader {
		result = `data:image/png;base64,${png}`;
		onload?: () => void;
		readAsDataURL() { queueMicrotask(() => this.onload?.()); }
	}
	Object.assign(globalThis, { window, document: window.document, FileReader: Reader, IS_REACT_ACT_ENVIRONMENT: true });
	let posts = 0, release: (response: Response) => void;
	const model = new SessionModel({ chatId: "retry", initialMessages: [], fetch: async () => {
		posts++;
		return new Promise<Response>((resolve) => { release = resolve; });
	} });
	// Hold stream reattachment so the successful POST acknowledgment is
	// independently observable and is sufficient to clear the draft.
	let releaseStream!: () => void;
	model.resumeStream = () => new Promise<void>((resolve) => { releaseStream = resolve; });
	const root = createRoot(window.document.getElementById("root")! as unknown as HTMLElement);
	try {
		await act(async () => root.render(<PracticeDock problemCallId="p1" input={{ statement: "Try this" }} expanded onExpand={() => {}} onSubmit={(text, evidence) => new Promise<boolean>((resolve) => {
			void model.send({ type: "thinking", problemCallId: "p1", text, evidence }, () => resolve(true)).then(() => resolve(false));
		})} />));
		const input = window.document.querySelector('input[type="file"]')!;
		Object.defineProperty(input, "files", { value: [{ name: "sketch.png", type: "image/png", size: 68 }] });
		await act(async () => input.dispatchEvent(new window.Event("change", { bubbles: true })));
		const button = window.document.querySelector<HTMLButtonElement>('[data-testid="practice-send"]')!;
		await act(async () => { button.click(); button.click(); });
		assert.equal(posts, 1);
		assert.equal(button.disabled, true);
		await act(async () => release(Response.json({ error: "Choose an image-capable model" }, { status: 400 })));
		assert.ok(window.document.querySelector('button[aria-label="Remove sketch.png"]'));
		assert.equal(model.getState().nativeMessages.length, 0, "refused optimistic work must not survive as a submitted record");
		assert.equal(button.disabled, false);
		await act(async () => button.click());
		assert.equal(posts, 2);
		await act(async () => release(Response.json({ ok: true })));
		assert.equal(window.document.querySelector('button[aria-label="Remove sketch.png"]'), null);
		assert.equal(button.disabled, true, "empty input cannot be resubmitted");
		releaseStream();
	} finally {
		await act(async () => root.unmount());
		Object.assign(globalThis, previous);
	}
});

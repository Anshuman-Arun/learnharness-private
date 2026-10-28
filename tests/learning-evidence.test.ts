import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { parseLearningEvidence, evidenceDescription, type LearningEvidence } from "../src/core/learning-evidence.ts";
import { parseChatInput, inputAppends } from "../src/core/input-events.ts";
import { buildAnswer, compactAnswerForModel } from "../src/core/question-core.ts";
import { newUserMessage, newThinkingMessage, toLlmMessages, type LhMessage } from "../src/core/native-messages.ts";
import { projectView } from "../src/core/view.ts";
import { absorbed } from "../components/session-core.ts";
import { createTeacherAgent } from "../src/agent/teacher-agent.ts";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzFoAAAAASUVORK5CYII=";
const work: LearningEvidence = {
	images: [{ name: "working.png", mimeType: "image/png", data: png }],
	code: [{ name: "main.cpp", language: "cpp", source: "int main() { return 0; }", prediction: "no output", stdout: "", stderr: "" }],
};

describe("submitted learning evidence", () => {
	it("validates and canonicalizes image and code snapshots", () => {
		const parsed = parseLearningEvidence({ ...work, ignored: "not sent" });
		assert.deepEqual(parsed, work);
		assert.notEqual(parsed, work);
		assert.notEqual(parsed?.code?.[0], work.code?.[0]);
		assert.equal(parseLearningEvidence({ images: [], code: [] }), undefined);
	});
	it("rejects invalid image types, signatures, paths, base64, counts and size before any persistence", () => {
		const image = work.images![0]!;
		for (const invalid of [null, [], { images: "bad" },
			{ images: [{ ...image, name: "../keys.png" }] }, { images: [{ ...image, mimeType: "application/pdf" }] },
			{ images: [{ ...image, data: btoa("not an image") }] }, { images: [{ ...image, data: "a===" }] },
			{ images: Array(5).fill(image) }, { images: [{ ...image, data: "A".repeat(7 * 1024 * 1024) }] }]) {
			assert.throws(() => parseChatInput({ type: "text", text: "My work", evidence: invalid }));
		}
	});
	it("rejects empty or unbounded code and returns client output as reported evidence", () => {
		for (const code of [{ name: "../x.cpp", language: "cpp", source: "x" }, { name: "x.cpp", language: "", source: "x" }, { name: "x.cpp", language: "cpp", source: "" }, { name: "x.cpp", language: "cpp", source: "x".repeat(65537) }]) {
			assert.throws(() => parseLearningEvidence({ code: [code] }));
		}
		assert.match(evidenceDescription(work), /client-reported/);
		assert.ok(evidenceDescription(work).includes(work.code![0]!.source));
		assert.ok(!evidenceDescription(work).includes(png), "base64 is not dumped into model-visible prose");
	});
	it("accepts sketch-only messages and practice traces but still rejects empty submissions", () => {
		assert.equal(parseChatInput({ type: "text", text: "", evidence: work }).type, "text");
		assert.equal(parseChatInput({ type: "thinking", problemCallId: "p", text: "", evidence: work }).type, "thinking");
		assert.throws(() => parseChatInput({ type: "text", text: "" }));
		assert.throws(() => parseChatInput({ type: "thinking", problemCallId: "p", text: "" }));
	});
	it("keeps image bytes and dictated reasoning together in the actual question tool result", () => {
		const answer = buildAnswer({ id: "q", kind: "explain", question: "Derive it", mode: "text", options: [], createdAt: "now", committedAnswer: "hidden answer" }, { text: "My dictated reasoning", evidence: work });
		const pending = { ...fauxAssistantMessage([fauxToolCall("explain", { question: "Derive it", correctAnswer: "hidden answer" }, { id: "call-q" })], { stopReason: "toolUse" }), id: "posed" } as LhMessage;
		const input = parseChatInput({ type: "answer", toolCallId: "call-q", answer });
		const appends = inputAppends({ messages: [pending] }, input);
		const roundtrip = JSON.parse(JSON.stringify([pending, ...appends])) as LhMessage[];
		const wire = toLlmMessages(roundtrip);
		const result = wire.find((m) => m.role === "toolResult");
		assert.ok(result && result.role === "toolResult");
		assert.ok(result.content.some((part) => part.type === "image" && part.data === png));
		const text = result.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
		assert.match(text, /My dictated reasoning/);
		assert.match(text, /main.cpp/);
		assert.ok(!text.includes(png));
		assert.equal((compactAnswerForModel(answer).text), "My dictated reasoning");
		assert.equal((appends[0] as { toolCallId?: string }).toolCallId, "call-q");
	});
	it("projects practice evidence into native user image blocks instead of hiding it in details", () => {
		const message = newThinkingMessage("problem-9", "The arrow is my next step", work);
		const wire = toLlmMessages(JSON.parse(JSON.stringify([message])));
		const user = wire[0];
		assert.ok(user && user.role === "user" && Array.isArray(user.content));
		assert.ok(user.content.some((part) => part.type === "image" && part.data === png));
		assert.ok(JSON.stringify(user.content).includes("The arrow is my next step"));
		assert.ok(JSON.stringify(user.content).includes("main.cpp"));
	});
	it("renders the original learner text separately from stored code/image previews and absorbs optimistic copies", () => {
		const message = newUserMessage("Look at this step", work);
		const saved = JSON.parse(JSON.stringify(message));
		const view = projectView([saved]);
		assert.equal(view[0]?.parts[0]?.text, "Look at this step");
		assert.equal(view[0]?.parts[1]?.type, "data-learning-evidence");
		assert.ok(absorbed({ ...message, id: "c_local" }, [saved]));
		const wire = toLlmMessages([message]);
		assert.ok(!("evidence" in wire[0]!), "UI metadata never becomes an extra provider field");
	});
	it("delivers native image content and code to the injected provider on an actual agent turn", async () => {
		const faux = createFauxCore({});
		let observed = false;
		faux.setResponses([(context) => {
			const user = context.messages.find((message) => message.role === "user");
			assert.ok(user?.role === "user" && Array.isArray(user.content));
			assert.ok(user.content.some((part) => part.type === "image" && part.data === png));
			assert.ok(JSON.stringify(user.content).includes(work.code![0]!.source));
			observed = true;
			return fauxAssistantMessage([fauxText("Which step does your arrow represent?")]);
		}]);
		const agent = createTeacherAgent(undefined, { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, messages: [newUserMessage("My reasoning", work)], teachingMode: "guided" });
		await agent.continue();
		assert.ok(observed);
	});
});

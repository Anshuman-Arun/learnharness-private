import React, { act } from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { AnsweredCard } from "../components/answered-card.tsx";
import { TeachingModeControl } from "../components/teaching-mode-control.tsx";
import type { QuestionAnswerData } from "../src/core/question-core.ts";

(globalThis as Record<string, unknown>).React = React;

const answer: QuestionAnswerData = {
	kind: "explain", questionText: "Derive the expectation", options: [], answers: [],
	dontKnow: false, text: "I think it is a sum", committed: "UNREVEALED_SOLUTION_731",
	answeredAt: "2026-10-28T00:00:00Z",
};

describe("guided answer visibility", () => {
	it("keeps a free-response solution out of the rendered page until requested", () => {
		const guided = renderToStaticMarkup(<AnsweredCard answer={answer} teachingMode="guided" />);
		assert.ok(!guided.includes(answer.committed!));
		assert.ok(guided.includes("Show answer"));
		assert.ok(renderToStaticMarkup(<AnsweredCard answer={answer} teachingMode="explain" />).includes(answer.committed!));
	});
	it("does not mark an unselected correct MCQ option after an incorrect attempt", () => {
		const quiz: QuestionAnswerData = { ...answer, kind: "quiz", correct: false, correctIndices: [2], options: [{ index: 1, label: "One" }, { index: 2, label: "Two" }], answers: [{ index: 1, label: "One", value: "one" }], explanation: "SECRET_EXPLANATION_19" };
		const html = renderToStaticMarkup(<AnsweredCard answer={quiz} teachingMode="guided" />);
		assert.ok(!html.includes('data-mark="check"'));
		assert.ok(!html.includes("SECRET_EXPLANATION_19"));
	});
	it("offers both modes with an explicit reversible session scope", () => {
		const html = renderToStaticMarkup(<TeachingModeControl chatId="a" mode="guided" onChange={() => {}} />);
		assert.match(html, /Teaching style/);
		assert.match(html, /value="guided" selected/);
		assert.match(html, /value="explain"/);
		assert.match(html, /switch back at any time/);
	});
	it("preserves correct selected options on a partial multi-select without revealing the rest", () => {
		const quiz: QuestionAnswerData = { ...answer, kind: "quiz", correct: false, correctIndices: [1, 2], options: [{ index: 1, label: "Two" }, { index: 2, label: "Three" }, { index: 3, label: "Four" }], answers: [{ index: 1, label: "Two", value: "two" }], explanation: "SECRET_PARTIAL_EXPLANATION" };
		const html = renderToStaticMarkup(<AnsweredCard answer={quiz} teachingMode="guided" />);
		const { document } = parseHTML(html);
		assert.equal(document.querySelectorAll('[data-mark="check"]').length, 1);
		assert.equal(document.querySelectorAll('[data-mark="x"]').length, 0);
		assert.ok(!html.includes("SECRET_PARTIAL_EXPLANATION"));
		const mixed = renderToStaticMarkup(<AnsweredCard answer={{ ...quiz, answers: [...quiz.answers, { index: 3, label: "Four", value: "four" }] }} teachingMode="guided" />);
		assert.equal(parseHTML(mixed).document.querySelectorAll('[data-mark="x"]').length, 1);
	});
	it("reveals on an actual click and switches the same mounted card between modes", async () => {
		const { window } = parseHTML("<html><body><div id='root'></div></body></html>");
		const prior = { window: globalThis.window, document: globalThis.document };
		Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true });
		const container = window.document.getElementById("root")!;
		const root = createRoot(container as unknown as HTMLElement);
		try {
			await act(async () => root.render(<AnsweredCard answer={answer} teachingMode="guided" />));
			assert.ok(!container.textContent?.includes(answer.committed!));
			await act(async () => container.querySelector("button")!.click());
			assert.ok(container.textContent?.includes(answer.committed!));
			await act(async () => root.render(<AnsweredCard key="fresh" answer={answer} teachingMode="explain" />));
			assert.ok(container.textContent?.includes(answer.committed!));
			await act(async () => root.render(<AnsweredCard key="fresh" answer={answer} teachingMode="guided" />));
			assert.ok(!container.textContent?.includes(answer.committed!), "Guided can be reenabled without leaving the session");
		} finally {
			await act(async () => root.unmount());
			Object.assign(globalThis, prior);
		}
	});
});

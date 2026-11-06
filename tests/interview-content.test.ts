import assert from "node:assert/strict";
import { it } from "node:test";
import { interviewQuestion, examQuestions, type QuantExam } from "../src/core/index.ts";
it("conditions on ordered dice outcomes rather than equally weighting verbal categories", () => {
	for (let seed = 0; seed < 30; seed++) {
		const q = interviewQuestion("probability", seed, 2);
		const n = Number(q.prompt.match(/(\d+)-sided/)![1]);
		const allowed = [];
		for (let a = 1; a <= n; a++) for (let b = 1; b <= n; b++) if (a === n || b === n) allowed.push([a, b]);
		assert.equal(
			q.expected,
			allowed.filter(([a, b]) => (a ?? 0) + (b ?? 0) === n + 1).length / allowed.length,
		);
	}
});
it("keeps legacy saved question generation stable while new exams use the reasoning bank", () => {
	const old: QuantExam = {
		version: 1,
		id: "old",
		seed: 21,
		config: { counts: { arithmetic: 2, probability: 2, reasoning: 2 }, durationSeconds: 60 },
		revision: 0,
		startedAt: 0,
		deadline: 60000,
		responses: {},
	};
	const before = examQuestions(old);
	assert.equal(before[0]!.question.family === "compound-return", false);
	const upgraded = examQuestions({ ...old, questionVersion: 2 });
	assert.equal(upgraded[0]!.question.family, "compound-return");
	assert.deepEqual(examQuestions(old), before);
});
it("agrees with exhaustive Bellman enumeration for the three-roll decision case", () => {
	const q = interviewQuestion("reasoning", 42, 3);
	let total = 0;
	for (let a = 1; a <= 6; a++)
		for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) total += a >= 4.25 ? a : b >= 3.5 ? b : c;
	assert.equal(q.expected, total / 216);
});

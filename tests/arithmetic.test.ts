import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { arithmeticQuestion, answerArithmetic, startArithmeticRound, arithmeticSummary, parseArithmeticConfig, DEFAULT_ARITHMETIC_CONFIG } from "../src/core/arithmetic.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-arithmetic-"));
process.env.LH_DATA_DIR = scratch;
const { changeArithmeticRound, listArithmeticRounds } = await import("../src/server/arithmetic.ts");
const { trainingStore } = await import("../src/store/training.ts");
const { GET, POST } = await import("../app/api/training/arithmetic/route.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

describe("arithmetic generation and clock", () => {
	it("reproduces questions across reloads and generates exact small-divisor division", () => {
		const config = parseArithmeticConfig({ ...DEFAULT_ARITHMETIC_CONFIG, operations: ["division"], multiplierRange: [2, 2] });
		for (let index = 0; index < 300; index++) {
			const question = arithmeticQuestion(config, 123, index);
			assert.deepEqual(question, arithmeticQuestion(JSON.parse(JSON.stringify(config)), 123, index));
			assert.match(question.display, / ÷ 2$/);
			assert.equal(Number(question.display.split(" ÷ ")[0]) / 2, question.answer);
			assert.ok(Number.isInteger(question.answer) && question.answer >= 2 && question.answer <= 100);
		}
	});
	it("rejects invalid operations, empty ranges, zero divisors and invalid durations", () => {
		for (const config of [{ operations: [] }, { operations: ["powers"] }, { operations: ["division", "division"] }, { multiplierRange: [0, 12] }, { addRange: [9, 2] }, { durationSeconds: 0 }, { durationSeconds: Infinity }]) assert.throws(() => parseArithmeticConfig({ ...DEFAULT_ARITHMETIC_CONFIG, ...config }));
	});
	it("keeps wrong attempts on the same question and refuses duplicate completed submissions", () => {
		let round = startArithmeticRound("test", DEFAULT_ARITHMETIC_CONFIG, 42, 1000);
		const question = arithmeticQuestion(round.config, round.seed, 0);
		round = answerArithmetic(round, String(question.answer + 1), 0, 1500);
		assert.equal(round.index, 0); assert.equal(round.attempts[0]?.correct, false);
		round = answerArithmetic(round, String(question.answer), 0, 2000);
		assert.equal(round.index, 1); assert.equal(round.attempts[1]?.elapsedMs, 1000);
		assert.throws(() => answerArithmetic(round, String(question.answer), 0, 2100), /already answered/);
		assert.throws(() => answerArithmetic(round, "NaN", 1, 2100));
	});
	it("uses the original deadline, never accepts an answer at expiry, and computes honest rates", () => {
		const start = startArithmeticRound("clock", { ...DEFAULT_ARITHMETIC_CONFIG, durationSeconds: 15 }, 1, 1000);
		const question = arithmeticQuestion(start.config, start.seed, 0);
		let round = answerArithmetic(start, String(question.answer), 0, 2000);
		round = answerArithmetic(JSON.parse(JSON.stringify(round)), "12", 1, 16000);
		assert.equal(round.endedAt, 16000); assert.equal(round.attempts.length, 1);
		const summary = arithmeticSummary(round, 999999);
		assert.equal(summary.perMinute, 4); assert.equal(summary.accuracy, 1);
	});
});

describe("local arithmetic service", () => {
	it("persists an entire round, resumes its question, and prevents two active rounds", () => {
		const round = changeArithmeticRound({ action: "start", config: DEFAULT_ARITHMETIC_CONFIG }, 1000);
		assert.throws(() => changeArithmeticRound({ action: "start", config: DEFAULT_ARITHMETIC_CONFIG }, 1100), /active round/);
		const question = arithmeticQuestion(round.config, round.seed, round.index);
		const answered = changeArithmeticRound({ action: "answer", id: round.id, index: 0, answer: String(question.answer) }, 2000);
		assert.deepEqual(listArithmeticRounds()[0], answered);
		assert.equal(answered.index, 1);
		const stopped = changeArithmeticRound({ action: "stop", id: round.id }, 2500);
		assert.equal(stopped.endedAt, 2500);
	});
	it("keeps storage within the training root and refuses future schemas without overwriting them", () => {
		assert.throws(() => trainingStore.read("arithmetic", "../../auth"));
		assert.throws(() => trainingStore.read("../../elsewhere", "id"));
		const file = path.join(scratch, "training", "arithmetic", "future.json");
		fs.writeFileSync(file, '{"version":99,"id":"future"}');
		assert.throws(() => trainingStore.write("arithmetic", { version: 1, id: "future" }), /Unsupported/);
		assert.equal(fs.readFileSync(file, "utf8"), '{"version":99,"id":"future"}');
		fs.unlinkSync(file);
	});
	it("exposes real API start, answer and history operations without model credentials", async () => {
		const action = (body: unknown) => POST(new Request("http://test/arithmetic", { method: "POST", body: JSON.stringify(body) }));
		const response = await action({ action: "start", config: DEFAULT_ARITHMETIC_CONFIG });
		assert.equal(response.status, 200);
		const { round } = await response.json();
		const question = arithmeticQuestion(round.config, round.seed, 0);
		const submitted = await action({ action: "answer", id: round.id, index: 0, answer: String(question.answer) });
		assert.equal(submitted.status, 200); assert.equal((await submitted.json()).round.index, 1);
		const history = await GET().json();
		assert.ok(history.rounds.some((item: { id: string }) => item.id === round.id));
		assert.equal((await action({ action: "answer", id: round.id, index: 0, answer: "3" })).status, 400);
		await action({ action: "stop", id: round.id });
	});
});

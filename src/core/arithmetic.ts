/** Question generation adapted from YYZ-CR/zetamac-trainer js/game.js,
 * e81041507c69a8b3154be3cb3f85c0ac3fd7ae34 (MIT; notice in third-party/). */
export const ARITHMETIC_OPERATIONS = ["addition", "subtraction", "multiplication", "division"] as const;
export type ArithmeticOperation = (typeof ARITHMETIC_OPERATIONS)[number];
export interface ArithmeticConfig {
	operations: ArithmeticOperation[];
	addRange: [number, number];
	multiplierRange: [number, number];
	multiplicandRange: [number, number];
	durationSeconds: number;
}
export const DEFAULT_ARITHMETIC_CONFIG: ArithmeticConfig = {
	operations: [...ARITHMETIC_OPERATIONS], addRange: [2, 100], multiplierRange: [2, 12], multiplicandRange: [2, 100], durationSeconds: 120,
};
export interface ArithmeticAttempt {
	index: number; operation: ArithmeticOperation; question: string; expected: number; answer: number;
	correct: boolean; elapsedMs: number; submittedAt: number;
}
export interface ArithmeticRound {
	version: 1; id: string; config: ArithmeticConfig; seed: number; startedAt: number; deadline: number;
	questionStartedAt: number; index: number; attempts: ArithmeticAttempt[]; endedAt?: number;
}
export function parseArithmeticConfig(raw: unknown): ArithmeticConfig {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Arithmetic settings are required");
	const c = raw as ArithmeticConfig;
	if (!Array.isArray(c.operations) || !c.operations.length || c.operations.length > 4 || new Set(c.operations).size !== c.operations.length || c.operations.some((op) => !ARITHMETIC_OPERATIONS.includes(op))) throw new Error("Select one or more distinct arithmetic operations");
	for (const [range, floor] of [[c.addRange, 0], [c.multiplierRange, 1], [c.multiplicandRange, 0]] as const) {
		if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isSafeInteger) || range[0] < floor || range[1] < range[0] || range[1] > 10000) throw new Error("Ranges must be ordered integers up to 10000; divisors must be positive");
	}
	if (!Number.isInteger(c.durationSeconds) || c.durationSeconds < 15 || c.durationSeconds > 1800) throw new Error("Duration must be 15–1800 seconds");
	return { operations: [...c.operations], addRange: [...c.addRange], multiplierRange: [...c.multiplierRange], multiplicandRange: [...c.multiplicandRange], durationSeconds: c.durationSeconds };
}
/** Each index has an independent deterministic stream, so reload cannot change a question. */
export function arithmeticQuestion(config: ArithmeticConfig, seed: number, index: number) {
	let state = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
	const random = () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
	const integer = ([min, max]: [number, number]) => min + Math.floor(random() * (max - min + 1));
	const operation = config.operations[Math.floor(random() * config.operations.length)]!;
	if (operation === "addition" || operation === "subtraction") {
		const a = integer(config.addRange), b = integer(config.addRange);
		return operation === "addition" ? { operation, display: `${a} + ${b}`, answer: a + b }
			: { operation, display: `${a + b} − ${a}`, answer: b };
	}
	const a = integer(config.multiplierRange), b = integer(config.multiplicandRange);
	return operation === "multiplication" ? { operation, display: `${a} × ${b}`, answer: a * b }
		: { operation, display: `${a * b} ÷ ${a}`, answer: b };
}
export function startArithmeticRound(id: string, config: unknown, seed: number, now: number): ArithmeticRound {
	const parsed = parseArithmeticConfig(config);
	return { version: 1, id, config: parsed, seed: seed >>> 0, startedAt: now, deadline: now + parsed.durationSeconds * 1000, questionStartedAt: now, index: 0, attempts: [] };
}
export function answerArithmetic(round: ArithmeticRound, answer: unknown, index: unknown, now: number): ArithmeticRound {
	if (round.endedAt !== undefined) throw new Error("This round has ended");
	if (now >= round.deadline) return { ...round, endedAt: round.deadline };
	if (round.index !== index) throw new Error("This question was already answered; refresh the round");
	if (typeof answer !== "string" || !/^-?\d{1,12}$/.test(answer.trim())) throw new Error("Enter an integer answer");
	if (round.attempts.length >= 10000) throw new Error("Round attempt limit reached");
	const question = arithmeticQuestion(round.config, round.seed, round.index);
	const value = Number(answer.trim()), correct = value === question.answer;
	return { ...round, index: round.index + (correct ? 1 : 0), questionStartedAt: correct ? now : round.questionStartedAt,
		attempts: [...round.attempts, { index: round.index, operation: question.operation, question: question.display, expected: question.answer, answer: value, correct, elapsedMs: Math.max(0, now - round.questionStartedAt), submittedAt: now }] };
}
export function arithmeticSummary(round: ArithmeticRound, now = Date.now()) {
	const correct = round.attempts.filter((attempt) => attempt.correct);
	const seconds = Math.max(1, (Math.min(round.endedAt ?? now, round.deadline) - round.startedAt) / 1000);
	return { correct: correct.length, accuracy: round.attempts.length ? correct.length / round.attempts.length : null,
		perMinute: correct.length * 60 / seconds,
		operations: ARITHMETIC_OPERATIONS.map((operation) => {
			const attempts = round.attempts.filter((attempt) => attempt.operation === operation);
			const times = attempts.filter((attempt) => attempt.correct).map((attempt) => attempt.elapsedMs).sort((a, b) => a - b);
			return { operation, attempts: attempts.length, correct: times.length, medianMs: times.length ? (times[Math.floor((times.length - 1) / 2)]! + times[Math.floor(times.length / 2)]!) / 2 : null };
		}) };
}

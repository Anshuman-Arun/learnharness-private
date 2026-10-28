import { answerArithmetic, startArithmeticRound, type ArithmeticRound } from "../core/arithmetic.ts";
import { stores } from "./stores.ts";

export function listArithmeticRounds(): ArithmeticRound[] {
	return stores.trainingStore.list<ArithmeticRound>("arithmetic").sort((a, b) => b.startedAt - a.startedAt).slice(0, 100);
}
export function changeArithmeticRound(body: unknown, now = Date.now()): ArithmeticRound {
	if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid arithmetic action");
	const input = body as Record<string, unknown>;
	if (input.action === "start") {
		const active = listArithmeticRounds().find((round) => round.endedAt === undefined && round.deadline > now);
		if (active) throw new Error("Finish or stop your active round before starting another");
		const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
		const round = startArithmeticRound(crypto.randomUUID(), input.config, seed, now);
		stores.trainingStore.write("arithmetic", round);
		return round;
	}
	if (typeof input.id !== "string") throw new Error("Round id is required");
	const round = stores.trainingStore.read<ArithmeticRound>("arithmetic", input.id);
	if (!round) throw new Error("Round not found");
	const next = input.action === "answer" ? answerArithmetic(round, input.answer, input.index, now)
		: input.action === "stop" ? { ...round, endedAt: round.endedAt ?? Math.min(now, round.deadline) }
		: (() => { throw new Error("Unknown arithmetic action"); })();
	stores.trainingStore.write("arithmetic", next);
	return next;
}

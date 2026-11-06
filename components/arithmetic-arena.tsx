"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, RotateCcw, Settings2 } from "lucide-react";
import {
	ARITHMETIC_OPERATIONS,
	DEFAULT_ARITHMETIC_CONFIG,
	arithmeticQuestion,
	arithmeticSummary,
	answerArithmetic,
	parseArithmeticConfig,
	type ArithmeticConfig,
	type ArithmeticRound,
	type ArithmeticInput,
} from "@/src/core";

const DRAFT = "lh:arithmetic:unsynced";
const presets = [
	{ name: "Mixed", config: DEFAULT_ARITHMETIC_CONFIG },
	{
		name: "Multiplication",
		config: {
			...DEFAULT_ARITHMETIC_CONFIG,
			operations: ["multiplication"] as ArithmeticConfig["operations"],
		},
	},
	{
		name: "Addition",
		config: { ...DEFAULT_ARITHMETIC_CONFIG, operations: ["addition"] as ArithmeticConfig["operations"] },
	},
];
export function ArithmeticArena() {
	const [config, setConfig] = useState<ArithmeticConfig>(DEFAULT_ARITHMETIC_CONFIG);
	const [rounds, setRounds] = useState<ArithmeticRound[]>([]),
		[round, setRound] = useState<ArithmeticRound>();
	const [answer, setAnswer] = useState(""),
		[now, setNow] = useState(Date.now()),
		[loading, setLoading] = useState(true);
	const [starting, setStarting] = useState(false),
		[error, setError] = useState<string>(),
		[pending, setPending] = useState(0);
	const [settings, setSettings] = useState(false),
		[incorrect, setIncorrect] = useState(false);
	const current = useRef<ArithmeticRound | undefined>(undefined),
		queue = useRef<ArithmeticInput[]>([]),
		finishAt = useRef<number | undefined>(undefined);
	const retryAt = useRef(0),
		failures = useRef(0);
	const sending = useRef(false),
		offset = useRef(0),
		input = useRef<HTMLInputElement>(null),
		alive = useRef(true);
	function adopt(value: ArithmeticRound) {
		current.current = value;
		setRound(value);
	}
	function persist() {
		try {
			if (!queue.current.length && finishAt.current === undefined) localStorage.removeItem(DRAFT);
			else
				localStorage.setItem(
					DRAFT,
					JSON.stringify({ round: current.current, attempts: queue.current, finishAt: finishAt.current }),
				);
		} catch {
			setError("Local recovery is unavailable. Keep this tab open until saved.");
		}
	}
	async function flush() {
		if (
			Date.now() < retryAt.current ||
			sending.current ||
			!current.current ||
			(!queue.current.length && finishAt.current === undefined)
		)
			return;
		sending.current = true;
		const id = current.current.id,
			batch = queue.current.slice(0, 500),
			finish = queue.current.length <= 500 ? finishAt.current : undefined;
		try {
			const response = await fetch("/api/training/arithmetic", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "sync",
					id,
					attempts: batch,
					...(finish !== undefined ? { finishAt: finish } : {}),
				}),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error ?? "Could not save the round");
			if (current.current?.id !== id || !alive.current) return;
			queue.current = queue.current.slice(batch.length);
			if (finish !== undefined) finishAt.current = undefined;
			setPending(queue.current.length);
			persist();
			setError(undefined);
			failures.current = 0;
			retryAt.current = 0;
			setRounds((previous) => [data.round, ...previous.filter((item) => item.id !== id)].slice(0, 100));
		} catch (cause) {
			retryAt.current = Date.now() + Math.min(30000, 1000 * 2 ** Math.min(5, failures.current++));
			if (alive.current)
				setError(
					cause instanceof Error ? cause.message : "Offline. Your answers are retained on this device.",
				);
		} finally {
			sending.current = false;
		}
	}
	useEffect(() => {
		alive.current = true;
		const controller = new AbortController();
		void fetch("/api/training/arithmetic", { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error("Could not load rounds");
				const data = await response.json();
				offset.current = data.serverNow - Date.now();
				setNow(data.serverNow);
				setRounds(data.rounds);
				let initial: ArithmeticRound | undefined =
					data.rounds.find((r: ArithmeticRound) => r.endedAt === undefined && r.deadline > data.serverNow) ??
					data.rounds[0];
				try {
					const raw = localStorage.getItem(DRAFT);
					if (raw) {
						const saved = JSON.parse(raw);
						parseArithmeticConfig(saved.round.config);
						if (
							Array.isArray(saved.attempts) &&
							saved.attempts.length <= 10000 &&
							Array.isArray(saved.round.attempts) &&
							saved.round.attempts.length <= 10000 &&
							Number.isFinite(saved.round.deadline) &&
							data.rounds.some((r: ArithmeticRound) => r.id === saved.round.id && r.seed === saved.round.seed)
						) {
							initial = saved.round;
							queue.current = saved.attempts;
							finishAt.current = saved.finishAt;
							setPending(saved.attempts.length);
						}
					}
				} catch {
					setError("Could not recover a local draft. Server-saved rounds are still available.");
				}
				if (initial) {
					adopt(initial);
					setConfig(initial.config);
				}
			})
			.catch((cause) => {
				if (!controller.signal.aborted) setError(cause.message);
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});
		const timer = setInterval(() => {
			setNow(Date.now() + offset.current);
			void flush();
		}, 200);
		const online = () => {
			retryAt.current = 0;
			void flush();
		};
		window.addEventListener("online", online);
		return () => {
			alive.current = false;
			controller.abort();
			clearInterval(timer);
			window.removeEventListener("online", online);
		};
	}, []);
	const active = !!round && round.endedAt === undefined && now < round.deadline;
	useEffect(() => {
		if (active) input.current?.focus({ preventScroll: true });
	}, [round?.id, active]);
	useEffect(() => {
		if (round && round.endedAt === undefined && now >= round.deadline) finish(round.deadline);
	}, [now, round?.id, round?.endedAt]);
	function finish(at = Math.min(Date.now() + offset.current, current.current?.deadline ?? Infinity)) {
		if (!current.current || current.current.endedAt !== undefined) return;
		finishAt.current = at;
		adopt({ ...current.current, endedAt: at });
		persist();
		void flush();
	}
	function submit(value: string, explicit = false) {
		const r = current.current,
			at = Date.now() + offset.current;
		if (!r || r.endedAt !== undefined || at >= r.deadline || !/^-?\d{1,12}$/.test(value)) return;
		const q = arithmeticQuestion(r.config, r.seed, r.index);
		if (Number(value) !== q.answer && !explicit) return;
		const next = answerArithmetic(r, value, r.index, at);
		queue.current.push({ ordinal: r.attempts.length, index: r.index, answer: value, at });
		adopt(next);
		setPending(queue.current.length);
		setIncorrect(Number(value) !== q.answer);
		if (Number(value) === q.answer) setAnswer("");
		persist();
		void flush();
	}
	async function start() {
		if (starting || queue.current.length || finishAt.current !== undefined) return;
		setStarting(true);
		setError(undefined);
		try {
			const response = await fetch("/api/training/arithmetic", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "start", config }),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error);
			offset.current = data.serverNow - Date.now();
			setNow(data.serverNow);
			adopt(data.round);
			setAnswer("");
			setIncorrect(false);
			setSettings(false);
		} catch (cause) {
			setError((cause as Error).message);
		} finally {
			setStarting(false);
		}
	}
	if (loading)
		return (
			<div className="study-empty" role="status">
				Loading…
			</div>
		);
	const summary = round ? arithmeticSummary(round, now) : undefined;
	const question = round ? arithmeticQuestion(round.config, round.seed, round.index) : undefined;
	return (
		<div className="arithmetic-product">
			{error && (
				<div className="study-notice" role="alert">
					{error}
					<button
						onClick={() => {
							retryAt.current = 0;
							void flush();
						}}
					>
						Retry save
					</button>
					{!active && (pending > 0 || finishAt.current !== undefined) && (
						<>
							<button
								onClick={() => {
									const data = new Blob(
										[JSON.stringify({ round: current.current, attempts: queue.current }, null, 2)],
										{ type: "application/json" },
									);
									const url = URL.createObjectURL(data),
										link = document.createElement("a");
									link.href = url;
									link.download = "arithmetic-local-round.json";
									link.click();
									setTimeout(() => URL.revokeObjectURL(url), 1000);
								}}
							>
								Export local round
							</button>
							<button
								disabled={sending.current}
								onClick={() => {
									if (
										!window.confirm(
											"Continue without saving this round? Export it first if you want to keep the local result.",
										)
									)
										return;
									queue.current = [];
									finishAt.current = undefined;
									setPending(0);
									localStorage.removeItem(DRAFT);
									setError(undefined);
								}}
							>
								Continue without saving
							</button>
						</>
					)}
				</div>
			)}
			{active && round && question ? (
				<section className="arithmetic-stage" aria-label="Arithmetic round">
					<div className="arithmetic-meta">
						<span>{summary?.correct} correct</span>
						<span role="timer" className="tabular-nums">
							{Math.max(0, Math.ceil((round.deadline - now) / 1000))}s
						</span>
					</div>
					<div className="arithmetic-problem" id="arithmetic-problem">
						{question.display}
					</div>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							submit(answer, true);
						}}
					>
						<input
							ref={input}
							aria-label="Arithmetic answer"
							aria-describedby="arithmetic-problem"
							autoComplete="off"
							spellCheck={false}
							inputMode="numeric"
							value={answer}
							onChange={(e) => {
								const value = e.target.value;
								if (!/^-?\d{0,12}$/.test(value)) return;
								setAnswer(value);
								setIncorrect(false);
								submit(value);
							}}
							onKeyDown={(e) => {
								if (e.key === "Escape") finish();
							}}
							className="arithmetic-answer"
						/>
					</form>
					<div className="arithmetic-footer">
						<span aria-live="polite">
							{incorrect ? "Try again" : "Correct answers advance automatically"}
						</span>
						<button onClick={() => finish()}>End round</button>
					</div>
				</section>
			) : (
				<>
					{round && summary && (
						<section className="arithmetic-results study-enter">
							<div className="flex items-baseline gap-3">
								<strong className="text-4xl tabular-nums font-normal">{summary.correct}</strong>
								<span className="text-muted-foreground">correct</span>
							</div>
							<p className="mt-2 text-sm text-muted-foreground">
								{summary.perMinute.toFixed(1)}/min <span className="mx-3">·</span>
								{summary.accuracy === null
									? "No attempts"
									: `${Math.round(summary.accuracy * 100)}% accuracy`}
							</p>
						</section>
					)}
					<div className="arithmetic-setup">
						<div className="study-segments" aria-label="Arithmetic preset">
							{presets.map((p) => (
								<button
									key={p.name}
									aria-pressed={JSON.stringify(p.config.operations) === JSON.stringify(config.operations)}
									onClick={() => setConfig({ ...p.config, durationSeconds: config.durationSeconds })}
								>
									{p.name}
								</button>
							))}
						</div>
						<div className="study-segments" aria-label="Round duration">
							{[30, 60, 120].map((seconds) => (
								<button
									key={seconds}
									aria-pressed={config.durationSeconds === seconds}
									onClick={() => setConfig({ ...config, durationSeconds: seconds })}
								>
									{seconds}s
								</button>
							))}
						</div>
						<button
							className="study-primary"
							disabled={starting || pending > 0 || finishAt.current !== undefined}
							onClick={() => void start()}
						>
							{round ? <RotateCcw size={14} /> : <ArrowRight size={14} />}
							{round ? "Again" : "Start"}
						</button>
						<button
							className="study-icon-button"
							aria-label="Round settings"
							aria-expanded={settings}
							onClick={() => setSettings(!settings)}
						>
							<Settings2 size={16} />
						</button>
					</div>
					{settings && (
						<section className="study-panel study-enter">
							<fieldset className="flex flex-wrap gap-5">
								<legend>Operations</legend>
								{ARITHMETIC_OPERATIONS.map((op) => (
									<label key={op} className="flex items-center gap-2">
										<input
											type="checkbox"
											checked={config.operations.includes(op)}
											onChange={(e) =>
												setConfig({
													...config,
													operations: e.target.checked
														? [...config.operations, op]
														: config.operations.filter((v) => v !== op),
												})
											}
										/>
										{op}
									</label>
								))}
							</fieldset>
							<div className="mt-5 grid gap-5 sm:grid-cols-3">
								{(
									[
										["addRange", "Add / subtract"],
										["multiplierRange", "Multiplier / divisor"],
										["multiplicandRange", "Multiplicand / quotient"],
									] as const
								).map(([key, label]) => (
									<fieldset key={key}>
										<legend>{label}</legend>
										<div className="mt-2 flex items-center gap-2">
											{([0, 1] as const).map((i) => (
												<input
													key={i}
													aria-label={`${label} ${i ? "maximum" : "minimum"}`}
													type="number"
													value={config[key][i]}
													onChange={(e) => {
														const range: [number, number] = [...config[key]];
														range[i] = Number(e.target.value);
														setConfig({ ...config, [key]: range });
													}}
												/>
											))}
										</div>
									</fieldset>
								))}
							</div>
						</section>
					)}
					{summary && round && (
						<section className="study-panel">
							<h2>Breakdown</h2>
							<table className="study-table mt-3">
								<thead>
									<tr>
										<th>Operation</th>
										<th className="text-right">Correct</th>
										<th className="text-right">Median</th>
									</tr>
								</thead>
								<tbody>
									{summary.operations
										.filter((row) => row.attempts)
										.map((row) => (
											<tr key={row.operation}>
												<td>{row.operation}</td>
												<td className="text-right">
													{row.correct}/{row.attempts}
												</td>
												<td className="text-right">
													{row.medianMs === null ? "—" : `${(row.medianMs / 1000).toFixed(2)}s`}
												</td>
											</tr>
										))}
								</tbody>
							</table>
							{round.attempts.some((a) => !a.correct) && (
								<details className="mt-4">
									<summary>Missed answers</summary>
									<div className="mt-3 space-y-2">
										{round.attempts
											.filter((a) => !a.correct)
											.map((a, i) => (
												<p key={i} className="text-sm">
													{a.question} = {a.expected}
													<span className="ml-4 text-muted-foreground">entered {a.answer}</span>
												</p>
											))}
									</div>
								</details>
							)}
						</section>
					)}
					{rounds.length > 0 && (
						<section className="study-panel">
							<h2>Recent rounds</h2>
							<div className="mt-2">
								{rounds
									.filter((r) => r.endedAt !== undefined || r.deadline <= now)
									.slice(0, 6)
									.map((r) => (
										<button
											className="study-history-row"
											key={r.id}
											onClick={() => {
												if (!queue.current.length && finishAt.current === undefined) adopt(r);
											}}
										>
											<span>
												{new Date(r.startedAt).toLocaleDateString(undefined, {
													month: "short",
													day: "numeric",
												})}
												<span className="ml-4 text-muted-foreground">{r.config.durationSeconds}s</span>
											</span>
											<span>{r.index} correct</span>
										</button>
									))}
							</div>
						</section>
					)}
				</>
			)}
			<span className="study-save-state" role="status">
				{pending ? `${pending} unsaved` : round ? "Saved" : ""}
			</span>
		</div>
	);
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ARITHMETIC_OPERATIONS, DEFAULT_ARITHMETIC_CONFIG, arithmeticQuestion, arithmeticSummary, type ArithmeticConfig, type ArithmeticRound } from "@/src/core";

export function ArithmeticArena() {
	const [config, setConfig] = useState<ArithmeticConfig>(DEFAULT_ARITHMETIC_CONFIG);
	const [rounds, setRounds] = useState<ArithmeticRound[]>([]);
	const [round, setRound] = useState<ArithmeticRound>();
	const [answer, setAnswer] = useState("");
	const [now, setNow] = useState(Date.now());
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string>();
	const lock = useRef(false), offset = useRef(0), input = useRef<HTMLInputElement>(null);
	useEffect(() => {
		const controller = new AbortController();
		void fetch("/api/training/arithmetic", { signal: controller.signal }).then(async (response) => {
			if (!response.ok) throw new Error("Could not load arithmetic history");
			const data = await response.json() as { rounds: ArithmeticRound[]; serverNow: number };
			offset.current = data.serverNow - Date.now(); setNow(data.serverNow);
			setRounds(data.rounds); setRound(data.rounds.find((item) => !item.endedAt && item.deadline > data.serverNow) ?? data.rounds[0]);
		}).catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
		const timer = setInterval(() => setNow(Date.now() + offset.current), 100);
		return () => { controller.abort(); clearInterval(timer); };
	}, []);
	const active = !!round && round.endedAt === undefined && now < round.deadline;
	const question = round ? arithmeticQuestion(round.config, round.seed, round.index) : undefined;
	const summary = round ? arithmeticSummary(round, now) : undefined;
	async function act(body: unknown) {
		if (lock.current) return;
		lock.current = true; setSaving(true); setError(undefined);
		try {
			const response = await fetch("/api/training/arithmetic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
			const data = await response.json() as { round?: ArithmeticRound; error?: string; serverNow: number };
			if (!response.ok || !data.round) throw new Error(data.error ?? "Could not save round");
			offset.current = data.serverNow - Date.now(); setNow(data.serverNow);
			setRound(data.round); setRounds((previous) => [data.round!, ...previous.filter((item) => item.id !== data.round!.id)].slice(0, 100));
			setAnswer("");
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save round"); }
		finally { lock.current = false; setSaving(false); setTimeout(() => input.current?.focus(), 0); }
	}
	if (loading) return <p role="status">Loading rounds…</p>;
	return <div className="space-y-5">
		{error && <p role="alert" className="text-destructive">{error}</p>}
		{active && round && question ? <section className="space-y-4 rounded-xl border p-5">
			<div className="flex justify-between"><span>Correct: {summary?.correct}</span><span role="timer">{Math.max(0, Math.ceil((round.deadline - now) / 1000))} seconds</span></div>
			<div className="text-center font-mono text-4xl" aria-live="polite">{question.display} =</div>
			<form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (answer.trim()) void act({ action: "answer", id: round.id, index: round.index, answer }); }}>
				<input ref={input} autoFocus aria-label="Arithmetic answer" inputMode="numeric" value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={saving} className="min-w-0 flex-1 rounded border bg-background p-3 font-mono text-xl" />
				<button disabled={saving || !answer.trim()} className="rounded border px-4">Submit</button>
			</form>
			{round.attempts.at(-1)?.correct === false && round.attempts.at(-1)?.index === round.index && <p role="status">Try again.</p>}
			<button disabled={saving} onClick={() => void act({ action: "stop", id: round.id })} className="text-sm underline">End round</button>
		</section> : <form className="space-y-4 rounded-xl border p-5" onSubmit={(event) => { event.preventDefault(); void act({ action: "start", config }); }}>
			<fieldset className="flex flex-wrap gap-4"><legend className="mb-2 font-medium">Operations</legend>{ARITHMETIC_OPERATIONS.map((operation) => <label key={operation} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={config.operations.includes(operation)} onChange={(event) => setConfig({ ...config, operations: event.target.checked ? [...config.operations, operation] : config.operations.filter((op) => op !== operation) })} />{operation}</label>)}</fieldset>
			{([['addRange', 'Addition/subtraction operands'], ['multiplierRange', 'Multiplier/divisor'], ['multiplicandRange', 'Multiplicand/quotient']] as const).map(([key, label]) => <fieldset key={key} className="flex flex-wrap items-center gap-2"><legend className="text-sm">{label}</legend>{([0, 1] as const).map((index) => <label key={index} className="text-xs">{index === 0 ? "Min" : "Max"}<input type="number" min={key === "multiplierRange" ? 1 : 0} max={10000} aria-label={`${label} ${index === 0 ? "minimum" : "maximum"}`} value={config[key][index]} onChange={(event) => { const range: [number, number] = [...config[key]]; range[index] = Number(event.target.value); setConfig({ ...config, [key]: range }); }} className="ml-2 w-24 rounded border bg-background p-1" /></label>)}</fieldset>)}
			<label className="block text-sm">Duration (seconds)<input type="number" min={15} max={1800} value={config.durationSeconds} onChange={(event) => setConfig({ ...config, durationSeconds: Number(event.target.value) })} className="ml-2 w-24 rounded border bg-background p-1" /></label>
			<button disabled={saving || !config.operations.length} className="rounded border px-4 py-2">Start round</button>
		</form>}
		{summary && round && <section className="space-y-3"><h2 className="font-semibold">{active ? "This round" : "Round results"}</h2>
			<p>{summary.correct} correct · {summary.accuracy === null ? "No attempts yet" : `${Math.round(summary.accuracy * 100)}% accuracy`} · {summary.perMinute.toFixed(1)} correct/minute</p>
			<table className="w-full text-left text-sm"><thead><tr><th>Operation</th><th>Correct / attempts</th><th>Median solve time</th></tr></thead><tbody>{summary.operations.map((row) => <tr key={row.operation}><td>{row.operation}</td><td>{row.correct} / {row.attempts}</td><td>{row.medianMs === null ? "—" : `${(row.medianMs / 1000).toFixed(2)}s`}</td></tr>)}</tbody></table>
			{!active && <details><summary>Review attempts</summary><ol className="space-y-1 text-sm">{round.attempts.map((attempt, index) => <li key={index}>{attempt.question} = {attempt.expected}; you entered {attempt.answer} ({attempt.correct ? "correct" : "incorrect"})</li>)}</ol></details>}
		</section>}
		{rounds.length > 0 && <section><h2 className="mb-2 font-semibold">Saved rounds</h2><ul className="space-y-1">{rounds.map((item) => <li key={item.id}><button disabled={active && item.id !== round?.id} onClick={() => setRound(item)} className="text-sm underline">{new Date(item.startedAt).toLocaleString()} · {item.index} correct · {item.config.durationSeconds}s</button></li>)}</ul></section>}
	</div>;
}

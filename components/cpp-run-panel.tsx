"use client";

import { useEffect, useRef, useState } from "react";
import type { CppRunReport, CppWorkspace } from "@/src/core";

export function CppRunPanel({ workspace, onChange, onReport }: { workspace: CppWorkspace; onChange: (workspace: CppWorkspace) => void; onReport: (report: CppRunReport) => void }) {
	const [busy, setBusy] = useState(false), [message, setMessage] = useState<string>();
	const [report, setReport] = useState<CppRunReport>(), [prediction, setPrediction] = useState("");
	const abort = useRef<AbortController | null>(null);
	useEffect(() => () => abort.current?.abort(), []);
	async function run() {
		if (abort.current) return;
		const controller = new AbortController(); abort.current = controller; setBusy(true); setMessage(undefined);
		try {
			const response = await fetch("/api/training/cpp/run", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
				body: JSON.stringify({ files: workspace.files, stdin: workspace.stdin, sanitize: workspace.sanitize ?? false, prediction, ...(workspace.cases?.length ? { cases: workspace.cases } : {}) }) });
			const body = await response.json() as { report?: CppRunReport; error?: string };
			if (controller.signal.aborted) return;
			if (!response.ok || !body.report) throw new Error(body.error ?? "Compilation failed");
			setReport(body.report); onReport(body.report);
		} catch (cause) { setMessage(controller.signal.aborted ? "Run cancelled." : cause instanceof Error ? cause.message : "Compiler unavailable"); }
		finally { abort.current = null; setBusy(false); }
	}
	return <section className="space-y-3 rounded-xl border p-4">
		<h2 className="font-semibold">Compile and test · C++20</h2>
		<label className="block text-sm">Predict the output (optional)<input aria-label="Predicted program output" value={prediction} onChange={(event) => setPrediction(event.target.value)} className="mt-1 w-full rounded border bg-background p-2 font-mono" /></label>
		<label className="text-sm"><input type="checkbox" checked={workspace.sanitize ?? false} onChange={(event) => onChange({ ...workspace, sanitize: event.target.checked })} /> Address/undefined-behavior sanitizers</label>
		<div className="space-y-3">{workspace.cases?.map((test, index) => <fieldset key={index} className="space-y-2 rounded border p-3"><legend className="text-sm">{test.name}</legend>
			<label className="block text-xs">Input<textarea aria-label={`Case ${index + 1} input`} value={test.stdin} onChange={(event) => onChange({ ...workspace, cases: workspace.cases?.map((item, i) => i === index ? { ...item, stdin: event.target.value } : item) })} className="w-full rounded border bg-background p-2 font-mono" /></label>
			<label className="block text-xs">Expected output<textarea aria-label={`Case ${index + 1} expected output`} value={test.expected} onChange={(event) => onChange({ ...workspace, cases: workspace.cases?.map((item, i) => i === index ? { ...item, expected: event.target.value } : item) })} className="w-full rounded border bg-background p-2 font-mono" /></label>
			<button onClick={() => onChange({ ...workspace, cases: workspace.cases?.filter((_, i) => i !== index) })} className="text-xs underline">Remove case</button>
		</fieldset>)}</div>
		<div className="flex gap-3"><button onClick={() => onChange({ ...workspace, cases: [...(workspace.cases ?? []), { name: `Case ${(workspace.cases?.length ?? 0) + 1}`, stdin: "", expected: "" }] })} disabled={(workspace.cases?.length ?? 0) >= 8} className="text-sm underline">Add test case</button>
			<button disabled={busy} onClick={() => void run()} className="rounded border px-3 py-2 text-sm">{busy ? "Running…" : workspace.cases?.length ? "Run tests" : "Compile and run"}</button>
			{busy && <button onClick={() => abort.current?.abort()} className="text-sm underline">Cancel run</button>}
		</div>
		{message && <p role="status" className="text-sm">{message}</p>}
		{report && <div className="space-y-2" data-testid="cpp-run-result">
			<p className="text-sm">{report.result.ok ? "Passed" : report.result.errorKind} · exit {report.result.exitCode ?? "—"} · {(report.result.durationMs / 1000).toFixed(2)}s</p>
			{report.request.prediction && <p className="text-sm">You predicted: {report.request.prediction}</p>}
			{report.result.compilerOutput && <details open={!!report.result.compileError}><summary>Compiler diagnostics</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{report.result.compilerOutput}</pre></details>}
			<pre aria-label="Program output" className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">{report.result.stdout || "(no stdout)"}</pre>
			{report.result.stderr && <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{report.result.stderr}</pre>}
			{report.result.cases && <ul className="text-sm">{report.result.cases.map((test, index) => <li key={index}>{test.name}: {test.passed ? "passed" : "failed"} · exit {test.exitCode ?? "—"}</li>)}</ul>}
		</div>}
	</section>;
}

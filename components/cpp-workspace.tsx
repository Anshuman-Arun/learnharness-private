"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { emptyCppWorkspace, parseCppWorkspace, workspaceEvidence, cppRunEvidence, type CppWorkspace, type CppRunReport } from "@/src/core";
import { CppChallengeJudge } from "@/components/cpp-challenge-judge";
import { CppRunPanel } from "@/components/cpp-run-panel";

const Editor = dynamic(() => import("@/components/cpp-editor"), { ssr: false, loading: () => <p>Loading code editor…</p> });
const RECOVERY_KEY = "lh:cpp-workspace-draft";

export function CppWorkspaceView() {
	const router = useRouter();
	const [workspace, setWorkspace] = useState<CppWorkspace>();
	const [saved, setSaved] = useState<CppWorkspace[]>([]);
	const [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false);
	const [error, setError] = useState<string>(), [active, setActive] = useState("main.cpp"), [newName, setNewName] = useState("");
	const [plain, setPlain] = useState(false), [selected, setSelected] = useState<string[]>(["main.cpp"]);
	const [sessions, setSessions] = useState<Array<{ id: string; title: string }>>([]), [session, setSession] = useState("new");
	const locked = useRef(false);
	const [lastRun, setLastRun] = useState<CppRunReport>(), [includeRun, setIncludeRun] = useState(false);
	useEffect(() => {
		const controller = new AbortController();
		void Promise.all([fetch("/api/training/cpp", { signal: controller.signal }), fetch("/api/chats", { signal: controller.signal })]).then(async ([response, chats]) => {
			if (!response.ok) throw new Error("Could not load C++ workspaces");
			const body = await response.json() as { workspaces: CppWorkspace[] };
			setSaved(body.workspaces);
			let recovered: CppWorkspace | undefined;
			try {
				const stored = sessionStorage.getItem(RECOVERY_KEY);
				if (stored) { const candidate = JSON.parse(stored) as CppWorkspace; parseCppWorkspace(candidate); if (!Number.isInteger(candidate.revision) || candidate.revision < 0) throw new Error("Invalid draft revision"); recovered = candidate; }
			} catch { setError("The local recovery draft could not be read. Your saved workspaces are still available."); }
			const initial = recovered ?? body.workspaces[0] ?? emptyCppWorkspace(crypto.randomUUID());
			setWorkspace(initial); setActive(initial.files[0]!.name); setSelected(initial.files.map((file) => file.name)); setDirty(!!recovered);
			if (chats.ok) setSessions((await chats.json()).chats ?? []);
		}).catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); });
		return () => controller.abort();
	}, []);
	useEffect(() => {
		if (!workspace || !dirty) return;
		try { sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(workspace)); }
		catch { setError("Local draft recovery is unavailable. Save the workspace before leaving."); }
	}, [workspace, dirty]);
	useEffect(() => {
		if (!dirty) return;
		const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);
	function edit(next: CppWorkspace) { if (locked.current) return; setWorkspace(next); setDirty(true); }
	function choose(next: CppWorkspace) {
		if (dirty && !window.confirm("Switch workspaces and discard the unsaved draft?")) return;
		sessionStorage.removeItem(RECOVERY_KEY); setWorkspace(next); setDirty(false); setActive(next.files[0]!.name); setSelected(next.files.map((file) => file.name)); setError(undefined);
		setLastRun(undefined); setIncludeRun(false);
	}
	async function save(snapshot = workspace): Promise<CppWorkspace | undefined> {
		if (!snapshot || locked.current) return;
		locked.current = true; setSaving(true); setError(undefined);
		try {
			parseCppWorkspace(snapshot);
			const response = await fetch("/api/training/cpp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot) });
			const body = await response.json() as { workspace?: CppWorkspace; error?: string };
			if (!response.ok || !body.workspace) throw new Error(body.error ?? "Could not save workspace");
			setWorkspace(body.workspace); setDirty(false); sessionStorage.removeItem(RECOVERY_KEY);
			setSaved((previous) => [body.workspace!, ...previous.filter((item) => item.id !== body.workspace!.id)]);
			return body.workspace;
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save workspace"); }
		finally { locked.current = false; setSaving(false); }
	}
	async function bringToSession() {
		if (!workspace) return;
		try {
			const evidence = includeRun && lastRun ? cppRunEvidence(lastRun) : workspaceEvidence(workspace, selected);
			if (dirty && !await save()) return;
			let target = session;
			if (target === "new") {
				const response = await fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: workspace.title }) });
				if (!response.ok) throw new Error("Could not create learning session");
				target = (await response.json()).id;
			}
			sessionStorage.setItem("lh:incoming-evidence", JSON.stringify({ chatId: target, evidence }));
			router.push(`/chat/${encodeURIComponent(target)}`);
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare session evidence"); }
	}
	if (!workspace) return <div>{error ? <p role="alert">{error}</p> : <p role="status">Loading workspaces…</p>}</div>;
	const file = workspace.files.find((item) => item.name === active) ?? workspace.files[0]!;
	return <div className="space-y-4">
		{error && <p role="alert" className="text-destructive">{error}</p>}
		<div className="flex flex-wrap items-center gap-3">
			<label className="text-sm">Workspace <select aria-label="Saved workspace" value={workspace.id} disabled={saving} onChange={(event) => { const next = saved.find((item) => item.id === event.target.value); if (next) choose(next); }} className="rounded border bg-background p-2"><option value={workspace.id}>{workspace.title}</option>{saved.filter((item) => item.id !== workspace.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
			<button disabled={saving} onClick={() => choose(emptyCppWorkspace(crypto.randomUUID()))} className="rounded border px-3 py-2 text-sm">New workspace</button>
			<button disabled={saving} onClick={() => void save()} className="rounded border px-3 py-2 text-sm">{saving ? "Saving…" : "Save workspace"}</button>
			<button disabled={saving} onClick={() => void save({ ...workspace, id: crypto.randomUUID(), revision: 0, title: `${workspace.title.slice(0, 110)} copy` })} className="text-sm underline">Save as new copy</button>
			<span role="status" className="text-xs text-muted-foreground">{dirty ? "Unsaved draft · recovered locally on reload" : workspace.revision ? "Saved" : "New workspace"}</span>
		</div>
		<label className="block text-sm">Title<input aria-label="Workspace title" disabled={saving} value={workspace.title} onChange={(event) => edit({ ...workspace, title: event.target.value })} className="mt-1 w-full rounded border bg-background p-2" /></label>
		<label className="block text-sm">Problem and notes<textarea aria-label="Problem and notes" disabled={saving} value={workspace.problem} onChange={(event) => edit({ ...workspace, problem: event.target.value })} rows={3} className="mt-1 w-full rounded border bg-background p-2" /></label>
		<div className="flex flex-wrap items-center gap-2">{workspace.files.map((item) => <button key={item.name} disabled={saving} aria-pressed={file.name === item.name} onClick={() => setActive(item.name)} className={`rounded border px-3 py-1 text-sm ${file.name === item.name ? "bg-accent" : ""}`}>{item.name}</button>)}
			<button disabled={saving || workspace.files.length <= 1} onClick={() => { if (window.confirm(`Remove ${file.name} from this workspace?`)) { const files = workspace.files.filter((item) => item.name !== file.name); edit({ ...workspace, files }); setActive(files[0]!.name); } }} className="text-xs underline">Remove file</button>
		</div>
		<div className="flex gap-2"><input aria-label="New C++ filename" placeholder="helper.hpp" value={newName} onChange={(event) => setNewName(event.target.value)} className="min-w-0 rounded border bg-background p-2 text-sm" /><button disabled={saving || workspace.files.length >= 8} onClick={() => { try { const next = { ...workspace, files: [...workspace.files, { name: newName, source: "" }] }; parseCppWorkspace(next); edit(next); setActive(newName); setSelected([...selected, newName]); setNewName(""); setError(undefined); } catch (cause) { setError((cause as Error).message); } }} className="rounded border px-3 text-sm">Add file</button><button onClick={() => setPlain(!plain)} className="text-xs underline">{plain ? "Rich editor" : "Plain editor"}</button></div>
		{plain ? <textarea aria-label="C++ source" spellCheck={false} disabled={saving} value={file.source} onChange={(event) => edit({ ...workspace, files: workspace.files.map((item) => item.name === file.name ? { ...item, source: event.target.value } : item) })} rows={18} className="w-full rounded border bg-background p-3 font-mono text-sm" /> : <Editor name={`${workspace.id}/${file.name}`} source={file.source} readOnly={saving} onChange={(source) => edit({ ...workspace, files: workspace.files.map((item) => item.name === file.name ? { ...item, source } : item) })} />}
		<label className="block text-sm">Standard input<textarea aria-label="Program input" disabled={saving} value={workspace.stdin} onChange={(event) => edit({ ...workspace, stdin: event.target.value })} rows={3} className="mt-1 w-full rounded border bg-background p-2 font-mono" /></label>
		<CppRunPanel key={workspace.id} workspace={workspace} onChange={edit} onReport={setLastRun} />
		<CppChallengeJudge key={"judge:"+workspace.id} workspace={workspace} />
		<section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Bring your attempt to a session</h2><p className="text-xs text-muted-foreground">Only the checked source files are attached. Add your explanation or dictate it in the session, then submit when ready.</p>
			{lastRun && <label className="block text-sm"><input type="checkbox" checked={includeRun} onChange={(event) => setIncludeRun(event.target.checked)} /> Attach the last run, including all source files used in that run (later edits stay in this workspace)</label>}
			<div className="flex flex-wrap gap-3">{workspace.files.map((item) => <label key={item.name} className="text-sm"><input type="checkbox" checked={selected.includes(item.name)} onChange={(event) => setSelected(event.target.checked ? [...selected, item.name] : selected.filter((name) => name !== item.name))} /> {item.name}</label>)}</div>
			<select aria-label="Target learning session" value={session} onChange={(event) => setSession(event.target.value)} className="max-w-full rounded border bg-background p-2 text-sm"><option value="new">New teaching session</option>{sessions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
			<button disabled={saving || !selected.length} onClick={() => void bringToSession()} className="ml-2 rounded border px-3 py-2 text-sm">Bring selected code to session</button>
		</section>
	</div>;
}

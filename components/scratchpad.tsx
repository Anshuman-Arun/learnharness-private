"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { emptyScratchpad, parseScratchpad, parseLearningEvidence, type Scratchpad, type ScratchpadPage, type EvidenceImage, type TabletLink } from "@/src/core";
import { TabletPairing } from "@/components/tablet-pairing";
import { useServerEvent, useServerResync } from "@/components/server-events";

const Canvas = dynamic(async () => {
	(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = `${window.location.origin}/vendor/excalidraw/`;
	return import("@/components/scratchpad-canvas");
}, { ssr: false, loading: () => <p role="status">Loading local drawing tools…</p> });

export function ScratchpadView({ sessionId, questionId }: { sessionId?: string; questionId?: string }) {
	const router = useRouter();
	const [pad, setPad] = useState<Scratchpad>(), [pads, setPads] = useState<Scratchpad[]>([]), [pageId, setPageId] = useState("");
	const [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false), [capturing, setCapturing] = useState(false);
	const [error, setError] = useState<string>(), [target, setTarget] = useState(sessionId ?? "new");
	const [sessions, setSessions] = useState<Array<{ id: string; title: string }>>([]);
	const [tabletLease, setTabletLease] = useState<TabletLink | null>(null), [pairBusy, setPairBusy] = useState(false);
	const lease = useRef<TabletLink | null>(null); lease.current = tabletLease;
	const current = useRef<Scratchpad | undefined>(undefined), locked = useRef(false), paused = useRef(false);
	const capture = useRef<(() => Promise<EvidenceImage>) | undefined>(undefined);
	const inflight = useRef<Promise<Scratchpad | undefined> | undefined>(undefined);
	const scope = `lh:scratchpad:last:${sessionId ?? "standalone"}:${questionId ?? "general"}`;
	function adopt(next: Scratchpad, modified: boolean) { current.current = next; setPad(next); setDirty(modified); }
	useEffect(() => {
		const controller = new AbortController();
		void Promise.all([fetch("/api/training/scratchpad", { signal: controller.signal }), fetch("/api/chats", { signal: controller.signal })]).then(async ([response, chats]) => {
			if (!response.ok) throw new Error("Could not load scratch work");
			const body = await response.json() as { pads: Scratchpad[] }; setPads(body.pads);
			let recovered: Scratchpad | undefined;
			try {
				const last = sessionStorage.getItem(scope), draft = last ? sessionStorage.getItem(`lh:scratchpad:draft:${last}`) : null;
				if (draft) { const candidate = JSON.parse(draft) as Scratchpad; parseScratchpad(candidate); if (Number.isInteger(candidate.revision) && candidate.revision >= 0 && (!sessionId || candidate.sessionId === sessionId) && (!questionId || candidate.questionId === questionId)) recovered = candidate; }
			} catch { setError("A local drawing draft could not be recovered. Saved pads remain available."); }
			const initial = recovered ?? body.pads.find((item) => (!sessionId || item.sessionId === sessionId) && (!questionId || item.questionId === questionId)) ?? emptyScratchpad(crypto.randomUUID(), crypto.randomUUID(), sessionId, questionId);
			adopt(initial, !!recovered); setPageId(initial.pages[0]!.id);
			if (chats.ok) setSessions((await chats.json()).chats ?? []);
		}).catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); });
		return () => controller.abort();
	}, [sessionId, questionId, scope]);
	function keepDraft() {
		const latest = current.current;
		if (!latest) return true;
		try { sessionStorage.setItem(scope, latest.id); sessionStorage.setItem(`lh:scratchpad:draft:${latest.id}`, JSON.stringify(latest)); return true; }
		catch { setError("Local draft recovery is unavailable. Save before leaving this page."); return false; }
	}
	function save(): Promise<Scratchpad | undefined> {
		if (inflight.current) return inflight.current;
		const attempt = performSave(); inflight.current = attempt;
		void attempt.finally(() => { if (inflight.current === attempt) inflight.current = undefined; });
		return attempt;
	}
	async function performSave(): Promise<Scratchpad | undefined> {
		const snapshot = current.current;
		if (!snapshot || locked.current) return;
		locked.current = true; setSaving(true); keepDraft();
		try {
			parseScratchpad(snapshot);
			const response = await fetch("/api/training/scratchpad", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot) });
			const body = await response.json() as { pad?: Scratchpad; error?: string };
			if (!response.ok || !body.pad) throw new Error(body.error ?? "Could not save scratch work");
			const latest = current.current;
			if (latest === snapshot) { adopt(body.pad, false); sessionStorage.removeItem(`lh:scratchpad:draft:${snapshot.id}`); }
			else if (latest?.id === snapshot.id) adopt({ ...latest, revision: body.pad.revision, updatedAt: body.pad.updatedAt }, true);
			setPads((previous) => [body.pad!, ...previous.filter((item) => item.id !== body.pad!.id)]); setError(undefined); paused.current = false;
			return body.pad;
		} catch (cause) { paused.current = true; setError(cause instanceof Error ? cause.message : "Could not save scratch work"); }
		finally { locked.current = false; setSaving(false); }
	}
	useEffect(() => {
		if (!pad || !dirty || paused.current || tabletLease || pairBusy) return;
		const local = setTimeout(keepDraft, 250), remote = setTimeout(() => void save(), 1000);
		return () => { clearTimeout(local); clearTimeout(remote); };
	}, [pad, dirty, tabletLease, pairBusy]);
	useEffect(() => {
		const preserve = () => keepDraft(); window.addEventListener("beforeunload", preserve);
		return () => { window.removeEventListener("beforeunload", preserve); preserve(); };
	}, [scope]);
	function choose(next: Scratchpad) {
		if (lease.current) return;
		if (!keepDraft()) return;
		const previous = current.current;
		if (previous && dirty) setPads((saved) => [previous, ...saved.filter((item) => item.id !== previous.id)]);
		let recovered: Scratchpad | undefined;
		try {
			const raw = sessionStorage.getItem(`lh:scratchpad:draft:${next.id}`);
			if (raw) {
				const candidate = JSON.parse(raw) as Scratchpad; parseScratchpad(candidate);
				if (candidate.id === next.id && Number.isInteger(candidate.revision) && candidate.revision >= 0) recovered = candidate;
			}
		} catch { setError("A local drawing draft could not be recovered. Saved pads remain available."); return; }
		const selected = recovered ?? next;
		paused.current = false; adopt(selected, !!recovered); setPageId(selected.pages[0]!.id); capture.current = undefined; setError(undefined);
	}
	function updatePage(next: ScratchpadPage) {
		if (lease.current || pairBusy) return;
		const latest = current.current; if (!latest) return;
		adopt({ ...latest, pages: latest.pages.map((page) => page.id === next.id ? next : page) }, true);
	}
	async function remote() {
		const latest = current.current;
		if (!latest || !lease.current) return;
		try {
			const response = await fetch(`/api/training/scratchpad?id=${encodeURIComponent(latest.id)}`);
			if (!response.ok) return;
			const body = await response.json() as { pad: Scratchpad };
			if (lease.current && current.current?.id === body.pad.id && body.pad.revision > current.current.revision) adopt(body.pad, false);
		} catch {}
	}
	useServerEvent("scratchpad-changed", (event) => { if (event.id === current.current?.id) void remote(); });
	useServerResync(() => void remote());
	useEffect(() => { if (tabletLease) { setError(undefined); void remote(); } }, [tabletLease]);
	async function attach() {
		if (!pad || !capture.current || capturing) return;
		setCapturing(true); setError(undefined);
		try {
			const image = await capture.current();
			if (!lease.current) { if (inflight.current) await inflight.current; if (!await save()) return; }
			let chatId = target;
			if (chatId === "new") {
				const response = await fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: pad.title }) });
				if (!response.ok) throw new Error("Could not create learning session");
				chatId = (await response.json()).id;
			}
			const evidence = parseLearningEvidence({ images: [image], source: { kind: "scratchpad", id: pad.id, pageId, ...(pad.sessionId ? { sessionId: pad.sessionId } : {}), ...(pad.questionId ? { questionId: pad.questionId } : {}) } });
			sessionStorage.setItem("lh:incoming-evidence", JSON.stringify({ chatId, evidence })); keepDraft();
			router.push(`/chat/${encodeURIComponent(chatId)}`);
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not attach scratch work"); }
		finally { setCapturing(false); }
	}
	if (!pad) return <p role={error ? "alert" : "status"}>{error ?? "Loading scratch work…"}</p>;
	const page = pad.pages.find((item) => item.id === pageId) ?? pad.pages[0]!;
	return <fieldset disabled={capturing || pairBusy} className="min-w-0 space-y-3">
		{error && <p role="alert" className="text-destructive">{error}</p>}
		<div className="flex flex-wrap items-center gap-2">
			<input aria-label="Scratchpad title" disabled={!!tabletLease} value={pad.title} onChange={(event) => adopt({ ...pad, title: event.target.value }, true)} className="min-w-0 rounded border bg-background p-2 text-sm" />
			<button disabled={saving || !!tabletLease} onClick={() => { paused.current = false; void save(); }} className="rounded border px-3 py-2 text-sm">Save now</button>
			<button disabled={saving || !!tabletLease} onClick={() => { paused.current = false; adopt({ ...pad, id: crypto.randomUUID(), revision: 0, title: `${pad.title.slice(0, 110)} copy` }, true); }} className="text-sm underline">Make a new copy</button>
			<span role="status" className="text-xs text-muted-foreground">{saving ? "Saving…" : dirty ? "Unsaved changes" : pad.revision ? "Saved" : "New pad"}</span>
			<select aria-label="Saved scratchpad" disabled={!!tabletLease} value={pad.id} onChange={(event) => { const next = pads.find((item) => item.id === event.target.value); if (next) choose(next); }} className="max-w-52 rounded border bg-background p-2 text-sm"><option value={pad.id}>{pad.title}</option>{pads.filter((item) => item.id !== pad.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
			<button disabled={!!tabletLease} onClick={() => choose(emptyScratchpad(crypto.randomUUID(), crypto.randomUUID(), sessionId, questionId))} className="text-sm underline">New pad</button>
		</div>
		<div className="flex flex-wrap gap-2">{pad.pages.map((item) => <button key={item.id} disabled={!!tabletLease} aria-pressed={item.id === page.id} onClick={() => { setPageId(item.id); capture.current = undefined; }} className="rounded border px-3 py-1 text-sm">{item.name}</button>)}
			<button disabled={pad.pages.length >= 12 || !!tabletLease} onClick={() => { const next = emptyScratchpad("new", crypto.randomUUID()).pages[0]!; next.name = `Page ${pad.pages.length + 1}`; adopt({ ...pad, pages: [...pad.pages, next] }, true); setPageId(next.id); capture.current = undefined; }} className="text-sm underline">Add page</button>
		</div>
		<TabletPairing key={pad.id} padId={pad.id} pageId={page.id} prepare={async () => { if (inflight.current) await inflight.current; return save(); }} onLease={setTabletLease} onBusy={setPairBusy} />
		<Canvas key={`${pad.id}:${page.id}`} page={page} disabled={capturing || !!tabletLease || pairBusy} remoteRevision={tabletLease ? pad.revision : undefined} onChange={updatePage} onReady={(ready) => { capture.current = ready; }} />
		<div className="flex flex-wrap items-center gap-3"><select aria-label="Scratchpad target session" value={target} onChange={(event) => setTarget(event.target.value)} className="max-w-full rounded border bg-background p-2 text-sm"><option value="new">New teaching session</option>{sessions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button data-testid="attach-scratchpad" disabled={capturing || saving} onClick={() => void attach()} className="rounded border px-3 py-2 text-sm">{capturing ? "Capturing…" : "Use this page in session"}</button></div>
		<p className="text-xs text-muted-foreground">Only an explicit submission sends the snapshot to your model. Vector pages remain saved here. Add your typed or dictated explanation in the session before submitting.</p>
	</fieldset>;
}

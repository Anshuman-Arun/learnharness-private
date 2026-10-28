import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ScratchpadPage } from "../src/core/scratchpad.ts";
import type { TabletLink } from "../src/core/tablet.ts";
import { recoverTabletElements } from "../src/core/tablet.ts";
import "./tablet.css";

const Canvas = lazy(async () => {
	(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = `${location.origin}/vendor/excalidraw/`;
	return import("../components/scratchpad-canvas");
});
interface Scene { link: TabletLink; pad: { id: string; title: string }; page: ScratchpadPage }
interface Frame { sequence: number; elements: Record<string, unknown>[] }
interface Draft { pairingId: string; page: ScratchpadPage; pending?: Frame }

function TabletApp() {
	const [scene, setScene] = useState<Scene>(), [page, setPage] = useState<ScratchpadPage>(), [code, setCode] = useState("");
	const [message, setMessage] = useState("Enter the code shown on your Windows PC."), [busy, setBusy] = useState(false);
	const [recovery, setRecovery] = useState<Draft>();
	const token = useRef<string | undefined>(undefined), state = useRef<Scene | undefined>(undefined), latest = useRef<ScratchpadPage | undefined>(undefined), pending = useRef<Frame | undefined>(undefined);
	const sequence = useRef(0), dirty = useRef(false), sending = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const key = () => state.current ? `lh:tablet-draft:${state.current.pad.id}:${state.current.page.id}` : "";
	function persist() {
		if (!latest.current || !state.current) return;
		try { localStorage.setItem(key(), JSON.stringify({ pairingId: state.current.link.id, page: latest.current, ...(pending.current ? { pending: pending.current } : {}) })); }
		catch { setMessage("Local recovery storage is full. Keep this page open until work is acknowledged."); }
	}
	async function api(route: string, method = "GET", body?: unknown, bearer = token.current) {
		const response = await fetch(route, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
		const data = await response.json();
		if (!response.ok) throw new Error(data.error ?? "Connection refused");
		return data;
	}
	function schedule() {
		if (!timer.current) timer.current = setTimeout(() => { timer.current = undefined; void flush(); }, 200);
	}
	async function flush() {
		if (sending.current || !token.current || !latest.current || (!dirty.current && !pending.current)) return;
		sending.current = true;
		if (!pending.current) { pending.current = { sequence: sequence.current + 1, elements: structuredClone(latest.current.elements) }; dirty.current = false; }
		persist();
		try {
			const ack = await api("/api/scene", "POST", pending.current);
			sequence.current = ack.sequence; pending.current = undefined; persist(); setMessage("Saved on your PC");
			if (dirty.current) schedule();
		} catch (error) { setMessage(`${(error as Error).message}. Work is retained locally; reconnect or pair again to continue.`); }
		finally { sending.current = false; }
	}
	function initialize(next: Scene, bearer: string) {
		token.current = bearer; state.current = next; sequence.current = next.link.lastSequence; latest.current = next.page; setScene(next); setPage(next.page);
		try { sessionStorage.setItem("lh:tablet-token", bearer); } catch {}
		let draft: Draft | undefined;
		try { const raw = localStorage.getItem(key()); if (raw) draft = JSON.parse(raw) as Draft; } catch {}
		if (draft?.page?.id === next.page.id && Array.isArray(draft.page.elements)) {
			if (draft.pairingId !== next.link.id || (draft.pending && draft.pending.sequence < next.link.lastSequence)) { setRecovery(draft); return; }
			latest.current = draft.page; setPage(draft.page); pending.current = draft.pending; dirty.current = true; schedule();
		}
		setMessage("Connected. Write here; your PC receives the strokes.");
	}
	useEffect(() => {
		let disposed = false;
		try { const saved = sessionStorage.getItem("lh:tablet-token"); if (saved) void api("/api/scene", "GET", undefined, saved).then((next: Scene) => { if (!disposed) initialize(next, saved); }).catch(() => { if (!disposed) setMessage("Reconnect with a new code from your PC. Unsent drafts are retained."); }); } catch {}
		const online = () => { if (token.current) void flush(); }, preserve = () => persist();
		window.addEventListener("online", online); window.addEventListener("pagehide", preserve);
		return () => { disposed = true; if (timer.current) clearTimeout(timer.current); window.removeEventListener("online", online); window.removeEventListener("pagehide", preserve); preserve(); };
	}, []);
	async function pair(event: React.FormEvent) {
		event.preventDefault(); if (busy) return; setBusy(true);
		try { const result = await api("/api/pair", "POST", { code }, undefined); initialize(result.scene, result.token); }
		catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
	}
	async function disconnect() {
		persist();
		try { await api("/api/disconnect", "POST", {}); } catch {}
		token.current = undefined; state.current = undefined; setScene(undefined); setPage(undefined); setRecovery(undefined);
		try { sessionStorage.removeItem("lh:tablet-token"); } catch {}
		setMessage("Disconnected. Your local draft is retained.");
	}
	if (!scene || !page) return <main className="pair"><h1>LearnHarness scratch companion</h1><p>Pair with one scratch page. This page does not access your model keys or learning-session APIs.</p><form onSubmit={(event) => void pair(event)}><input aria-label="Pairing code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} /><button disabled={busy || code.length !== 8}>Pair</button></form><p role="status">{message}</p><p className="notices"><a href="/vendor/excalidraw/LICENSE">Drawing software license</a> · <a href="/vendor/excalidraw/FONT-NOTICES.txt">Font notices</a></p></main>;
	if (recovery) return <main className="recovery"><h1>Recover unsent scratch work</h1><p>A local draft from an earlier connection is available for this page.</p><button onClick={() => { const recovered = { ...page, elements: recoverTabletElements(page.elements, recovery.page.elements) }; latest.current = recovered; pending.current = undefined; dirty.current = true; setPage(recovered); setRecovery(undefined); persist(); schedule(); }}>Recover local work</button><button onClick={() => { latest.current = page; pending.current = undefined; setRecovery(undefined); persist(); }}>Use the saved PC page</button></main>;
	return <main className="drawing"><header><div><strong>{scene.pad.title}</strong><small>{page.name}</small></div><button onClick={() => void flush()}>Sync now</button><button onClick={() => void disconnect()}>Disconnect</button></header><p role="status" className="message">{message}</p>
		<Suspense fallback={<p>Loading drawing tools…</p>}><Canvas key={`${scene.link.id}:${page.id}`} page={page} onReady={() => {}} onChange={(next) => { latest.current = next; setPage(next); dirty.current = true; persist(); schedule(); }} /></Suspense>
	</main>;
}
createRoot(document.getElementById("root")!).render(<TabletApp />);

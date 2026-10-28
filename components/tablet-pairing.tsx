"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Scratchpad, TabletLink } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";

export function TabletPairing({ padId, pageId, prepare, onLease, onBusy }: {
	padId: string; pageId: string; prepare: () => Promise<Scratchpad | undefined>;
	onLease: (link: TabletLink | null) => void; onBusy: (busy: boolean) => void;
}) {
	const [link, setLink] = useState<TabletLink | null>(null), [code, setCode] = useState<string>(), [url, setUrl] = useState<string | null>(null);
	const [error, setError] = useState<string>(), [busy, setBusy] = useState(false);
	const generation = useRef(0), disposed = useRef(false);
	const refresh = useCallback(async () => {
		const stamp = generation.current;
		try {
			const response = await fetch(`/api/training/tablet?padId=${encodeURIComponent(padId)}`);
			if (!response.ok) return;
			const body = await response.json() as { links: TabletLink[] };
			if (disposed.current || stamp !== generation.current) return;
			const next = body.links[0] ?? null; setLink(next); onLease(next);
			if (!next || next.state === "connected") setCode(undefined);
		} catch {}
	}, [padId, onLease]);
	useEffect(() => { disposed.current = false; void refresh(); return () => { disposed.current = true; }; }, [refresh]);
	useServerEvent("tablet-link-changed", (event) => { if (event.padId === padId) void refresh(); });
	useServerResync(() => void refresh());
	useEffect(() => { if (!link) return; const timer = setTimeout(() => void refresh(), Math.max(0, link.expiresAt - Date.now() + 50)); return () => clearTimeout(timer); }, [link, refresh]);
	async function act(action: "create" | "revoke") {
		if (busy) return;
		generation.current++; setBusy(true); onBusy(true); setError(undefined);
		try {
			if (action === "create" && !await prepare()) return;
			if (disposed.current) return;
			const response = await fetch("/api/training/tablet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "create" ? { action, padId, pageId } : { action, id: link?.id }) });
			const body = await response.json() as { link?: TabletLink; code?: string; url?: string | null; error?: string };
			if (!response.ok || !body.link) throw new Error(body.error ?? "Could not change tablet pairing");
			generation.current++;
			const next = body.link.active ? body.link : null; setLink(next); onLease(next); setCode(body.code); setUrl(body.url ?? null);
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Tablet companion unavailable"); }
		finally { setBusy(false); onBusy(false); }
	}
	return <section className="space-y-2 rounded border p-3 text-sm" data-testid="tablet-pairing">
		<div className="flex flex-wrap items-center gap-3"><strong>iPad companion</strong>{link ? <><span role="status">{link.state === "connected" ? "Connected — tablet controls this page" : "Waiting for the pairing code"}</span><button type="button" disabled={busy} data-testid="disconnect-tablet" onClick={() => void act("revoke")} className="underline">Disconnect tablet</button></> : <button type="button" disabled={busy} data-testid="pair-tablet" onClick={() => void act("create")} className="underline">Pair iPad</button>}</div>
		{code && <div><p>Open the companion address in iPad Safari and enter this code within two minutes:</p><output className="select-all font-mono text-2xl tracking-widest" data-testid="tablet-code">{code}</output>{url ? <p><a className="underline" href={url} target="_blank" rel="noreferrer">{url}</a></p> : <p>Set LH_TABLET_PUBLIC_URL to your Windows PC’s certificate-matching HTTPS address; see the iPad setup guide.</p>}</div>}
		{link && <p className="text-xs text-muted-foreground">Desktop drawing is paused while paired. You can view and capture the tablet’s work here. Disconnect to edit on the PC.</p>}
		{error && <p role="alert" className="text-destructive">{error}</p>}
	</section>;
}

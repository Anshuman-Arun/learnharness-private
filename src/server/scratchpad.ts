import { parseScratchpad, type Scratchpad } from "../core/scratchpad.ts";
import { stores } from "./stores.ts";
import { emit } from "../core/events.ts";
import type { TabletLink } from "../core/tablet.ts";

export function listScratchpads(): Scratchpad[] { return stores.trainingStore.list<Scratchpad>("scratchpad").sort((a, b) => b.updatedAt - a.updatedAt); }
export function getScratchpad(id: string): Scratchpad | null { return stores.trainingStore.read<Scratchpad>("scratchpad", id); }
export function saveScratchpad(raw: unknown, authority?: { tabletId: string }): Scratchpad {
	const parsed = parseScratchpad(raw), current = stores.trainingStore.read<Scratchpad>("scratchpad", parsed.id);
	const lease = stores.trainingStore.list<TabletLink>("tablet-link").find((link) => link.padId === parsed.id && link.active && link.expiresAt > Date.now());
	if (lease && lease.id !== authority?.tabletId) throw new Error("Disconnect the tablet before editing this pad on the desktop");
	if ((raw as { revision?: unknown }).revision !== (current?.revision ?? 0)) throw new Error("This pad changed on another device. Save a copy or reload it before continuing.");
	const saved: Scratchpad = { ...parsed, revision: (current?.revision ?? 0) + 1, updatedAt: Date.now() };
	stores.trainingStore.write("scratchpad", saved); emit("scratchpad-changed", { id: saved.id, revision: saved.revision }); return saved;
}

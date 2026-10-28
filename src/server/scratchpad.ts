import { parseScratchpad, type Scratchpad } from "../core/scratchpad.ts";
import { stores } from "./stores.ts";

export function listScratchpads(): Scratchpad[] { return stores.trainingStore.list<Scratchpad>("scratchpad").sort((a, b) => b.updatedAt - a.updatedAt); }
export function saveScratchpad(raw: unknown): Scratchpad {
	const parsed = parseScratchpad(raw), current = stores.trainingStore.read<Scratchpad>("scratchpad", parsed.id);
	if ((raw as { revision?: unknown }).revision !== (current?.revision ?? 0)) throw new Error("This pad changed on another device. Save a copy or reload it before continuing.");
	const saved: Scratchpad = { ...parsed, revision: (current?.revision ?? 0) + 1, updatedAt: Date.now() };
	stores.trainingStore.write("scratchpad", saved); return saved;
}

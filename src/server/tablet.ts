import fs from "node:fs";
import https from "node:https";
import { createHash, timingSafeEqual } from "node:crypto";
import type { TabletLink } from "../core/tablet.ts";
import { parseScratchpad, type Scratchpad } from "../core/scratchpad.ts";
import { tabletCaFile, tabletTokenFile } from "../../runner/tablet-config.mjs";
import { stores } from "./stores.ts";
import { saveScratchpad } from "./scratchpad.ts";
import { emit } from "../core/events.ts";

export function tabletControlAuthorized(value: string | null): boolean {
	try { const expected = fs.readFileSync(tabletTokenFile(), "utf8").trim(), actual = value ?? ""; return actual.length === expected.length && expected.length >= 32 && timingSafeEqual(Buffer.from(actual), Buffer.from(expected)); }
	catch { return false; }
}
async function control<T>(route: string, body: unknown): Promise<T> {
	const base = new URL(process.env.LH_TABLET_RUNNER_URL ?? "https://127.0.0.1:3214");
	if (base.protocol !== "https:" || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) throw new Error("Tablet control must use loopback HTTPS");
	let token: string;
	try { token = fs.readFileSync(tabletTokenFile(), "utf8").trim(); } catch { throw new Error("Start the HTTPS tablet companion first; see docs/ipad-companion.md"); }
	const data = JSON.stringify(body), ca = fs.existsSync(tabletCaFile()) ? fs.readFileSync(tabletCaFile()) : undefined;
	return new Promise((resolve, reject) => {
		const request = https.request(new URL(route, base), { method: "POST", ca, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), "x-lh-tablet-control": token } }, (response) => {
			const chunks: Buffer[] = []; let size = 0;
			response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 3 * 1024 * 1024) { request.destroy(new Error("Tablet response too large")); return; } chunks.push(chunk); });
			response.on("end", () => { try { const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); if ((response.statusCode ?? 500) >= 400) reject(new Error(body.error ?? "Tablet companion refused the request")); else resolve(body as T); } catch (error) { reject(error); } });
		});
		request.on("error", reject); request.setTimeout(10000, () => request.destroy(new Error("Tablet companion did not respond"))); request.end(data);
	});
}
export function tabletLinks(padId: string, now = Date.now()): TabletLink[] {
	return stores.trainingStore.list<TabletLink>("tablet-link").filter((link) => link.padId === padId && link.active && link.expiresAt > now);
}
export async function createTabletLink(padId: string, pageId: string) {
	const pad = stores.trainingStore.read<Scratchpad>("scratchpad", padId);
	if (!pad || !pad.pages.some((page) => page.id === pageId)) throw new Error("Save this scratch page before pairing");
	if (tabletLinks(padId).length) throw new Error("Disconnect the current tablet before pairing another");
	const created = await control<{ id: string; code: string; expiresAt: number; url: string | null }>("/control/create", { padId, pageId });
	const link: TabletLink = { version: 1, id: created.id, padId, pageId, active: true, state: "waiting", expiresAt: created.expiresAt, lastSequence: 0 };
	stores.trainingStore.write("tablet-link", link);
	emit("tablet-link-changed", { padId });
	return { link, code: created.code, url: created.url };
}
export async function revokeTabletLink(id: string) {
	const link = stores.trainingStore.read<TabletLink>("tablet-link", id);
	if (!link) throw new Error("Pairing not found");
	stores.trainingStore.write("tablet-link", { ...link, active: false });
	emit("tablet-link-changed", { padId: link.padId });
	await control("/control/revoke", { id }).catch(() => {});
	return { ...link, active: false };
}
export function tabletScene(id: string, now = Date.now()) {
	const link = stores.trainingStore.read<TabletLink>("tablet-link", id);
	if (!link?.active || link.expiresAt <= now) throw new Error("Pairing expired or disconnected");
	const pad = stores.trainingStore.read<Scratchpad>("scratchpad", link.padId), page = pad?.pages.find((item) => item.id === link.pageId);
	if (!pad || !page) throw new Error("Paired scratch page no longer exists");
	return { link, pad: { id: pad.id, title: pad.title }, page };
}
export function applyTabletEvent(raw: unknown, now = Date.now()) {
	if (!raw || typeof raw !== "object") throw new Error("Invalid tablet event");
	const input = raw as { id?: unknown; action?: unknown; sequence?: unknown; elements?: unknown };
	if (typeof input.id !== "string") throw new Error("Pairing id is required");
	const state = tabletScene(input.id, now);
	if (input.action === "activate") {
		const link = { ...state.link, state: "connected" as const, expiresAt: now + 8 * 60 * 60 * 1000 };
		stores.trainingStore.write("tablet-link", link); emit("tablet-link-changed", { padId: link.padId }); return { ...state, link };
	}
	if (input.action === "revoke") {
		stores.trainingStore.write("tablet-link", { ...state.link, active: false }); emit("tablet-link-changed", { padId: state.link.padId }); return { revoked: true };
	}
	if (input.action !== "scene" || state.link.state !== "connected" || !Number.isSafeInteger(input.sequence) || (input.sequence as number) < 1) throw new Error("Invalid scene sequence");
	const pad = stores.trainingStore.read<Scratchpad>("scratchpad", state.link.padId)!;
	const parsed = parseScratchpad({ ...pad, pages: pad.pages.map((page) => page.id === state.link.pageId ? { ...page, elements: input.elements } : page) });
	const hash = createHash("sha256").update(JSON.stringify(parsed.pages.find((page) => page.id === state.link.pageId)!.elements)).digest("hex");
	if (input.sequence === state.link.lastSequence && hash === state.link.lastHash) return { sequence: state.link.lastSequence, revision: pad.revision };
	if (input.sequence !== state.link.lastSequence + 1) throw new Error("Scene sequence is stale; reconnect before sending more work");
	const saved = saveScratchpad({ ...parsed, revision: pad.revision }, { tabletId: state.link.id });
	stores.trainingStore.write("tablet-link", { ...state.link, lastSequence: input.sequence as number, lastHash: hash });
	return { sequence: input.sequence, revision: saved.revision };
}

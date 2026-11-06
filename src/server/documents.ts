import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { stores } from "./stores.ts";
import { emit } from "../core/events.ts";
import {
	documentChunks,
	documentCoverage,
	documentCycle,
	normalizeSourceText,
	selectedDocumentPages,
	sourceBlocks,
	validateDocumentProposal,
	type DocumentSource,
	type DocumentProposal,
	type DocumentChunk,
	type DocumentNode,
} from "../core/documents.ts";
import { pdfSourceMetadata, pdfSourcePages } from "../agent/subagents/pdf-ops.ts";
import { getHeadless } from "../agent/subagents/headless.ts";
import { extractDocumentMap } from "../agent/subagents/document-map.ts";
import { piEngineForSpec, type PiEngine } from "../agent/models.ts";
import { resolveRoleSpec } from "../core/settings-resolution.ts";
import { providerKeyPresent } from "./keys.ts";

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const hash = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
type Run = { controller: AbortController; task?: Promise<void> };
const running = () =>
	((globalThis as typeof globalThis & { __lhDocumentRuns?: Map<string, Run> }).__lhDocumentRuns ??=
		new Map());
function save(source: DocumentSource) {
	const saved = { ...source, revision: source.revision + 1, updatedAt: Date.now() };
	stores.documentStore.write(saved);
	emit("documents-changed", { id: source.id });
	return saved;
}
export function getDocument(id: string): DocumentSource {
	const source = stores.documentStore.read(id);
	if (!source) throw new Error("Source not found");
	if (["processing", "preparing"].includes(source.status) && !running().has(id))
		return save({
			...source,
			status: "paused",
			activity: undefined,
			error: "Processing was interrupted. Resume from the last saved chunk.",
		});
	return source;
}
export function listDocuments() {
	return stores.documentStore.list().map((s) => {
		const source = getDocument(s.id);
		return {
			id: source.id,
			title: source.title,
			filename: source.filename,
			bytes: source.bytes,
			pageCount: source.pageCount,
			selectedCount: source.selectedPages.length,
			nodeCount: source.nodes.length,
			status: source.status,
			activity: source.activity,
			error: source.error,
			updatedAt: source.updatedAt,
			coverage: documentCoverage(source),
		};
	});
}
export function documentFile(id: string, range: string | null) {
	getDocument(id);
	const file = stores.documentStore.pdfPath(id),
		size = fs.statSync(file).size;
	let start = 0,
		end = size - 1;
	if (range) {
		const match = range.match(/^bytes=(\d*)-(\d*)$/);
		if (!match || (!match[1] && !match[2]))
			return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
		if (!match[1]) start = Math.max(0, size - Number(match[2]));
		else {
			start = Number(match[1]);
			if (match[2]) end = Math.min(end, Number(match[2]));
		}
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size)
			return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
	}
	return new Response(
		Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream<Uint8Array>,
		{
			status: range ? 206 : 200,
			headers: {
				"Content-Type": "application/pdf",
				"Accept-Ranges": "bytes",
				"Content-Length": String(end - start + 1),
				"Cache-Control": "private, max-age=3600",
				...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
				"Content-Disposition": "inline",
				"X-Content-Type-Options": "nosniff",
			},
		},
	);
}
export async function documentPageImage(id: string, number: number) {
	const source = getDocument(id),
		page = source.pages.find((p) => p.number === number);
	if (!page) throw new Error("Select this page before viewing it");
	const cached = stores.documentStore.readPageImage(id, number);
	if (cached) return cached;
	const dpi = Math.min(125, (1800 * 72) / Math.max(page.width ?? 612, page.height ?? 792));
	const [rendered] = await getHeadless().renderPdfPages(stores.documentStore.pdfPath(id), [number], { dpi });
	if (!rendered) throw new Error("Could not render this source page");
	stores.documentStore.writePageImage(id, number, rendered.png);
	return rendered.png;
}

export async function createDocument(bytes: Uint8Array, filename: string): Promise<DocumentSource> {
	if (!bytes.length || bytes.length > MAX_PDF_BYTES) throw new Error("Choose a PDF up to 50 MB");
	if (
		typeof filename !== "string" ||
		!filename.trim() ||
		filename.length > 240 ||
		/[\u0000-\u001f]/.test(filename)
	)
		throw new Error("Invalid source filename");
	if (!Buffer.from(bytes.subarray(0, 1024)).includes(Buffer.from("%PDF-")))
		throw new Error("This file is not a PDF");
	const fingerprint = hash(bytes),
		id = "doc_" + fingerprint.slice(0, 32),
		existing = stores.documentStore.read(id);
	if (existing) return getDocument(id);
	const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-pdf-validation-"));
	let metadata;
	try {
		const file = path.join(scratch, "source.pdf");
		fs.writeFileSync(file, bytes, { mode: 0o600 });
		metadata = await pdfSourceMetadata(file);
	} catch (cause) {
		throw new Error(`Cannot read this PDF: ${cause instanceof Error ? cause.message : "invalid document"}`);
	} finally {
		fs.rmSync(scratch, { recursive: true, force: true });
	}
	if (metadata.pageCount > 5000) throw new Error("This PDF exceeds 5000 pages; import a chapter instead");
	stores.documentStore.writePdf(id, bytes);
	return save({
		version: 1,
		id,
		fingerprint,
		filename,
		title: metadata.title.trim().slice(0, 240) || filename.replace(/\.pdf$/i, ""),
		bytes: bytes.length,
		pageCount: metadata.pageCount,
		selectedPages: [],
		pages: [],
		nodes: [],
		edges: [],
		coverage: [],
		chunks: [],
		status: "uploaded",
		createdAt: Date.now(),
		updatedAt: Date.now(),
		revision: 0,
	});
}
export function documentModel(visual: boolean): PiEngine {
	const spec = resolveRoleSpec(visual ? "pdfReader" : "teacher", stores.settingsStore.readSettings());
	if (!spec)
		throw new Error(
			`Configure the ${visual ? "vision" : "strong"} model in Settings before building this source map`,
		);
	if (!providerKeyPresent(spec.provider))
		throw new Error(`The configured ${spec.provider} provider has no key; add it in Settings`);
	const engine = piEngineForSpec(spec);
	if (visual && !engine.model.input.includes("image"))
		throw new Error("This source has visual content; choose an image-capable vision model in Settings");
	return engine;
}
export function mergeDocumentChunk(
	source: DocumentSource,
	chunk: DocumentChunk,
	proposal: DocumentProposal,
	now = Date.now(),
): DocumentSource {
	const problem = validateDocumentProposal(proposal, source, chunk);
	if (problem) throw new Error(problem);
	const ids = new Map<string, string>(),
		nodes = new Map(source.nodes.map((n) => [n.id, structuredClone(n)]));
	for (const proposed of proposal.nodes) {
		const known = nodes.get(proposed.id);
		if (known && normalizeSourceText(known.statement) !== normalizeSourceText(proposed.statement))
			throw new Error("An existing source ID cannot be reused for a different proposition");
		const id =
			known?.id ??
			"n_" +
				hash(source.id + "\n" + proposed.kind + "\n" + normalizeSourceText(proposed.statement)).slice(0, 24);
		ids.set(proposed.id, id);
		const citations = proposed.citations.map((c) => ({ ...c, verified: c.mode === "text" }));
		const previous = nodes.get(id);
		const mergedCitations = [...(previous?.citations ?? []), ...citations].filter(
			(c, i, all) =>
				all.findIndex(
					(other) => other.page === c.page && other.quote === c.quote && other.mode === c.mode,
				) === i,
		);
		nodes.set(id, { ...proposed, ...(previous ?? {}), id, citations: mergedCitations } as DocumentNode);
	}
	const resolve = (id: string) => ids.get(id) ?? id;
	const edges = [
		...source.edges,
		...proposal.edges.map((e) => ({ ...e, from: resolve(e.from), to: resolve(e.to) })),
	]
		.filter((e) => e.from !== e.to)
		.filter(
			(e, i, all) =>
				all.findIndex((other) => other.from === e.from && other.to === e.to && other.kind === e.kind) === i,
		);
	if (documentCycle([...nodes.values()], edges))
		throw new Error("The merged source map contains a cycle; this chunk was not saved");
	const coverage = [
		...source.coverage.filter((c) => !chunk.blockIds.includes(c.blockId)),
		...proposal.coverage.map((c) => ({ ...c, nodeIds: [...new Set(c.nodeIds.map(resolve))] })),
	];
	return {
		...source,
		nodes: [...nodes.values()],
		edges,
		coverage,
		chunks: source.chunks.map((c) => (c.id === chunk.id ? { ...c, completedAt: now } : c)),
	};
}
export async function prepareDocument(id: string, pageSpec: string): Promise<DocumentSource> {
	const source = getDocument(id);
	if (running().has(id)) throw new Error("Pause this source before changing pages");
	const selected = selectedDocumentPages(pageSpec, source.pageCount),
		mergedPages = [...new Set([...source.selectedPages, ...selected])].sort((a, b) => a - b);
	if (mergedPages.length > 300)
		throw new Error(
			"A source map supports up to 300 selected pages; import separate chapters for a longer book",
		);
	const missing = selected.filter((number) => !source.pages.some((p) => p.number === number));
	const run: Run = { controller: new AbortController() };
	running().set(id, run);
	try {
		save({ ...source, status: "preparing", activity: "Reading PDF pages", error: undefined });
		const extracted = await pdfSourcePages(stores.documentStore.pdfPath(id), missing);
		const pages = [
			...source.pages,
			...extracted.map((p) => ({ ...p, blocks: sourceBlocks(p.number, p.text) })),
		].sort((a, b) => a.number - b.number);
		const chunks = [...source.chunks];
		const newChunks = documentChunks(pages.filter((p) => missing.includes(p.number)));
		for (const c of newChunks) chunks.push({ ...c, id: "chunk-" + (chunks.length + 1) });
		return save({
			...getDocument(id),
			selectedPages: mergedPages,
			pages,
			chunks,
			status: source.nodes.length ? "partial" : "ready",
			activity: undefined,
			error: undefined,
		});
	} catch (cause) {
		save({ ...getDocument(id), status: "failed", activity: undefined, error: (cause as Error).message });
		throw cause;
	} finally {
		running().delete(id);
	}
}
export function startDocument(
	id: string,
	options: { engine?: PiEngine; extract?: typeof extractDocumentMap } = {},
): DocumentSource {
	const source = getDocument(id);
	if (running().has(id)) return source;
	if (running().size)
		throw new Error("Another source is processing. Pause it or wait before starting this one");
	if (!source.chunks.length) throw new Error("Select the chapter or page range first");
	if (source.chunks.every((c) => c.completedAt !== undefined)) return source;
	// Refuse missing models before claiming a run or billing any extraction.
	if (!options.engine)
		for (const visual of new Set(
			source.pages
				.filter((p) => source.chunks.some((c) => !c.completedAt && c.pages.includes(p.number)))
				.map((p) => p.needsVisual),
		))
			documentModel(visual);
	const run: Run = { controller: new AbortController() };
	running().set(id, run);
	const initial = save({ ...source, status: "processing", error: undefined, activity: "Reading source" });
	run.task = (async () => {
		try {
			for (const item of source.chunks) {
				if (item.completedAt !== undefined) continue;
				run.controller.signal.throwIfAborted();
				let current = getDocument(id);
				const chunk = current.chunks.find((c) => c.id === item.id)!;
				current = save({
					...current,
					activity: `Reading pages ${chunk.pages.join(", ")}`,
					chunks: current.chunks.map((c) => (c.id === item.id ? { ...c, attempts: c.attempts + 1 } : c)),
				});
				const visualPages = current.pages
					.filter((p) => chunk.pages.includes(p.number) && p.needsVisual)
					.map((p) => p.number);
				const engine = options.engine ?? documentModel(visualPages.length > 0);
				const rendered = await Promise.all(
					visualPages.map(async (page) => ({ page, png: await documentPageImage(id, page) })),
				);
				if (rendered.length !== visualPages.length)
					throw new Error("Some source pages could not be rendered; this chunk is not complete");
				const proposal = await (options.extract ?? extractDocumentMap)({
					source: current,
					chunk,
					engine,
					images: rendered.map((p) => ({ page: p.page, data: Buffer.from(p.png).toString("base64") })),
					signal: run.controller.signal,
					onUsage: (tokens, model) => {
						const live = getDocument(id);
						save({
							...live,
							chunks: live.chunks.map((c) =>
								c.id === item.id
									? { ...c, tokens: (c.tokens ?? 0) + tokens, calls: (c.calls ?? 0) + 1, model }
									: c,
							),
						});
					},
				});
				run.controller.signal.throwIfAborted();
				const merged = mergeDocumentChunk(getDocument(id), chunk, proposal);
				save({
					...merged,
					status: "processing",
					chunks: merged.chunks.map((c) =>
						c.id === item.id ? { ...c, model: `${engine.model.provider}:${engine.model.id}` } : c,
					),
				});
			}
			const current = getDocument(id),
				coverage = documentCoverage(current);
			save({
				...current,
				status: coverage.uncertain ? "partial" : "complete",
				activity: undefined,
				error: coverage.uncertain ? `${coverage.uncertain} source blocks need review` : undefined,
			});
		} catch (cause) {
			const current = getDocument(id);
			save({
				...current,
				status: run.controller.signal.aborted ? "paused" : current.coverage.length ? "partial" : "failed",
				activity: undefined,
				error: run.controller.signal.aborted ? undefined : (cause as Error).message,
			});
		} finally {
			running().delete(id);
		}
	})();
	return initial;
}
export async function pauseDocument(id: string) {
	running().get(id)?.controller.abort();
	await running().get(id)?.task;
	return getDocument(id);
}

export function retryDocumentGaps(id: string) {
	const source = getDocument(id);
	if (running().has(id)) throw new Error("Pause the source before retrying gaps");
	const gaps = new Set(
		source.coverage
			.filter((c) => !c.nodeIds.length && /uncertain|unreadable|illegible|unclear|missing/i.test(c.reason))
			.map((c) => c.blockId),
	);
	if (!gaps.size) throw new Error("No unresolved source blocks to retry");
	return save({
		...source,
		status: "partial",
		error: undefined,
		chunks: source.chunks.map((c) =>
			c.blockIds.some((b) => gaps.has(b)) ? { ...c, completedAt: undefined } : c,
		),
	});
}

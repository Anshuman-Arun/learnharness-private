/** Source knowledge and learner evidence are deliberately different records. */
export const DOCUMENT_NODE_KINDS = [
	"concept",
	"definition",
	"result",
	"assumption",
	"proof",
	"example",
	"exercise",
	"prerequisite",
] as const;
export type DocumentNodeKind = (typeof DOCUMENT_NODE_KINDS)[number];
export interface SourceBlock {
	id: string;
	page: number;
	text: string;
}
export interface SourcePage {
	number: number;
	text: string;
	blocks: SourceBlock[];
	needsVisual: boolean;
	warnings: string[];
	width?: number;
	height?: number;
}
export interface SourceCitation {
	page: number;
	quote: string;
	mode: "text" | "visual";
	verified: boolean;
}
export interface DocumentNode {
	id: string;
	title: string;
	kind: DocumentNodeKind;
	statement: string;
	explanation: string;
	citations: SourceCitation[];
	section: string;
	inferred: boolean;
}
export interface DocumentEdge {
	from: string;
	to: string;
	kind: "requires" | "derives" | "illustrates";
	reason: string;
	inferred: boolean;
}
export interface BlockCoverage {
	blockId: string;
	nodeIds: string[];
	reason: string;
}
export interface DocumentChunk {
	id: string;
	blockIds: string[];
	pages: number[];
	completedAt?: number;
	model?: string;
	attempts: number;
	tokens?: number;
	calls?: number;
}
export type DocumentStatus =
	"uploaded" | "preparing" | "ready" | "processing" | "paused" | "partial" | "complete" | "failed";
export interface DocumentSource {
	version: 1;
	id: string;
	fingerprint: string;
	filename: string;
	title: string;
	bytes: number;
	pageCount: number;
	selectedPages: number[];
	pages: SourcePage[];
	nodes: DocumentNode[];
	edges: DocumentEdge[];
	coverage: BlockCoverage[];
	chunks: DocumentChunk[];
	status: DocumentStatus;
	activity?: string;
	error?: string;
	createdAt: number;
	updatedAt: number;
	revision: number;
}
export interface DocumentLearningEvidence {
	version: 1;
	id: string;
	sourceId: string;
	nodeId: string;
	sessionId: string;
	recordedAt: number;
	kind: "studied" | "recall";
	note: string;
}
export interface DocumentProposal {
	nodes: Array<
		Omit<DocumentNode, "citations"> & {
			citations: Array<{ page: number; quote: string; mode: "text" | "visual" }>;
		}
	>;
	edges: DocumentEdge[];
	coverage: BlockCoverage[];
}
export function normalizeSourceText(value: string): string {
	return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}
export function sourceBlocks(page: number, text: string): SourceBlock[] {
	const blocks: SourceBlock[] = [];
	// Keep page identity and line order. A bounded block is a coverage unit, not a summary.
	let current = "";
	const push = () => {
		if (current.trim()) blocks.push({ id: `p${page}-b${blocks.length + 1}`, page, text: current.trim() });
		current = "";
	};
	for (const paragraph of text.split(/\n\s*\n/)) {
		for (const line of paragraph.split(/\n/)) {
			for (let at = 0; at < line.length; at += 1400) {
				const piece = line.slice(at, at + 1400);
				if (current.length + piece.length > 1600) push();
				current += (current ? "\n" : "") + piece;
			}
		}
		push();
	}
	push();
	return blocks;
}
export function selectedDocumentPages(spec: string, total: number): number[] {
	if (!Number.isSafeInteger(total) || total < 1 || total > 5000)
		throw new Error("This document must contain 1–5000 pages");
	if (!spec.trim() || spec.trim().toLowerCase() === "all") {
		if (total > 300) throw new Error("Choose a chapter or page range of up to 300 pages");
		return Array.from({ length: total }, (_, i) => i + 1);
	}
	const pages = new Set<number>();
	for (const token of spec.split(",")) {
		const match = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
		if (!match) throw new Error("Use page numbers such as 1–12 or 3,5,8–10 (with a hyphen)");
		const first = Number(match[1]),
			last = Number(match[2] ?? match[1]);
		if (first < 1 || last > total || first > last || last - first >= 300)
			throw new Error("Page range is outside this PDF or exceeds 300 pages");
		for (let i = first; i <= last; i++) pages.add(i);
	}
	if (!pages.size || pages.size > 300) throw new Error("Select 1–300 pages");
	return [...pages].sort((a, b) => a - b);
}
export function documentChunks(pages: SourcePage[], budget = 12000): DocumentChunk[] {
	const chunks: DocumentChunk[] = [];
	let blocks: SourceBlock[] = [],
		size = 0;
	const flush = () => {
		if (!blocks.length) return;
		chunks.push({
			id: `chunk-${chunks.length + 1}`,
			blockIds: blocks.map((b) => b.id),
			pages: [...new Set(blocks.map((b) => b.page))],
			attempts: 0,
		});
		blocks = [];
		size = 0;
	};
	for (const page of pages) {
		const content = page.blocks.length
			? page.blocks
			: [
					{
						id: `p${page.number}-visual`,
						page: page.number,
						text: "[Inspect the page image: no reliable text layer]",
					},
				];
		for (const block of content) {
			if (
				blocks.length &&
				(size + block.text.length > budget || new Set([...blocks.map((b) => b.page), block.page]).size > 3)
			)
				flush();
			blocks.push(block);
			size += block.text.length;
		}
	}
	flush();
	return chunks;
}
export function documentCycle(
	nodes: Pick<DocumentNode, "id">[],
	edges: Pick<DocumentEdge, "from" | "to">[],
): boolean {
	const ids = new Set(nodes.map((n) => n.id)),
		incoming = new Map([...ids].map((id) => [id, 0])),
		outgoing = new Map<string, string[]>();
	for (const e of edges) {
		if (!ids.has(e.from) || !ids.has(e.to)) return true;
		incoming.set(e.to, incoming.get(e.to)! + 1);
		outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to]);
	}
	const ready = [...incoming].filter(([, n]) => !n).map(([id]) => id);
	let seen = 0;
	while (ready.length) {
		const id = ready.pop()!;
		seen++;
		for (const next of outgoing.get(id) ?? []) {
			incoming.set(next, incoming.get(next)! - 1);
			if (!incoming.get(next)) ready.push(next);
		}
	}
	return seen !== ids.size;
}
export function validateDocumentProposal(
	raw: unknown,
	source: DocumentSource,
	chunk: DocumentChunk,
): string | null {
	const p = raw as DocumentProposal;
	if (
		!p ||
		!Array.isArray(p.nodes) ||
		!Array.isArray(p.edges) ||
		!Array.isArray(p.coverage) ||
		p.nodes.length > 100 ||
		p.edges.length > 250
	)
		return "Submit bounded nodes, edges and coverage arrays";
	const known = new Set(source.nodes.map((n) => n.id)),
		local = new Set<string>();
	for (const node of p.nodes) {
		if (
			!node ||
			typeof node.id !== "string" ||
			!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(node.id) ||
			local.has(node.id) ||
			!DOCUMENT_NODE_KINDS.includes(node.kind) ||
			typeof node.title !== "string" ||
			!node.title.trim() ||
			node.title.length > 100 ||
			typeof node.statement !== "string" ||
			node.statement.trim().length < 8 ||
			node.statement.length > 6000 ||
			typeof node.explanation !== "string" ||
			node.explanation.length > 12000 ||
			typeof node.section !== "string" ||
			node.section.length > 180 ||
			typeof node.inferred !== "boolean"
		)
			return "Every node needs a unique ID, precise statement, kind, section and explanation";
		local.add(node.id);
		if (!Array.isArray(node.citations) || !node.citations.length || node.citations.length > 12)
			return `Node ${node.id} needs page evidence`;
		for (const citation of node.citations) {
			const page = source.pages.find((page) => page.number === citation.page);
			if (
				!page ||
				!chunk.pages.includes(citation.page) ||
				typeof citation.quote !== "string" ||
				citation.quote.trim().length < 8 ||
				citation.quote.length > 1600 ||
				!["text", "visual"].includes(citation.mode)
			)
				return `Node ${node.id} cites a page outside the current chunk or has incomplete evidence`;
			if (
				citation.mode === "text" &&
				!normalizeSourceText(page.text).includes(normalizeSourceText(citation.quote))
			)
				return `The quote for ${node.id} does not occur on page ${citation.page}; quote the source exactly`;
			if (citation.mode === "visual" && !page.needsVisual)
				return `Use a verified text quote on page ${citation.page}`;
		}
	}
	const all = new Set([...known, ...local]);
	for (const e of p.edges)
		if (
			!e ||
			!all.has(e.from) ||
			!all.has(e.to) ||
			e.from === e.to ||
			!["requires", "derives", "illustrates"].includes(e.kind) ||
			typeof e.reason !== "string" ||
			!e.reason.trim() ||
			e.reason.length > 1500 ||
			typeof e.inferred !== "boolean"
		)
			return "Every dependency must connect existing nodes and explain its direction";
	const covered = new Set<string>();
	for (const c of p.coverage) {
		if (
			!c ||
			!chunk.blockIds.includes(c.blockId) ||
			covered.has(c.blockId) ||
			!Array.isArray(c.nodeIds) ||
			c.nodeIds.some((id) => !all.has(id)) ||
			typeof c.reason !== "string" ||
			c.reason.length > 1500 ||
			(!c.nodeIds.length && !c.reason.trim())
		)
			return "Account for each source block using node IDs or an explicit non-conceptual/uncertain reason";
		covered.add(c.blockId);
	}
	if (covered.size !== chunk.blockIds.length)
		return "Coverage must include every block in this chunk, not just its most interesting result";
	const merged = [...source.nodes, ...p.nodes.filter((n) => !known.has(n.id))];
	if (documentCycle(merged, [...source.edges, ...p.edges]))
		return "Dependencies form a cycle; preserve separate claims and fix the prerequisite directions";
	return null;
}
export function documentCoverage(source: DocumentSource) {
	const done = new Set(source.coverage.map((c) => c.blockId)),
		total = source.chunks.flatMap((c) => c.blockIds);
	return {
		done: total.filter((id) => done.has(id)).length,
		total: total.length,
		pagesDone: source.pages.filter((p) => {
			const blocks = p.blocks.length ? p.blocks.map((b) => b.id) : [`p${p.number}-visual`];
			return blocks.every((id) => done.has(id));
		}).length,
		visualQuotes: source.nodes.reduce((n, node) => n + node.citations.filter((c) => !c.verified).length, 0),
		uncertain: source.coverage.filter(
			(c) => !c.nodeIds.length && /uncertain|unreadable|illegible|unclear|missing/i.test(c.reason),
		).length,
	};
}

/** A stable layered layout for the focused source DAG, independent of mastery. */
export function layoutDocumentMap(nodes: DocumentNode[], edges: DocumentEdge[], focus?: string, limit = 64) {
	let chosen = nodes;
	if (nodes.length > limit) {
		const included = new Set<string>(),
			queue = [focus ?? nodes[0]?.id].filter((id): id is string => !!id);
		while (queue.length && included.size < limit) {
			const id = queue.shift()!;
			if (included.has(id)) continue;
			included.add(id);
			for (const edge of edges) {
				if (edge.to === id && !included.has(edge.from)) queue.push(edge.from);
				if (edge.from === id && !included.has(edge.to)) queue.push(edge.to);
			}
		}
		chosen = nodes.filter((n) => included.has(n.id));
	}
	const ids = new Set(chosen.map((n) => n.id)),
		links = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
	const degree = new Map(chosen.map((n) => [n.id, 0])),
		level = new Map(chosen.map((n) => [n.id, 0]));
	for (const e of links) degree.set(e.to, degree.get(e.to)! + 1);
	const ready = chosen.filter((n) => !degree.get(n.id)).map((n) => n.id);
	while (ready.length) {
		const id = ready.shift()!;
		for (const e of links.filter((e) => e.from === id)) {
			level.set(e.to, Math.max(level.get(e.to)!, level.get(id)! + 1));
			degree.set(e.to, degree.get(e.to)! - 1);
			if (!degree.get(e.to)) ready.push(e.to);
		}
	}
	const levels = new Map<number, DocumentNode[]>();
	for (const node of chosen) {
		const rank = level.get(node.id)!;
		levels.set(rank, [...(levels.get(rank) ?? []), node]);
	}
	const positioned = chosen.map((node) => {
		const column = levels.get(level.get(node.id)!)!;
		return { node, x: level.get(node.id)! * 300, y: (column.indexOf(node) - (column.length - 1) / 2) * 108 };
	});
	return { nodes: positioned, edges: links, total: nodes.length };
}

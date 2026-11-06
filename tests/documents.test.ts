import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import {
	documentCoverage,
	documentCycle,
	normalizeSourceText,
	selectedDocumentPages,
	validateDocumentProposal,
	type DocumentProposal,
	type DocumentSource,
	type DocumentChunk,
} from "../src/core/documents.ts";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "lh-source-tests-"));
process.env.LH_DATA_DIR = temporary;
const {
	createDocument,
	prepareDocument,
	getDocument,
	startDocument,
	pauseDocument,
	retryDocumentGaps,
	mergeDocumentChunk,
	documentPageImage,
	documentFile,
} = await import("../src/server/documents.ts");
const { pdfSourcePages, pdfExtract } = await import("../src/agent/subagents/pdf-ops.ts");
const { extractDocumentMap } = await import("../src/agent/subagents/document-map.ts");
const { stores } = await import("../src/server/stores.ts");
const fixture = path.join(import.meta.dirname, "fixtures/conditional-evidence.pdf");
after(() => fs.rmSync(temporary, { recursive: true, force: true }));
function proposal(source: DocumentSource, chunk: DocumentChunk): DocumentProposal {
	const blocks = source.pages.flatMap((p) => p.blocks).filter((b) => chunk.blockIds.includes(b.id));
	return {
		nodes: blocks.map((block, i) => ({
			id: `p${i + 1}`,
			title: `Claim from page ${block.page}`,
			kind: "result",
			statement: block.text.split("\n")[1]!,
			explanation: block.text,
			section: block.text.split("\n")[0]!,
			inferred: false,
			citations: [{ page: block.page, quote: block.text.split("\n")[1]!, mode: "text" }],
		})),
		edges: [],
		coverage: blocks.map((block, i) => ({
			blockId: block.id,
			nodeIds: [`p${i + 1}`],
			reason: "The complete source block is retained in its explanation.",
		})),
	};
}
async function waitSettled(id: string) {
	for (let i = 0; i < 100; i++) {
		const value = getDocument(id);
		if (value.status !== "processing") return value;
		await new Promise((r) => setTimeout(r, 10));
	}
	throw new Error("Source did not settle");
}

describe("source-first PDF study maps", () => {
	it("extracts real page boundaries and preserves mathematical conditions/line breaks", async () => {
		const pages = await pdfSourcePages(fixture, [1, 2, 3, 4]);
		assert.equal(pages.length, 4);
		assert.match(pages[0]!.text, /provided P\(B\) > 0/);
		assert.match(pages[1]!.text, /Bayes odds\nPrior odds/);
		assert.match(pages[3]!.text, /conditional on A and separately conditional on not A/);
		assert.match(await pdfExtract(fixture, "3"), /True positive mass.*\nFalse positive mass/);
	});
	it("uses content identity, bounded chapter selection and native page rendering", async () => {
		const bytes = fs.readFileSync(fixture),
			first = await createDocument(bytes, "Conditional evidence.pdf"),
			same = await createDocument(bytes, "renamed.pdf");
		assert.equal(first.id, same.id);
		assert.equal(first.pageCount, 4);
		assert.equal(first.nodes.length, 0);
		assert.equal(first.status, "uploaded");
		assert.deepEqual(selectedDocumentPages("3,1-2,2", 4), [1, 2, 3]);
		assert.throws(() => selectedDocumentPages("all", 600), /chapter/);
		assert.throws(() => selectedDocumentPages("0-2", 4));
		const prepared = await prepareDocument(first.id, "all");
		assert.equal(prepared.pages.length, 4);
		assert.equal(prepared.chunks.length, 2);
		const image = await documentPageImage(first.id, 3);
		assert.deepEqual([...image.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
		const partial = documentFile(first.id, "bytes=0-4");
		assert.equal(partial.status, 206);
		assert.equal(await partial.text(), "%PDF-");
		assert.equal(documentFile(first.id, "bytes=999999-").status, 416);
	});
	it("rejects invented evidence, missing blocks, invalid pages and cycles before committing", () => {
		const source = stores.documentStore.list()[0]!,
			chunk = source.chunks[0]!,
			good = proposal(source, chunk);
		assert.equal(validateDocumentProposal(good, source, chunk), null);
		const badQuote = structuredClone(good);
		badQuote.nodes[0]!.citations[0]!.quote = "An invented proposition not in the PDF";
		assert.match(validateDocumentProposal(badQuote, source, chunk)!, /does not occur/);
		const missing = structuredClone(good);
		missing.coverage.pop();
		assert.match(validateDocumentProposal(missing, source, chunk)!, /every block/);
		const badPage = structuredClone(good);
		badPage.nodes[0]!.citations[0]!.page = 4;
		assert.match(validateDocumentProposal(badPage, source, chunk)!, /outside/);
		const cycle = structuredClone(good);
		cycle.edges = [
			{ from: "p1", to: "p2", kind: "requires", reason: "a", inferred: false },
			{ from: "p2", to: "p1", kind: "requires", reason: "b", inferred: false },
		];
		assert.match(validateDocumentProposal(cycle, source, chunk)!, /cycle/);
	});
	it("runs extraction and a separate coverage audit through the actual submit seam", async () => {
		const source = stores.documentStore.list()[0]!,
			chunk = source.chunks[0]!,
			result = proposal(source, chunk),
			faux = createFauxCore({});
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall("submit_document_map", JSON.parse(JSON.stringify(result)))], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage([fauxToolCall("submit_document_map", JSON.parse(JSON.stringify(result)))], {
				stopReason: "toolUse",
			}),
		]);
		let calls = 0,
			imageCalls = 0;
		const streamFn: typeof faux.streamSimple = (model, context, options) => {
			if (context.messages.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === "image")))
				imageCalls++;
			return faux.streamSimple(model, context, options);
		};
		const output = await extractDocumentMap({
			source,
			chunk,
			engine: { model: faux.getModel(), streamFn },
			images: [{ page: 1, data: Buffer.from(await documentPageImage(source.id, 1)).toString("base64") }],
			onUsage: () => calls++,
		});
		assert.deepEqual(output, result);
		assert.equal(imageCalls, 2, "both passes receive native source images");
		assert.equal(calls, 2, "a schema-valid first pass does not replace the coverage review");
	});
	it("keeps completed chunks on failure and resumes without replaying or duplicating them", async () => {
		const source = stores.documentStore.list()[0]!,
			faux = createFauxCore({}),
			engine = { model: faux.getModel(), streamFn: faux.streamSimple };
		let calls = 0;
		startDocument(source.id, {
			engine,
			extract: async ({ source, chunk }) => {
				calls++;
				if (calls === 2) throw new Error("provider unavailable");
				return proposal(source, chunk);
			},
		});
		let partial = await waitSettled(source.id);
		assert.equal(partial.status, "partial");
		assert.equal(partial.chunks.filter((c) => c.completedAt !== undefined).length, 1);
		const earlier = partial.nodes.map((n) => n.id);
		startDocument(source.id, {
			engine,
			extract: async ({ source, chunk }) => {
				calls++;
				return proposal(source, chunk);
			},
		});
		const done = await waitSettled(source.id);
		assert.equal(done.status, "complete");
		assert.equal(calls, 3);
		assert.equal(new Set(done.nodes.map((n) => n.id)).size, done.nodes.length);
		assert.ok(earlier.every((id) => done.nodes.some((n) => n.id === id)));
		assert.equal(documentCoverage(done).pagesDone, 4);
		assert.equal(documentCoverage(done).done, documentCoverage(done).total);
		assert.equal(documentCycle(done.nodes, done.edges), false);
		assert.equal("mastery" in done, false);
		assert.equal(
			stores.graphStore.readNodes().length,
			0,
			"source prerequisites do not become learner knowledge or reasoning-chain edges",
		);
		const again = mergeDocumentChunk(done, source.chunks[0]!, proposal(source, source.chunks[0]!));
		assert.equal(again.nodes.length, done.nodes.length);
	});
	it("pauses an in-flight reader without committing its chunk, then resumes and retries explicit gaps", async () => {
		const original = stores.documentStore.list()[0]!,
			id = "doc_" + "a".repeat(32);
		const source: DocumentSource = {
			...structuredClone(original),
			id,
			nodes: [],
			edges: [],
			coverage: [],
			chunks: original.chunks.map((c) => ({ ...c, completedAt: undefined })),
			status: "ready",
		};
		stores.documentStore.writePdf(id, fs.readFileSync(fixture));
		stores.documentStore.write(source);
		const faux = createFauxCore({}),
			engine = { model: faux.getModel(), streamFn: faux.streamSimple };
		let entered = false;
		startDocument(id, {
			engine,
			extract: async ({ signal, source, chunk }) => {
				entered = true;
				await new Promise<void>((resolve) => {
					if (signal?.aborted) resolve();
					else signal?.addEventListener("abort", () => resolve(), { once: true });
				});
				return proposal(source, chunk);
			},
		});
		for (let i = 0; i < 100 && !entered; i++) await new Promise((r) => setTimeout(r, 5));
		assert.ok(entered);
		const paused = await pauseDocument(id);
		assert.equal(paused.status, "paused");
		assert.equal(paused.nodes.length, 0);
		assert.equal(paused.chunks.filter((c) => c.completedAt !== undefined).length, 0);
		startDocument(id, { engine, extract: async ({ source, chunk }) => proposal(source, chunk) });
		const done = await waitSettled(id);
		assert.equal(done.status, "complete");
		const uncertain = {
			...done,
			coverage: done.coverage.map((c, i) =>
				i === 0
					? { ...c, nodeIds: [], reason: "Unclear mathematical condition; source inspection needed" }
					: c,
			),
			status: "partial" as const,
		};
		stores.documentStore.write(uncertain);
		const retry = retryDocumentGaps(id);
		assert.equal(retry.chunks.filter((c) => c.completedAt === undefined).length, 1);
		assert.equal(
			retry.nodes.length,
			done.nodes.length,
			"earlier cited material remains inspectable during a review",
		);
	});
	it("does not treat text normalization as permission to fabricate a quote", () => {
		assert.equal(normalizeSourceText("P(A)\n =  0.2"), "P(A) = 0.2");
		assert.throws(() => selectedDocumentPages("1-9999999", 5000), /300/);
	});
});

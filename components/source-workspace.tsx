"use client";
/* eslint-disable @next/next/no-img-element -- local rendered PDF pages preserve their intrinsic dimensions */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Pause, Play, Search } from "lucide-react";
import { documentCoverage, parseLearningEvidence, type DocumentSource, type DocumentNode } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { MessageResponse } from "@/components/ai-elements/message";
import { SourceMap } from "@/components/source-map";

export function SourceWorkspace({ id }: { id: string }) {
	const router = useRouter();
	const [source, setSource] = useState<DocumentSource>(),
		[error, setError] = useState<string>(),
		[busy, setBusy] = useState(false);
	const [range, setRange] = useState(""),
		[query, setQuery] = useState(""),
		[selected, setSelected] = useState<string>(),
		[page, setPage] = useState(1),
		[view, setView] = useState<"map" | "page">("map"),
		[detail, setDetail] = useState(false);
	const refresh = useCallback(async () => {
		const response = await fetch(`/api/sources/${id}`);
		const body = await response.json();
		if (!response.ok) throw new Error(body.error);
		setSource((previous) =>
			!previous || body.source.revision >= previous.revision ? body.source : previous,
		);
		setPage((previous) =>
			body.source.selectedPages.includes(previous) ? previous : (body.source.selectedPages[0] ?? 1),
		);
	}, [id]);
	useEffect(() => {
		void refresh().catch((e) => setError(e.message));
	}, [refresh]);
	useServerEvent("documents-changed", (event) => {
		if (event.id === id) void refresh().catch((e) => setError(e.message));
	});
	useServerResync(() => void refresh().catch((e) => setError(e.message)));
	const node = source?.nodes.find((n) => n.id === selected),
		coverage = source ? documentCoverage(source) : undefined;
	const filtered = useMemo(
		() =>
			source?.nodes.filter(
				(n) =>
					!query.trim() ||
					`${n.title} ${n.statement} ${n.section}`.toLowerCase().includes(query.toLowerCase()),
			) ?? [],
		[source?.nodes, query],
	);
	async function act(body: unknown) {
		if (busy) return;
		setBusy(true);
		setError(undefined);
		try {
			const response = await fetch(`/api/sources/${id}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error);
			setSource(data.source);
			if (data.source.selectedPages.length && !data.source.selectedPages.includes(page))
				setPage(data.source.selectedPages[0]);
		} catch (cause) {
			setError((cause as Error).message);
		} finally {
			setBusy(false);
		}
	}
	function choose(n: DocumentNode) {
		setSelected(n.id);
		setPage(n.citations[0]?.page ?? page);
	}
	async function study() {
		if (!node || !source) return;
		setBusy(true);
		setError(undefined);
		try {
			const snapshot = {
				instruction:
					"Teach me this source concept by guided derivation. First check its prerequisites. Use the exact source assumptions and citations; ask for my reasoning before revealing a worked solution.",
				source: { id, title: source.title, filename: source.filename },
				concept: node,
				prerequisites: source.edges
					.filter((e) => e.to === node.id)
					.map((e) => source.nodes.find((n) => n.id === e.from))
					.filter(Boolean),
			};
			const images = [];
			if (source.pages.find((p) => p.number === page)?.needsVisual) {
				const response = await fetch(`/api/sources/${id}/pages/${page}`);
				if (!response.ok) throw new Error("Could not attach the source page");
				const blob = await response.blob();
				const data = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => resolve(String(reader.result).split(",")[1]!);
					reader.onerror = () => reject(new Error("Could not read the source image"));
					reader.readAsDataURL(blob);
				});
				images.push({ name: `source-page-${page}.png`, mimeType: "image/png", data });
			}
			const evidence = parseLearningEvidence({
				code: [{ name: "source-concept.json", language: "json", source: JSON.stringify(snapshot, null, 2) }],
				...(images.length ? { images } : {}),
			});
			const response = await fetch("/api/chats", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: node.title }),
			});
			if (!response.ok) throw new Error("Could not open the study session");
			const chat = await response.json();
			const settings = await fetch(`/api/chats/${chat.id}/settings`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ teachingMode: "guided" }),
			});
			if (!settings.ok) throw new Error("Could not select Guided mode");
			sessionStorage.setItem("lh:incoming-evidence", JSON.stringify({ chatId: chat.id, evidence }));
			router.push(`/chat/${chat.id}`);
		} catch (cause) {
			setError((cause as Error).message);
			setBusy(false);
		}
	}
	if (!source)
		return (
			<div className="study-empty" role={error ? "alert" : "status"}>
				{error ?? "Loading source…"}
			</div>
		);
	const processing = source.status === "processing",
		preparing = source.status === "preparing",
		unfinished = source.chunks.some((c) => c.completedAt === undefined);
	const currentIndex = source.selectedPages.indexOf(page);
	return (
		<div className="source-product">
			<header className="source-header">
				<Link href="/sources" aria-label="Back to sources" className="study-icon-button">
					<ArrowLeft size={16} />
				</Link>
				<div className="min-w-0 flex-1">
					<h2>{source.title}</h2>
					<div className="source-meta">
						<span>{source.pageCount} pages</span>
						{source.selectedPages.length > 0 && <span>{source.selectedPages.length} selected</span>}
						{source.nodes.length > 0 && <span>{source.nodes.length} concepts</span>}
						<span>
							{processing
								? source.activity
								: source.status === "complete"
									? "Map ready"
									: source.status === "uploaded"
										? "Not processed"
										: source.status}
						</span>
					</div>
				</div>
				{processing ? (
					<button disabled={busy} className="study-primary" onClick={() => void act({ action: "pause" })}>
						<Pause size={13} />
						Pause
					</button>
				) : unfinished ? (
					<button disabled={busy} className="study-primary" onClick={() => void act({ action: "start" })}>
						<Play size={13} />
						{source.coverage.length ? "Resume" : "Build map"}
					</button>
				) : null}
				<button
					aria-label="Source processing details"
					className="study-icon-button"
					onClick={() => setDetail(!detail)}
				>
					⋯
				</button>
			</header>
			{error && (
				<div role="alert" className="study-notice mb-4">
					{error}
					{/model|provider|key/i.test(error) && <Link href="/settings">Settings</Link>}
				</div>
			)}
			{source.error && !error && (
				<div className="study-notice mb-4" role="status">
					{source.error}
				</div>
			)}
			{(!source.selectedPages.length || detail) && (
				<form
					className="source-range"
					onSubmit={(e) => {
						e.preventDefault();
						void act({ action: "prepare", pages: range || "all" });
					}}
				>
					<label htmlFor="source-range">Pages</label>
					<input
						id="source-range"
						placeholder={
							source.pageCount <= 300 ? `All ${source.pageCount} pages` : "Chapter range, e.g. 25-48"
						}
						value={range}
						onChange={(e) => setRange(e.target.value)}
						disabled={busy || processing || preparing}
					/>
					<button className="study-primary" disabled={busy || processing || preparing}>
						{preparing ? "Reading…" : source.selectedPages.length ? "Add pages" : "Read pages"}
					</button>
					<span className="text-xs text-muted-foreground">
						{source.pageCount > 300 ? "Choose up to 300 pages" : "Use the whole PDF or select a chapter"}
					</span>
				</form>
			)}
			{!!coverage?.uncertain && !processing && (
				<button
					className="study-primary mb-4"
					disabled={busy}
					onClick={() => void act({ action: "retry-gaps" })}
				>
					Retry unresolved source blocks
				</button>
			)}
			{detail && source.chunks.length > 0 && (
				<div className="source-processing-details study-enter">
					<p>
						{coverage?.done}/{coverage?.total} source blocks accounted for · {coverage?.pagesDone}/
						{source.selectedPages.length} pages ·{" "}
						{source.chunks.filter((c) => c.completedAt !== undefined).length}/{source.chunks.length} chunks
						saved
					</p>
					<p>
						{source.chunks.reduce((n, c) => n + (c.calls ?? 0), 0)} model calls ·{" "}
						{source.chunks.reduce((n, c) => n + (c.tokens ?? 0), 0).toLocaleString()} tokens
					</p>
					{!!coverage?.visualQuotes && (
						<p>{coverage.visualQuotes} visual citations need source inspection.</p>
					)}
					<details className="mt-3">
						<summary>Page coverage and reading warnings</summary>
						{source.pages.map((p) => (
							<button
								key={p.number}
								className="study-history-row w-full"
								onClick={() => {
									setPage(p.number);
									setView("page");
								}}
							>
								<span>
									Page {p.number} ·{" "}
									{source.chunks
										.filter((c) => c.pages.includes(p.number))
										.every((c) => c.completedAt !== undefined)
										? "processed"
										: "pending"}
								</span>
								<span>{p.warnings.join(" · ") || `${p.blocks.length} text blocks`}</span>
							</button>
						))}
						{source.coverage
							.filter((c) => !c.nodeIds.length)
							.map((c) => (
								<p key={c.blockId} className="mt-2 text-xs">
									{c.blockId}: {c.reason}
								</p>
							))}
					</details>
					<p>Source coverage is separate from mastery. Importing does not mark a concept as learned.</p>
				</div>
			)}
			{source.selectedPages.length > 0 && (
				<div className="source-workspace">
					<aside className="source-outline">
						<div className="source-search">
							<Search size={13} />
							<input
								aria-label="Search source concepts"
								placeholder="Find a concept"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
						</div>
						<div className="source-outline-list">
							{filtered.length ? (
								filtered.map((n) => (
									<button key={n.id} aria-pressed={selected === n.id} onClick={() => choose(n)}>
										<span>{n.title}</span>
										<small>
											{n.kind} · p. {n.citations[0]?.page}
										</small>
									</button>
								))
							) : (
								<div className="p-4 text-xs text-muted-foreground">
									{query
										? "No matching concepts"
										: processing
											? "Reading source…"
											: "Build the map to explore concepts."}
								</div>
							)}
						</div>
					</aside>
					<section className="source-stage">
						<div className="source-stage-bar">
							<div className="study-segments">
								<button aria-pressed={view === "map"} onClick={() => setView("map")}>
									Map
								</button>
								<button aria-pressed={view === "page"} onClick={() => setView("page")}>
									Page
								</button>
							</div>
							{view === "page" && (
								<div className="flex items-center gap-2">
									<button
										className="study-icon-button"
										aria-label="Previous source page"
										disabled={currentIndex <= 0}
										onClick={() => setPage(source.selectedPages[currentIndex - 1]!)}
									>
										<ChevronLeft size={14} />
									</button>
									<span className="text-xs">p. {page}</span>
									<button
										className="study-icon-button"
										aria-label="Next source page"
										disabled={currentIndex < 0 || currentIndex >= source.selectedPages.length - 1}
										onClick={() => setPage(source.selectedPages[currentIndex + 1]!)}
									>
										<ChevronRight size={14} />
									</button>
									<a
										href={`/api/sources/${id}/file#page=${page}`}
										target="_blank"
										rel="noreferrer"
										aria-label="Open original PDF"
										className="study-icon-button"
									>
										<ExternalLink size={13} />
									</a>
								</div>
							)}
						</div>
						{view === "map" ? (
							source.nodes.length ? (
								<SourceMap
									source={source}
									selected={selected}
									onSelect={(id) => {
										const n = source.nodes.find((n) => n.id === id);
										if (n) choose(n);
									}}
								/>
							) : (
								<div className="study-empty">
									{processing
										? source.activity
										: preparing
											? "Reading PDF pages…"
											: `${source.selectedPages.length} pages ready to map`}
								</div>
							)
						) : (
							<div className="source-page-image">
								{/* Native source image: no remote optimizer or upload. */}
								<img
									key={page}
									src={`/api/sources/${id}/pages/${page}`}
									alt={`Page ${page} of ${source.title}`}
								/>
							</div>
						)}
					</section>
					<aside className="source-inspector">
						{node ? (
							<>
								<div className="flex items-center justify-between">
									<span className="text-xs text-muted-foreground">
										{node.kind}
										{node.inferred ? " · inferred" : ""}
									</span>
									<span className="text-xs text-muted-foreground">Not assessed</span>
								</div>
								<h3>{node.title}</h3>
								<div className="lh-prose">
									<MessageResponse mode="static">{node.statement}</MessageResponse>
								</div>
								{node.explanation && (
									<div className="source-explanation lh-prose">
										<MessageResponse mode="static">{node.explanation}</MessageResponse>
									</div>
								)}
								<div className="source-citations">
									<h4>Source</h4>
									{node.citations.map((c, i) => (
										<button
											key={i}
											onClick={() => {
												setPage(c.page);
												setView("page");
											}}
										>
											<span>
												Page {c.page}
												{c.verified ? "" : " · visual, unverified"}
											</span>
											<q>{c.quote}</q>
										</button>
									))}
								</div>
								{source.edges.some((e) => e.to === node.id) && (
									<div className="source-prerequisites">
										<h4>Depends on</h4>
										{source.edges
											.filter((e) => e.to === node.id)
											.map((edge, i) => (
												<button
													key={i}
													onClick={() => {
														const n = source.nodes.find((n) => n.id === edge.from);
														if (n) choose(n);
													}}
												>
													{source.nodes.find((n) => n.id === edge.from)?.title}
													<small>
														{edge.reason}
														{edge.inferred ? " (inferred)" : ""}
													</small>
												</button>
											))}
									</div>
								)}
								<button disabled={busy} onClick={() => void study()} className="study-primary mt-6 w-full">
									Study this concept
								</button>
							</>
						) : (
							<div className="study-empty">Select a concept</div>
						)}
					</aside>
				</div>
			)}
		</div>
	);
}

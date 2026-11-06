"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BookOpen, Plus, Upload } from "lucide-react";
import { useServerEvent, useServerResync } from "@/components/server-events";

interface SourceRow {
	id: string;
	title: string;
	filename: string;
	pageCount: number;
	selectedCount: number;
	nodeCount: number;
	status: string;
	activity?: string;
	updatedAt: number;
	coverage: { done: number; total: number };
}
export function SourceLibrary() {
	const router = useRouter(),
		file = useRef<HTMLInputElement>(null);
	const [sources, setSources] = useState<SourceRow[]>([]),
		[loading, setLoading] = useState(true),
		[uploading, setUploading] = useState(false),
		[error, setError] = useState<string>();
	const refresh = useCallback(async () => {
		const response = await fetch("/api/sources");
		if (!response.ok) throw new Error("Could not load sources");
		setSources((await response.json()).sources);
		setLoading(false);
	}, []);
	useEffect(() => {
		void refresh().catch((e) => {
			setError(e.message);
			setLoading(false);
		});
	}, [refresh]);
	useServerEvent("documents-changed", () => void refresh().catch((e) => setError(e.message)));
	useServerResync(() => void refresh().catch((e) => setError(e.message)));
	async function upload(selected?: File) {
		if (!selected || uploading) return;
		setError(undefined);
		if (!/\.pdf$/i.test(selected.name) || selected.size > 50 * 1024 * 1024) {
			setError("Choose a PDF paper or chapter up to 50 MB");
			return;
		}
		setUploading(true);
		try {
			const form = new FormData();
			form.append("file", selected);
			const response = await fetch("/api/sources", { method: "POST", body: form });
			const body = await response.json();
			if (!response.ok) throw new Error(body.error);
			router.push(`/sources/${body.source.id}`);
		} catch (cause) {
			setError((cause as Error).message);
			setUploading(false);
		}
	}
	return (
		<div className="source-library">
			<input
				ref={file}
				aria-label="Upload PDF"
				type="file"
				accept="application/pdf,.pdf"
				className="sr-only"
				onChange={(e) => {
					void upload(e.target.files?.[0]);
					e.target.value = "";
				}}
			/>
			{error && (
				<div className="study-notice mb-5" role="alert">
					{error}
				</div>
			)}
			{loading ? (
				<div className="study-empty">Loading…</div>
			) : sources.length ? (
				<>
					<div className="mb-5 flex items-center justify-between">
						<span className="text-sm text-muted-foreground">
							{sources.length} {sources.length === 1 ? "source" : "sources"}
						</span>
						<button className="study-primary" disabled={uploading} onClick={() => file.current?.click()}>
							<Plus size={14} />
							{uploading ? "Adding…" : "Add PDF"}
						</button>
					</div>
					<div className="source-rows">
						{sources.map((source) => (
							<Link key={source.id} href={`/sources/${source.id}`} className="source-library-row">
								<BookOpen size={18} className="text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<h2 className="truncate">{source.title}</h2>
									<div className="mt-1 flex gap-4 text-xs text-muted-foreground">
										<span>{source.pageCount} pages</span>
										{source.nodeCount > 0 && <span>{source.nodeCount} concepts</span>}
										<span>
											{source.status === "processing"
												? source.activity
												: source.status === "complete"
													? "Map ready"
													: source.status === "uploaded"
														? "Select pages"
														: source.status === "paused"
															? "Paused"
															: source.status === "ready"
																? "Ready to build"
																: source.status}
										</span>
									</div>
								</div>
								<ArrowUpRight size={15} className="text-muted-foreground" />
							</Link>
						))}
					</div>
				</>
			) : (
				<button
					disabled={uploading}
					className="source-drop"
					onClick={() => file.current?.click()}
					onDragOver={(e) => e.preventDefault()}
					onDrop={(e) => {
						e.preventDefault();
						void upload(e.dataTransfer.files[0]);
					}}
				>
					<Upload size={24} />
					<span className="text-base text-foreground">
						{uploading ? "Adding PDF…" : "Add a paper or textbook chapter"}
					</span>
					<span className="text-xs">Drop a PDF or choose a file</span>
				</button>
			)}
		</div>
	);
}

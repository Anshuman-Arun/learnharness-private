"use client";

import { useEffect, useState } from "react";
import { hasLearningEvidence, parseLearningEvidence, MAX_EVIDENCE_IMAGE_BYTES, type LearningEvidence } from "@/src/core";

/** Only submitted snapshots enter the agent's context; editing stays private. */
export function EvidenceInput({ value, onChange, disabled = false, onBusyChange }: {
	value?: LearningEvidence;
	onChange: (value: LearningEvidence | undefined) => void;
	disabled?: boolean;
	onBusyChange?: (busy: boolean) => void;
}) {
	const [error, setError] = useState<string>();
	const [reading, setReading] = useState(false);
	const [editingCode, setEditingCode] = useState(false);
	const [source, setSource] = useState("");
	const [name, setName] = useState("main.cpp");
	const [language, setLanguage] = useState("cpp");
	useEffect(() => {
		try {
			const raw = sessionStorage.getItem("lh:incoming-evidence");
			if (!raw) return;
			const incoming = JSON.parse(raw) as { chatId: string; evidence: LearningEvidence };
			if (window.location.pathname !== `/chat/${incoming.chatId}`) return;
			onChange(parseLearningEvidence(incoming.evidence));
			sessionStorage.removeItem("lh:incoming-evidence");
		} catch { setError("Could not recover the incoming work. Return to the workspace to bring it again."); }
		// A handoff is consumed once by the mounted input for this session.
	}, []);
	async function addImages(files: File[]) {
		if (reading || !files.length) return;
		setReading(true); onBusyChange?.(true); setError(undefined);
		try {
			if (files.length + (value?.images?.length ?? 0) > 4) throw new Error("Attach up to four images");
			const images = await Promise.all(files.map(async (file) => {
				if (file.size > MAX_EVIDENCE_IMAGE_BYTES) throw new Error("Each image must be at most 5 MB");
				return new Promise<{ name: string; mimeType: "image/png" | "image/jpeg" | "image/webp"; data: string }>((resolve, reject) => {
					const reader = new FileReader();
					reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
					reader.onload = () => resolve({ name: file.name, mimeType: file.type as "image/png" | "image/jpeg" | "image/webp", data: String(reader.result).split(",")[1] ?? "" });
					reader.readAsDataURL(file);
				});
			}));
			onChange(parseLearningEvidence({ ...value, images: [...(value?.images ?? []), ...images] }));
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not attach work"); }
		finally { setReading(false); onBusyChange?.(false); }
	}
	function addCode() {
		try {
			onChange(parseLearningEvidence({ ...value, code: [...(value?.code ?? []), { name, language, source }] }));
			setSource(""); setEditingCode(false); setError(undefined);
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid code"); }
	}
	return <div className="space-y-2 px-3 py-2 text-xs" data-testid="evidence-input">
		<div className="flex flex-wrap items-center gap-3">
			<label className="cursor-pointer underline">Attach sketch/image
				<input type="file" aria-label="Attach sketch or image" accept="image/png,image/jpeg,image/webp" multiple disabled={disabled || reading}
					className="sr-only" onChange={(event) => { void addImages(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
			</label>
			<button type="button" disabled={disabled || reading} className="underline" onClick={() => setEditingCode(!editingCode)}>Attach code</button>
			{reading && <span role="status">Reading images…</span>}
		</div>
		{editingCode && <div className="space-y-2">
			<div className="flex gap-2">
				<input aria-label="Code filename" value={name} onChange={(event) => setName(event.target.value)} className="min-w-0 rounded border bg-background p-1" />
				<input aria-label="Code language" value={language} onChange={(event) => setLanguage(event.target.value)} className="min-w-0 rounded border bg-background p-1" />
			</div>
			<textarea aria-label="Code snapshot" value={source} onChange={(event) => setSource(event.target.value)} rows={6} spellCheck={false} className="w-full rounded border bg-background p-2 font-mono" />
			<button type="button" disabled={disabled || !source.trim()} onClick={addCode} className="underline">Add code snapshot</button>
		</div>}
		{hasLearningEvidence(value) && <>
			<ul aria-label="Work to submit" className="space-y-1">
				{value?.images?.map((image, index) => <li key={`image-${index}`} className="flex gap-2"><span>{image.name}</span><button type="button" disabled={disabled || reading} aria-label={`Remove ${image.name}`} onClick={() => onChange(parseLearningEvidence({ ...value, images: value.images?.filter((_, i) => i !== index) }))}>Remove</button></li>)}
				{value?.code?.map((code, index) => <li key={`code-${index}`} className="flex gap-2"><span>{code.name}</span><button type="button" disabled={disabled || reading} aria-label={`Remove ${code.name}`} onClick={() => onChange(parseLearningEvidence({ ...value, code: value.code?.filter((_, i) => i !== index) }))}>Remove</button></li>)}
			</ul>
			<p className="text-muted-foreground">Included with your next submission. Images require an image-capable model.</p>
		</>}
		{error && <p role="alert" className="text-destructive">{error}</p>}
	</div>;
}

export function EvidencePreview({ evidence }: { evidence?: LearningEvidence }) {
	if (!hasLearningEvidence(evidence)) return null;
	return <div className="my-2 space-y-2" data-testid="submitted-evidence">
		{evidence?.images?.map((image, i) => <figure key={i}>
			{/* Bounded local image data is deliberately not fetched through an optimizer. */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name} className="max-h-80 max-w-full rounded border" />
			<figcaption className="text-xs text-muted-foreground">{image.name}</figcaption>
		</figure>)}
		{evidence?.code?.map((code, i) => <details key={i} className="rounded border p-2">
			<summary>{code.name} ({code.language})</summary>
			<pre className="overflow-auto whitespace-pre-wrap text-xs">{code.source}</pre>
			{code.prediction && <p>Prediction: {code.prediction}</p>}
			{code.stdout && <pre className="whitespace-pre-wrap text-xs">Reported stdout: {code.stdout}</pre>}
			{code.stderr && <pre className="whitespace-pre-wrap text-xs">Reported stderr: {code.stderr}</pre>}
		</details>)}
	</div>;
}

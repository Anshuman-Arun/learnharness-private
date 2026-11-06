/** Image transport/validation adapted from upstream LearnHarness PR #263
 * (890e5693946410c6d9f17bb4a598bfb74c38d3d7, AGPL-3.0).
 * Extended here to question results, practice traces and code snapshots. */
export interface EvidenceImage {
	name: string;
	mimeType: "image/png" | "image/jpeg" | "image/webp";
	data: string;
}
export interface CodeEvidence {
	name: string;
	language: string;
	source: string;
	/** Client-reported output is evidence, never a trusted judge verdict. */
	stdout?: string;
	stderr?: string;
	prediction?: string;
	/** Reported execution metadata, not a trusted judge verdict. */
	execution?: {
		ok: boolean;
		exitCode: number | null;
		errorKind: "none" | "compile" | "runtime" | "timeout" | "resource" | "output-limit" | "checks";
		timedOut: boolean;
	};
}
export interface LearningEvidence {
	images?: EvidenceImage[];
	code?: CodeEvidence[];
	source?: { kind: "scratchpad" | "workspace" | "cpp-run"; id: string; pageId?: string; sessionId?: string; questionId?: string };
}
export const MAX_EVIDENCE_IMAGES = 4;
export const MAX_EVIDENCE_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_EVIDENCE_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_CODE_CHARS = 64 * 1024;

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Evidence must be an object");
	return value as Record<string, unknown>;
}
function filename(value: unknown): string {
	if (typeof value !== "string" || !value.trim() || value.length > 255 || /[/\\\u0000-\u001f\u007f]/.test(value)) throw new Error("Evidence filename is invalid");
	return value;
}
export function hasLearningEvidence(value: LearningEvidence | undefined): boolean {
	return !!(value?.images?.length || value?.code?.length);
}
/** Browser-safe validation; return a canonical copy, not untrusted extra fields. */
export function parseLearningEvidence(value: unknown): LearningEvidence | undefined {
	if (value === undefined) return undefined;
	const raw = record(value);
	const result: LearningEvidence = {};
	if (raw.source !== undefined) {
		const source = record(raw.source);
		if (source.kind !== "scratchpad" && source.kind !== "workspace" && source.kind !== "cpp-run") throw new Error("Invalid evidence source");
		const identity = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
		if (!identity(source.id)) throw new Error("Invalid evidence source identity");
		result.source = { kind: source.kind, id: source.id as string };
		for (const key of ["pageId", "sessionId", "questionId"] as const) if (source[key] !== undefined) {
			const valid = key === "questionId" ? typeof source[key] === "string" && !!source[key] && source[key].length <= 256 && !/[\u0000-\u001f\u007f]/.test(source[key]) : identity(source[key]);
			if (!valid) throw new Error("Invalid evidence context reference");
			result.source[key] = source[key] as string;
		}
	}
	if (raw.images !== undefined) {
		if (!Array.isArray(raw.images) || raw.images.length > MAX_EVIDENCE_IMAGES) throw new Error("Attach up to four images");
		let total = 0;
		result.images = raw.images.map((item) => {
			const image = record(item);
			const name = filename(image.name);
			if (image.mimeType !== "image/png" && image.mimeType !== "image/jpeg" && image.mimeType !== "image/webp") throw new Error("Use PNG, JPEG or WebP evidence");
			if (typeof image.data !== "string" || !image.data || image.data.length > Math.ceil(MAX_EVIDENCE_IMAGE_BYTES / 3) * 4 || image.data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(image.data)) throw new Error("Image evidence must be bounded canonical base64");
			let decoded: string;
			try { decoded = atob(image.data); } catch { throw new Error("Image evidence must be canonical base64"); }
			if (btoa(decoded) !== image.data) throw new Error("Image evidence must be canonical base64");
			total += decoded.length;
			if (decoded.length > MAX_EVIDENCE_IMAGE_BYTES || total > MAX_EVIDENCE_TOTAL_BYTES) throw new Error("Images must be at most 5 MB each and 10 MB total");
			const signature = image.mimeType === "image/png"
				? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => decoded.charCodeAt(i) === byte)
				: image.mimeType === "image/jpeg"
					? decoded.charCodeAt(0) === 255 && decoded.charCodeAt(1) === 216 && decoded.charCodeAt(2) === 255
					: decoded.slice(0, 4) === "RIFF" && decoded.slice(8, 12) === "WEBP";
			if (!signature) throw new Error(`${name} does not match its image type`);
			return { name, mimeType: image.mimeType, data: image.data };
		});
	}
	if (raw.code !== undefined) {
		if (!Array.isArray(raw.code) || raw.code.length > 8) throw new Error("Submit up to eight code files");
		result.code = raw.code.map((item) => {
			const code = record(item);
			const name = filename(code.name);
			if (typeof code.language !== "string" || !code.language.trim() || code.language.length > 40) throw new Error("Code language is required");
			if (typeof code.source !== "string" || !code.source.trim() || code.source.length > MAX_CODE_CHARS) throw new Error("Code must contain 1–65536 characters");
			const snapshot: CodeEvidence = { name, language: code.language, source: code.source };
			for (const key of ["stdout", "stderr", "prediction"] as const) {
				if (code[key] !== undefined) {
					if (typeof code[key] !== "string" || code[key].length > 16384) throw new Error(`${key} must be text of at most 16384 characters`);
					snapshot[key] = code[key];
				}
			}
			if (code.execution !== undefined) {
				const execution = record(code.execution);
				if (typeof execution.ok !== "boolean" || typeof execution.timedOut !== "boolean" ||
					(execution.exitCode !== null && (typeof execution.exitCode !== "number" || !Number.isSafeInteger(execution.exitCode))) ||
					!["none", "compile", "runtime", "timeout", "resource", "output-limit", "checks"].includes(execution.errorKind as string)) throw new Error("Invalid reported execution status");
				snapshot.execution = { ok: execution.ok, exitCode: execution.exitCode as number | null, errorKind: execution.errorKind as NonNullable<CodeEvidence["execution"]>["errorKind"], timedOut: execution.timedOut };
			}
			return snapshot;
		});
	}
	return hasLearningEvidence(result) ? result : undefined;
}

export function evidenceImageContent(evidence: LearningEvidence | undefined) {
	return (evidence?.images ?? []).map(({ data, mimeType }) => ({ type: "image" as const, data, mimeType }));
}
export function evidenceDescription(evidence: LearningEvidence | undefined): string {
	if (!hasLearningEvidence(evidence)) return "";
	return `Submitted learner work (an attempt, not necessarily a final answer):\n${JSON.stringify({
		source: evidence?.source,
		images: evidence?.images?.map(({ name, mimeType }) => ({ name, mimeType })),
		code: evidence?.code,
	})}\nAny supplied stdout/stderr is client-reported; distinguish it from a verified execution. Ask about ambiguous marks rather than inventing their meaning.`;
}

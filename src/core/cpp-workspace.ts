import type { CodeEvidence, LearningEvidence } from "./learning-evidence.ts";

/** Source/run evidence shape follows upstream LearnHarness PR #241 (AGPL-3.0). */
export interface CppWorkspace {
	version: 1; id: string; revision: number; title: string; problem: string;
	files: Array<{ name: string; source: string }>; stdin: string; updatedAt: number;
	cases?: Array<{ name: string; stdin: string; expected: string }>;
	sanitize?: boolean;
}
export function parseCppWorkspace(raw: unknown): Omit<CppWorkspace, "revision" | "updatedAt"> {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Workspace must be an object");
	const w = raw as CppWorkspace;
	if (w.version !== 1 || typeof w.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(w.id)) throw new Error("Invalid workspace identity/version");
	if (typeof w.title !== "string" || !w.title.trim() || w.title.length > 120) throw new Error("Give the workspace a title of up to 120 characters");
	if (typeof w.problem !== "string" || w.problem.length > 32768 || typeof w.stdin !== "string" || w.stdin.length > 65536) throw new Error("Problem/input is too large");
	if (!Array.isArray(w.files) || !w.files.length || w.files.length > 8) throw new Error("A workspace needs 1–8 files");
	let total = 0;
	const files = w.files.map((file) => {
		if (!file || typeof file.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_.-]{0,58}\.(cpp|cc|cxx|h|hpp)$/.test(file.name)) throw new Error("Use a simple C++ filename without directories");
		if (typeof file.source !== "string" || file.source.length > 65536) throw new Error("Each source file must be at most 65536 characters");
		total += file.source.length;
		return { name: file.name, source: file.source };
	});
	if (new Set(files.map((file) => file.name.toLowerCase())).size !== files.length || total > 262144) throw new Error("Filenames must be unique; total source must be at most 256 KB");
	if (w.sanitize !== undefined && typeof w.sanitize !== "boolean") throw new Error("sanitize must be boolean");
	let cases: CppWorkspace["cases"];
	if (w.cases !== undefined) {
		if (!Array.isArray(w.cases) || w.cases.length > 8) throw new Error("Use up to eight test cases");
		cases = w.cases.map((item) => {
			if (!item || typeof item.name !== "string" || !item.name.trim() || item.name.length > 80 || typeof item.stdin !== "string" || item.stdin.length > 65536 || typeof item.expected !== "string" || item.expected.length > 16384) throw new Error("Invalid test case");
			return { name: item.name, stdin: item.stdin, expected: item.expected };
		});
	}
	return { version: 1, id: w.id, title: w.title.trim(), problem: w.problem, files, stdin: w.stdin, ...(cases ? { cases } : {}), ...(w.sanitize !== undefined ? { sanitize: w.sanitize } : {}) };
}
export function workspaceEvidence(workspace: CppWorkspace, names: readonly string[]): LearningEvidence {
	const code: CodeEvidence[] = workspace.files.filter((file) => names.includes(file.name) && file.source.trim()).map((file) => ({ name: file.name, language: "cpp", source: file.source }));
	if (!code.length) throw new Error("Select at least one nonempty code file");
	return { code, source: { kind: "workspace", id: workspace.id } };
}
export function emptyCppWorkspace(id: string): CppWorkspace {
	return { version: 1, id, revision: 0, title: "C++ workspace", problem: "", stdin: "", files: [{ name: "main.cpp", source: '#include <iostream>\n\nint main() {\n    // Write your solution here.\n    return 0;\n}\n' }], updatedAt: 0 };
}

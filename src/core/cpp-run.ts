import { parseCppWorkspace } from "./cpp-workspace.ts";
import { parseLearningEvidence, type LearningEvidence } from "./learning-evidence.ts";

/** Result vocabulary adapted from upstream LearnHarness PR #241 (AGPL-3.0). */
export interface CppExecutionRequest {
	files: Array<{ name: string; source: string }>;
	stdin: string;
	sanitize?: boolean;
	prediction?: string;
	cases?: Array<{ name: string; stdin: string; expected: string }>;
}
export interface CppRunReport {
	version: 1; id: string; createdAt: number; sourceHash: string;
	request: CppExecutionRequest; result: CppExecutionResult;
}
/** Pair output with the frozen source that ran, never later editor contents. */
export function cppRunEvidence(report: CppRunReport): LearningEvidence {
	const code = report.request.files.filter((file) => file.source.trim()).map((file) => ({ name: file.name, language: "cpp", source: file.source }));
	if (!code.length) throw new Error("There is no nonempty source in this run to attach");
	const bounded = (value: string) => value.length <= 16000 ? value : `${value.slice(0, 15800)}\n[Truncated; full local run report: ${report.id}]`;
	const stdout = report.result.cases ? JSON.stringify(report.result.cases.map((test) => ({ ...test, stdout: bounded(test.stdout).slice(0, 1024), stderr: bounded(test.stderr).slice(0, 1024) }))) : report.result.stdout;
	return parseLearningEvidence({ code: code.map((file, i) => i === 0 ? { ...file, stdout: bounded(stdout), stderr: bounded([report.result.compilerOutput, report.result.stderr].filter(Boolean).join("\n")), prediction: report.request.prediction } : file) })!;
}
export interface CppExecutionResult {
	ok: boolean; stdout: string; stderr: string; compileError?: string; timedOut: boolean;
	errorKind: "none" | "compile" | "runtime" | "timeout" | "resource" | "output-limit" | "checks";
	compilerOutput?: string;
	exitCode: number | null; durationMs: number; image: string;
	cases?: Array<{ name: string; passed: boolean; stdout: string; stderr: string; exitCode: number | null }>;
}
export function parseCppExecution(raw: unknown): CppExecutionRequest {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid execution request");
	const body = raw as CppExecutionRequest;
	const workspace = parseCppWorkspace({ version: 1, id: "execution", title: "Execution", problem: "", stdin: body.stdin, files: body.files });
	if (!workspace.files.some((file) => /\.(cpp|cc|cxx)$/.test(file.name))) throw new Error("Include a C++ source file");
	if (body.sanitize !== undefined && typeof body.sanitize !== "boolean") throw new Error("sanitize must be boolean");
	if (body.prediction !== undefined && (typeof body.prediction !== "string" || body.prediction.length > 4096)) throw new Error("Prediction must be text of up to 4096 characters");
	let cases: CppExecutionRequest["cases"];
	if (body.cases !== undefined) {
		if (!Array.isArray(body.cases) || !body.cases.length || body.cases.length > 8) throw new Error("Use 1–8 test cases");
		cases = body.cases.map((item) => {
			if (!item || typeof item.name !== "string" || !item.name.trim() || item.name.length > 80 || typeof item.stdin !== "string" || item.stdin.length > 65536 || typeof item.expected !== "string" || item.expected.length > 16384) throw new Error("Invalid test case name/input/expected output");
			return { name: item.name, stdin: item.stdin, expected: item.expected };
		});
	}
	return { files: workspace.files, stdin: workspace.stdin, sanitize: body.sanitize === true, ...(cases ? { cases } : {}), ...(body.prediction !== undefined ? { prediction: body.prediction } : {}) };
}

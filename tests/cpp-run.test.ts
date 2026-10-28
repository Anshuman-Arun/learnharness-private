import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cppRunEvidence, parseCppExecution, type CppRunReport } from "../src/core/cpp-run.ts";
import { evidenceDescription, parseLearningEvidence } from "../src/core/learning-evidence.ts";
import { newUserMessage, toLlmMessages } from "../src/core/native-messages.ts";

describe("C++ execution requests and learning evidence", () => {
	it("accepts only bounded C++ files, input and test definitions", () => {
		const request = { files: [{ name: "main.cpp", source: "int main() {}" }], stdin: "", cases: [{ name: "Empty", stdin: "", expected: "" }] };
		assert.equal(parseCppExecution(request).cases?.length, 1);
		for (const bad of [{ files: [{ name: "../a.cpp", source: "x" }] }, { files: [{ name: "a.hpp", source: "x" }] }, { sanitize: "yes" }, { cases: [] }, { cases: Array(9).fill(request.cases[0]) }, { stdin: "x".repeat(65537) }]) assert.throws(() => parseCppExecution({ ...request, ...bad }));
	});
	it("retains silent failures, null exits and timeouts through validation and provider replay", () => {
		for (const execution of [
			{ ok: false, exitCode: 1, errorKind: "runtime" as const, timedOut: false },
			{ ok: false, exitCode: null, errorKind: "timeout" as const, timedOut: true },
			{ ok: true, exitCode: 0, errorKind: "none" as const, timedOut: false },
		]) {
			const report: CppRunReport = { version: 1, id: "silent", createdAt: 1, sourceHash: "hash", request: { files: [{ name: "main.cpp", source: "int main(){return 1;}" }], stdin: "" }, result: { ...execution, stdout: "", stderr: "", durationMs: 1, image: "gcc" } };
			const evidence = parseLearningEvidence(JSON.parse(JSON.stringify(cppRunEvidence(report))));
			assert.deepEqual(evidence?.code?.[0]?.execution, execution);
			assert.match(evidenceDescription(evidence), new RegExp(`"errorKind":"${execution.errorKind}"`));
			assert.ok(JSON.stringify(toLlmMessages([newUserMessage("Review my run", evidence)])).includes('exitCode'));
		}
	});
	it("refuses malformed status metadata and drops untrusted extra fields", () => {
		const code = { name: "main.cpp", source: "int main(){}", language: "cpp" };
		const execution = { ok: false, exitCode: 1, errorKind: "runtime", timedOut: false };
		for (const bad of [null, [], { ...execution, ok: "false" }, { ...execution, exitCode: "1" }, { ...execution, exitCode: 1.5 }, { ...execution, exitCode: Infinity }, { ...execution, errorKind: "arbitrary" }, { ...execution, timedOut: "true" }]) assert.throws(() => parseLearningEvidence({ code: [{ ...code, execution: bad }] }));
		assert.deepEqual(parseLearningEvidence({ code: [{ ...code, execution: { ...execution, trusted: true } }] })?.code?.[0]?.execution, execution);
	});
	it("attaches source from the completed run and bounds outputs without rewriting the stored report", () => {
		const report: CppRunReport = { version: 1, id: "run-test", createdAt: 1, sourceHash: "hash", request: { files: [{ name: "main.cpp", source: "int original;" }], stdin: "", prediction: "42" }, result: { ok: true, stdout: "x".repeat(20000), stderr: "", timedOut: false, errorKind: "none", exitCode: 0, durationMs: 1, image: "gcc" } };
		const evidence = cppRunEvidence(report);
		assert.equal(evidence.code?.[0]?.source, "int original;");
		assert.equal(evidence.code?.[0]?.prediction, "42");
		assert.ok(evidence.code![0]!.stdout!.length <= 16384);
		assert.match(evidence.code![0]!.stdout!, /Truncated/);
		assert.equal(report.result.stdout.length, 20000);
	});
});

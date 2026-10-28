import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cppRunEvidence, parseCppExecution, type CppRunReport } from "../src/core/cpp-run.ts";

describe("C++ execution requests and learning evidence", () => {
	it("accepts only bounded C++ files, input and test definitions", () => {
		const request = { files: [{ name: "main.cpp", source: "int main() {}" }], stdin: "", cases: [{ name: "Empty", stdin: "", expected: "" }] };
		assert.equal(parseCppExecution(request).cases?.length, 1);
		for (const bad of [{ files: [{ name: "../a.cpp", source: "x" }] }, { files: [{ name: "a.hpp", source: "x" }] }, { sanitize: "yes" }, { cases: [] }, { cases: Array(9).fill(request.cases[0]) }, { stdin: "x".repeat(65537) }]) assert.throws(() => parseCppExecution({ ...request, ...bad }));
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

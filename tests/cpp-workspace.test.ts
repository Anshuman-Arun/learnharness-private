import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { emptyCppWorkspace, parseCppWorkspace, workspaceEvidence } from "../src/core/cpp-workspace.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-cpp-workspace-"));
process.env.LH_DATA_DIR = scratch;
const { listCppWorkspaces, saveCppWorkspace } = await import("../src/server/cpp-workspace.ts");
const { GET, PUT } = await import("../app/api/training/cpp/route.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

describe("C++ workspaces", () => {
	it("round-trips multiple files, problem notes and standard input through actual storage", () => {
		const draft = { ...emptyCppWorkspace("roundtrip"), problem: "Read two integers", stdin: "2 3\n", files: [{ name: "main.cpp", source: '#include "helper.hpp"\nint main() {}' }, { name: "helper.hpp", source: "#pragma once" }] };
		const saved = saveCppWorkspace(draft);
		assert.equal(saved.revision, 1);
		assert.deepEqual(listCppWorkspaces().find((item) => item.id === draft.id), saved);
		assert.deepEqual(saved.files, draft.files);
		assert.equal(saved.stdin, "2 3\n");
	});
	it("refuses stale-tab saves instead of overwriting newer code", () => {
		const draft = emptyCppWorkspace("concurrent");
		const first = saveCppWorkspace(draft);
		const second = saveCppWorkspace({ ...first, files: [{ name: "main.cpp", source: "int newer;" }] });
		assert.throws(() => saveCppWorkspace({ ...first, files: [{ name: "main.cpp", source: "int lost;" }] }), /another tab/);
		assert.equal(listCppWorkspaces().find((item) => item.id === draft.id)?.files[0]?.source, second.files[0]?.source);
	});
	it("rejects path/option injection, platform filename collisions, missing files and oversized source", () => {
		for (const files of [[], [{ name: "../main.cpp", source: "x" }], [{ name: "-flag.cpp", source: "x" }], [{ name: "a.cpp", source: "x" }, { name: "A.cpp", source: "y" }], [{ name: "main.cpp", source: "x".repeat(65537) }]]) assert.throws(() => parseCppWorkspace({ ...emptyCppWorkspace("validate"), files }));
	});
	it("shares only explicitly selected, nonempty file snapshots and freezes their source", () => {
		const workspace = { ...emptyCppWorkspace("evidence"), files: [{ name: "main.cpp", source: "int a;" }, { name: "private.hpp", source: "int privateDraft;" }] };
		const evidence = workspaceEvidence(workspace, ["main.cpp"]);
		workspace.files[0]!.source = "int changedLater;";
		assert.deepEqual(evidence.code, [{ name: "main.cpp", language: "cpp", source: "int a;" }]);
		assert.throws(() => workspaceEvidence(workspace, []));
	});
	it("saves and retrieves the workspace through the real route without a model key", async () => {
		const response = await PUT(new Request("http://test/cpp", { method: "PUT", body: JSON.stringify(emptyCppWorkspace("api")) }));
		assert.equal(response.status, 200);
		const { workspace } = await response.json();
		const body = await GET().json();
		assert.ok(body.workspaces.some((item: { id: string }) => item.id === workspace.id));
		assert.equal((await PUT(new Request("http://test/cpp", { method: "PUT", body: JSON.stringify(emptyCppWorkspace("api")) }))).status, 400);
	});
});

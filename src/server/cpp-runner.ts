import fs from "node:fs";
import { createHash } from "node:crypto";
import { parseCppExecution, type CppExecutionResult } from "../core/cpp-run.ts";
import { tokenFile } from "../../runner/cpp-config.mjs";
import { stores } from "./stores.ts";

export async function runCppWorkspace(body: unknown, signal?: AbortSignal) {
	const request = parseCppExecution(body);
	const endpoint = new URL(process.env.LH_CPP_RUNNER_URL ?? "http://127.0.0.1:3213");
	if (endpoint.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)) throw new Error("The compiler runner must use a local loopback endpoint");
	let token: string;
	try { token = fs.readFileSync(tokenFile(), "utf8").trim(); }
	catch { throw new Error("Start the local C++ runner before compiling (see docs/cpp-runner.md)"); }
	const response = await fetch(new URL("/execute", endpoint), {
		method: "POST", headers: { "Content-Type": "application/json", "x-lh-runner-token": token },
		body: JSON.stringify(request), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(50000)]) : AbortSignal.timeout(50000),
	});
	const result = await response.json() as CppExecutionResult & { error?: string };
	if (!response.ok) throw new Error(result.error ?? "The compiler service refused this request");
	const report = { version: 1 as const, id: crypto.randomUUID(), createdAt: Date.now(), sourceHash: createHash("sha256").update(JSON.stringify(request.files)).digest("hex"), request, result };
	stores.trainingStore.write("cpp-run", report);
	return report;
}

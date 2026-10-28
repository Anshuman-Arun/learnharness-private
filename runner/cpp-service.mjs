/** Container-backed adaptation of the execution contract in upstream PR #241.
 * No source is executed on the host or interpolated into a command. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { parseCppExecution } from "../src/core/cpp-run.ts";
import { CPP_IMAGE, tokenFile } from "./cpp-config.mjs";

function docker(args, input, signal, limit = 262144) {
	if (signal?.aborted) return Promise.reject(new Error("Execution cancelled"));
	return new Promise((resolve, reject) => {
		const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
		const output = [], errors = []; let size = 0, exceeded = false;
		const capture = (target) => (chunk) => {
			if (size < limit) target.push(chunk.subarray(0, limit - size));
			size += chunk.length;
			if (size > limit) { exceeded = true; child.kill("SIGKILL"); }
		};
		child.stdout.on("data", capture(output)); child.stderr.on("data", capture(errors));
		child.stdin.on("error", () => {});
		const cancel = () => child.kill("SIGKILL");
		signal?.addEventListener("abort", cancel, { once: true });
		child.once("error", (error) => { signal?.removeEventListener("abort", cancel); reject(error); });
		child.once("close", (code) => { signal?.removeEventListener("abort", cancel); resolve({ code, stdout: Buffer.concat(output).toString("utf8"), stderr: Buffer.concat(errors).toString("utf8"), exceeded }); });
		child.stdin.end(input ?? "");
	});
}

export async function executeCpp(raw, signal) {
	const request = parseCppExecution(raw);
	const controller = new AbortController();
	const cancel = () => controller.abort(); signal?.addEventListener("abort", cancel, { once: true });
	if (signal?.aborted) controller.abort();
	const timer = setTimeout(cancel, 45000), started = Date.now();
	const name = `lh-cpp-${randomUUID()}`;
	const run = (args, input) => docker(args, input, controller.signal);
	let compilerOutput = "";
	const result = (data) => ({ ok: false, stdout: "", stderr: "", timedOut: false, exitCode: null, compilerOutput, durationMs: Date.now() - started, image: CPP_IMAGE, ...data });
	try {
		const created = await run(["run", "--detach", "--rm", "--name", name, "--network=none", "--read-only", "--user=65534:65534", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--memory=512m", "--cpus=1", "--pids-limit=64", "--ulimit", "fsize=16777216:16777216", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777", "--tmpfs", "/work:rw,exec,nosuid,nodev,size=64m,mode=1777", "--workdir=/work", CPP_IMAGE, "sleep", "60"]);
		if (created.code !== 0) throw new Error(`Compiler container could not start: ${created.stderr}`);
		for (const file of request.files) {
			const copied = await run(["exec", "-i", name, "sh", "-c", 'cat > "$1"', "sh", `/work/${file.name}`], file.source);
			if (copied.code !== 0) throw new Error("Could not stage compiler input");
		}
		const flags = request.sanitize ? ["-O1", "-g", "-fsanitize=address,undefined", "-fno-omit-frame-pointer"] : ["-O2"];
		const compiled = await run(["exec", name, "timeout", "--kill-after=1s", "15s", "g++", "-std=c++20", "-Wall", "-Wextra", "-pedantic", ...flags, ...request.files.filter((file) => /\.(cpp|cc|cxx)$/.test(file.name)).map((file) => file.name), "-o", "/work/program"]);
		compilerOutput = compiled.stderr;
		if (controller.signal.aborted) throw new Error("Execution cancelled or exceeded its total time limit");
		if (compiled.exceeded) return result({ errorKind: "output-limit", compileError: compiled.stderr, stderr: "Compiler output limit reached", exitCode: compiled.code });
		if (compiled.code !== 0) return result({ errorKind: compiled.code === 124 ? "timeout" : compiled.code === 137 ? "resource" : "compile", timedOut: compiled.code === 124, compileError: compiled.stderr, exitCode: compiled.code });
		const outputs = [];
		for (const test of request.cases ?? [{ name: "Run", stdin: request.stdin }]) {
			const executed = await run(["exec", "-i", "-e", "ASAN_OPTIONS=detect_leaks=0", name, "timeout", "--kill-after=1s", "2s", "/work/program"], test.stdin);
			if (controller.signal.aborted) throw new Error("Execution cancelled or exceeded its total time limit");
			if (executed.exceeded) return result({ errorKind: "output-limit", stdout: executed.stdout, stderr: executed.stderr, exitCode: executed.code });
			const timedOut = executed.code === 124;
			const passed = executed.code === 0 && (test.expected === undefined || executed.stdout.replace(/\r\n/g, "\n").trimEnd() === test.expected.replace(/\r\n/g, "\n").trimEnd());
			outputs.push({ name: test.name, passed, stdout: executed.stdout, stderr: executed.stderr, exitCode: executed.code });
			if (timedOut) return result({ errorKind: "timeout", timedOut: true, stdout: executed.stdout, stderr: executed.stderr, exitCode: executed.code, ...(request.cases ? { cases: outputs } : {}) });
		}
		const ok = outputs.every((item) => item.passed), last = outputs.at(-1);
		return result({ ok, errorKind: ok ? "none" : outputs.some((item) => item.exitCode === 137) ? "resource" : outputs.some((item) => item.exitCode !== 0) ? "runtime" : "checks", stdout: last?.stdout ?? "", stderr: last?.stderr ?? "", exitCode: last?.exitCode ?? null, ...(request.cases ? { cases: outputs } : {}) });
	} finally {
		clearTimeout(timer); signal?.removeEventListener("abort", cancel);
		await docker(["rm", "-f", name], undefined, AbortSignal.timeout(5000), 65536).catch(() => {});
	}
}

export function loadRunnerToken() {
	const file = tokenFile(), directory = path.dirname(file);
	fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	const dir = fs.lstatSync(directory);
	if (!dir.isDirectory() || (process.platform !== "win32" && (dir.mode & 0o077))) throw new Error("Runner token directory must be private");
	try { fs.writeFileSync(file, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); }
	catch (error) { if (error.code !== "EEXIST") throw error; }
	const stat = fs.lstatSync(file);
	if (!stat.isFile() || (process.platform !== "win32" && (stat.mode & 0o077))) throw new Error("Runner token file must be private");
	const token = fs.readFileSync(file, "utf8").trim();
	if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid local runner token format");
	return token;
}

export function createCppRunnerServer(token) {
	let active = 0;
	return http.createServer(async (request, response) => {
		const send = (status, body) => { if (!response.destroyed) { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(body)); } };
		if (request.method === "GET" && request.url === "/health") return send(200, { ready: true, image: CPP_IMAGE });
		const supplied = Buffer.from(String(request.headers["x-lh-runner-token"] ?? "")), expected = Buffer.from(token);
		if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(401, { error: "Runner authentication required" });
		if (request.method !== "POST" || request.url !== "/execute") return send(404, { error: "Not found" });
		if (active >= 2) return send(429, { error: "Compiler is busy; try again shortly" });
		active++;
		const controller = new AbortController();
		request.once("aborted", () => controller.abort());
		response.once("close", () => { if (!response.writableEnded) controller.abort(); });
		try {
			const chunks = []; let bytes = 0;
			for await (const chunk of request) { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) { send(413, { error: "Execution request is too large" }); return; } chunks.push(chunk); }
			const body = parseCppExecution(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			send(200, await executeCpp(body, controller.signal));
		} catch (error) { send(400, { error: error.message }); }
		finally { active--; }
	});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const inspected = await docker(["image", "inspect", CPP_IMAGE], undefined, AbortSignal.timeout(10000));
	if (inspected.code !== 0) throw new Error(`Install the pinned compiler image first: docker pull ${CPP_IMAGE}`);
	const server = createCppRunnerServer(loadRunnerToken());
	server.listen(3213, "127.0.0.1", () => console.log("LearnHarness C++ runner ready on 127.0.0.1:3213"));
}

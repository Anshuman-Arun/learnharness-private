import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { randomBytes, randomInt, randomUUID, createHash, timingSafeEqual, X509Certificate } from "node:crypto";
import { tabletTokenFile } from "./tablet-config.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const equal = (actual, expected) => typeof actual === "string" && actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
const fail = (status, message) => Object.assign(new Error(message), { status });

/** Ephemeral pairing credentials; source records and strokes stay in the main app. */
export function createPairingManager(now = Date.now) {
	const pairs = new Map(), attempts = new Map();
	return {
		create(padId, pageId) {
			for (const [id, pair] of pairs) if (pair.expiresAt <= now() || pair.revoked) pairs.delete(id);
			if (pairs.size >= 20) throw fail(429, "Too many active tablet pairings");
			let code;
			do { code = String(randomInt(100000000)).padStart(8, "0"); } while ([...pairs.values()].some((pair) => pair.codeHash === hash(code)));
			const pair = { id: randomUUID(), padId, pageId, codeHash: hash(code), expiresAt: now() + 120000, tokenHash: null, pending: false, revoked: false };
			pairs.set(pair.id, pair); return { id: pair.id, code, expiresAt: pair.expiresAt };
		},
		async pair(code, address, activate) {
			const recent = (attempts.get(address) ?? []).filter((time) => time > now() - 60000);
			if (recent.length >= 5) throw fail(429, "Wait one minute before trying another pairing code");
			recent.push(now()); attempts.set(address, recent);
			const pair = typeof code === "string" && /^\d{8}$/.test(code) ? [...pairs.values()].find((item) => item.codeHash === hash(code)) : undefined;
			if (!pair || pair.revoked || pair.pending || pair.tokenHash || pair.expiresAt <= now()) throw fail(401, "Pairing code is invalid, used or expired");
			pair.pending = true;
			try {
				const scene = await activate(pair.id);
				const token = randomBytes(32).toString("hex"); pair.tokenHash = hash(token); pair.codeHash = ""; pair.expiresAt = scene.link.expiresAt;
				return { token, scene };
			} finally { pair.pending = false; }
		},
		authorize(token) {
			const tokenHash = typeof token === "string" && /^[a-f0-9]{64}$/.test(token) ? hash(token) : "";
			const pair = [...pairs.values()].find((item) => item.tokenHash && equal(tokenHash, item.tokenHash));
			if (!pair || pair.revoked || pair.expiresAt <= now()) throw fail(401, "Tablet pairing expired or disconnected");
			return pair;
		},
		revoke(id) { const pair = pairs.get(id); if (pair) pair.revoked = true; },
	};
}

export function loadTabletControlToken() {
	const file = tabletTokenFile(), directory = path.dirname(file);
	fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	const directoryStat = fs.lstatSync(directory);
	if (!directoryStat.isDirectory() || (process.platform !== "win32" && (directoryStat.mode & 0o077))) throw new Error("Tablet token directory must be private");
	try { fs.writeFileSync(file, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
	const stat = fs.lstatSync(file);
	if (!stat.isFile() || (process.platform !== "win32" && (stat.mode & 0o077))) throw new Error("Tablet control token file must be private");
	const token = fs.readFileSync(file, "utf8").trim();
	if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid tablet control token format");
	return token;
}

function bridgeToApp(base, token) {
	const origin = new URL(base);
	if (origin.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) throw new Error("The tablet bridge must target the loopback app server");
	return (action, id, body) => new Promise((resolve, reject) => {
		const url = new URL("/api/training/tablet/internal", origin);
		if (action === "read") url.searchParams.set("id", id);
		const data = action === "read" ? undefined : JSON.stringify({ ...body, id, action });
		const request = http.request(url, { method: action === "read" ? "GET" : "POST", headers: { "Content-Type": "application/json", "x-lh-tablet-control": token } }, (response) => {
			const chunks = []; let bytes = 0;
			response.on("data", (chunk) => { bytes += chunk.length; if (bytes > 3 * 1024 * 1024) request.destroy(new Error("Scene response too large")); else chunks.push(chunk); });
			response.on("end", () => { try { const result = JSON.parse(Buffer.concat(chunks).toString("utf8")); if ((response.statusCode ?? 500) >= 400) reject(fail(response.statusCode, result.error ?? "Drawing update refused")); else resolve(result); } catch (error) { reject(error); } });
		});
		request.on("error", reject); request.setTimeout(10000, () => request.destroy(new Error("The desktop app is not responding"))); request.end(data);
	});
}

export function createTabletServer({ key, cert, controlToken, backendUrl = "http://127.0.0.1:3000", publicUrl = null, bridge: injectedBridge }) {
	const manager = createPairingManager(), bridge = injectedBridge ?? bridgeToApp(backendUrl, controlToken);
	const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'";
	const server = https.createServer({ key, cert, minVersion: "TLSv1.2" }, async (request, response) => {
		const send = (status, body) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "Content-Security-Policy": csp }); response.end(JSON.stringify(body)); };
		const url = new URL(request.url ?? "/", "https://companion.invalid");
		try {
			if (request.method === "GET" && url.pathname === "/favicon.ico") { response.writeHead(204); response.end(); return; }
			if (request.method === "GET" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/control/")) {
				let root = path.join(ROOT, "public/tablet-companion"), relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
				if (url.pathname.startsWith("/vendor/excalidraw/fonts/")) { root = path.join(ROOT, "public/vendor/excalidraw"); relative = decodeURIComponent(url.pathname.slice("/vendor/excalidraw/".length)); }
				const file = path.resolve(root, relative);
				if (!file.startsWith(root + path.sep) || !/\.(html|js|css|woff2?|wasm|txt)$/.test(file) || !fs.existsSync(file) || !fs.statSync(file).isFile() || !fs.realpathSync(file).startsWith(fs.realpathSync(root) + path.sep)) throw fail(404, "Not found");
				const extension = path.extname(file), types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".wasm": "application/wasm", ".txt": "text/plain" };
				response.writeHead(200, { "Content-Type": types[extension], "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=86400", "Content-Security-Policy": csp, "X-Content-Type-Options": "nosniff" }); fs.createReadStream(file).pipe(response); return;
			}
			const isControl = url.pathname.startsWith("/control/");
			if (isControl && !equal(request.headers["x-lh-tablet-control"], controlToken)) throw fail(401, "Unauthorized");
			let pair;
			if (!isControl && url.pathname !== "/api/pair") pair = manager.authorize(String(request.headers.authorization ?? "").replace(/^Bearer /, ""));
			if (request.method === "GET" && url.pathname === "/api/scene") return send(200, await bridge("read", pair.id));
			if (request.method !== "POST") throw fail(404, "Not found");
			const chunks = []; let bytes = 0;
			for await (const chunk of request) { bytes += chunk.length; if (bytes > 3 * 1024 * 1024) throw fail(413, "Drawing request too large"); chunks.push(chunk); }
			const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
			if (url.pathname === "/control/create") {
				if (typeof body.padId !== "string" || typeof body.pageId !== "string") throw fail(400, "Invalid drawing identity");
				return send(200, { ...manager.create(body.padId, body.pageId), url: publicUrl });
			}
			if (url.pathname === "/control/revoke") { manager.revoke(body.id); return send(200, { revoked: true }); }
			if (url.pathname === "/api/pair") return send(200, await manager.pair(body.code, request.socket.remoteAddress ?? "local", (id) => bridge("activate", id)));
			if (url.pathname === "/api/scene") return send(200, await bridge("scene", pair.id, { sequence: body.sequence, elements: body.elements }));
			if (url.pathname === "/api/disconnect") { manager.revoke(pair.id); await bridge("revoke", pair.id); return send(200, { disconnected: true }); }
			throw fail(404, "Not found");
		} catch (error) { if (!response.destroyed) send(error.status ?? 400, { error: error.message }); }
	});
	server.requestTimeout = 15000; server.headersTimeout = 10000;
	return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const certFile = process.env.LH_TABLET_TLS_CERT_FILE, keyFile = process.env.LH_TABLET_TLS_KEY_FILE;
	if (!certFile || !keyFile) throw new Error("Set LH_TABLET_TLS_CERT_FILE and LH_TABLET_TLS_KEY_FILE; see docs/ipad-companion.md");
	const cert = fs.readFileSync(certFile), key = fs.readFileSync(keyFile), publicUrl = process.env.LH_TABLET_PUBLIC_URL ?? null;
	const bind = process.env.LH_TABLET_BIND_HOST ?? "0.0.0.0";
	if (publicUrl) { const url = new URL(publicUrl); const identity = new X509Certificate(cert); if (url.protocol !== "https:" || url.username || url.password || !(net.isIP(url.hostname) ? identity.checkIP(url.hostname) : identity.checkHost(url.hostname))) throw new Error("The public HTTPS address must match the certificate"); }
	else if (bind !== "127.0.0.1" && bind !== "localhost") throw new Error("Set LH_TABLET_PUBLIC_URL to the PC's certificate-matching HTTPS LAN address");
	const server = createTabletServer({ key, cert, publicUrl, controlToken: loadTabletControlToken(), backendUrl: process.env.LH_TABLET_APP_URL ?? "http://127.0.0.1:3000" });
	server.listen(3214, bind, () => console.log("LearnHarness tablet companion ready on port 3214 (HTTPS)"));
}

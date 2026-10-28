const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const PROVIDER_ID = "openai";
const FILE_VERSION = 1;
const ISSUER = "https://auth.openai.com";
const RESOURCE = "https://api.openai.com/v1";
const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const SHARING_SCOPE = "chatgpt.tokens.use.direct";
const REQUIRED_SCOPES = SCOPES.split(" ");
const CALLBACK_PATH = "/auth/callback";
const DYNAMIC_CLIENT_ID = "dynamic_agent_client";
let discoveryPromise;
let remoteKeySet;

function json(res, status, body) {
	const encoded = Buffer.from(JSON.stringify(body));
	res.writeHead(status, {
		"content-type": "application/json",
		"content-length": String(encoded.length),
		"cache-control": "no-store",
	});
	res.end(encoded);
}

function secureEqual(left, right) {
	const a = Buffer.from(left);
	const b = Buffer.from(right);
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function storageSecure(safeStorage) {
	// Electron's Linux "basic_text" backend derives encryption from a
	// hard-coded password and provides no meaningful protection at rest.
	try {
		if (!safeStorage?.isEncryptionAvailable?.()) return false;
		const backend = safeStorage.getSelectedStorageBackend?.();
		return backend !== "basic_text" && backend !== "unknown";
	} catch {
		return false;
	}
}

function validCredential(c) {
	return !!(c && c.type === "oauth" &&
		typeof c.access === "string" && c.access.length > 0 &&
		!c.access.startsWith("sk-") &&
		typeof c.refresh === "string" && c.refresh.length > 0 &&
		typeof c.clientId === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(c.clientId) &&
		c.clientId !== DYNAMIC_CLIENT_ID &&
		typeof c.subject === "string" && c.subject.length > 0 &&
		Number.isFinite(c.expires) && c.expires > 0 &&
		Array.isArray(c.scopes) &&
		REQUIRED_SCOPES.every((scope) => c.scopes.includes(scope)));
}

function createEncryptedCredentialStore(filePath, safeStorage) {
	const chains = new Map();

	async function readAll() {
		let envelope;
		try {
			envelope = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
		} catch (error) {
			if (error?.code === "ENOENT") return {};
			throw error;
		}
		if (envelope?.version !== FILE_VERSION || typeof envelope.ciphertext !== "string") {
			throw new Error("Saved ChatGPT credentials have an unsupported format.");
		}
		if (!storageSecure(safeStorage)) {
			throw new Error("Secure credential storage is unavailable on this system.");
		}
		const plaintext = safeStorage.decryptString(Buffer.from(envelope.ciphertext, "base64"));
		const parsed = JSON.parse(plaintext);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error("Saved ChatGPT credentials are invalid.");
		}
		return parsed;
	}

	async function writeAll(credentials) {
		if (!storageSecure(safeStorage)) {
			throw new Error("Secure credential storage is unavailable on this system.");
		}
		await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
		const ciphertext = safeStorage.encryptString(JSON.stringify(credentials)).toString("base64");
		const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
		try {
			await fs.promises.writeFile(
				temporary,
				JSON.stringify({ version: FILE_VERSION, encryption: "electron.safeStorage", ciphertext }),
				{ encoding: "utf8", mode: 0o600, flag: "wx" },
			);
			await fs.promises.rename(temporary, filePath);
		} finally {
			await fs.promises.unlink(temporary).catch((error) => {
				if (error?.code !== "ENOENT") throw error;
			});
		}
	}

	function enqueue(providerId, task) {
		const previous = chains.get(providerId) ?? Promise.resolve();
		const current = previous.catch(() => undefined).then(task);
		const tail = current.catch(() => undefined);
		chains.set(providerId, tail);
		void tail.finally(() => {
			if (chains.get(providerId) === tail) chains.delete(providerId);
		});
		return current;
	}

	return {
		async read(providerId, options) {
			options?.signal?.throwIfAborted();
			return (await readAll())[providerId];
		},
		async list(options) {
			options?.signal?.throwIfAborted();
			return Object.entries(await readAll()).map(([providerId, credential]) => ({
				providerId,
				type: credential.type,
			}));
		},
		modify(providerId, transform, options) {
			return enqueue(providerId, async () => {
				options?.signal?.throwIfAborted();
				const credentials = await readAll();
				const next = await transform(credentials[providerId]);
				options?.signal?.throwIfAborted();
				if (next !== undefined) {
					credentials[providerId] = next;
					await writeAll(credentials);
				}
				return next ?? credentials[providerId];
			});
		},
		delete(providerId, options) {
			return enqueue(providerId, async () => {
				options?.signal?.throwIfAborted();
				const credentials = await readAll();
				if (!(providerId in credentials)) return false;
				// Invalid-grant cleanup is compare-and-delete, not unconditional:
				// a later successful login must not be erased by a stale refresh.
				if (options?.expectedRefresh !== undefined &&
					credentials[providerId]?.refresh !== options.expectedRefresh) return false;
				const removed = credentials[providerId];
				delete credentials[providerId];
				await writeAll(credentials);
				return removed;
			});
		},
	};
}

async function loadOrCreateDeviceId(filePath) {
	try {
		const existing = (await fs.promises.readFile(filePath, "utf8")).trim();
		if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
			return existing;
		}
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	const id = crypto.randomUUID();
	await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
	await fs.promises.writeFile(filePath, `${id}\n`, { encoding: "utf8", mode: 0o600 });
	return id;
}

async function discovery() {
	discoveryPromise ??= (async () => {
		const response = await fetch(`${ISSUER}/.well-known/openid-configuration`, {
			signal: AbortSignal.timeout(15_000),
		});
		const data = await response.json();
		if (!response.ok || data?.issuer !== ISSUER) throw new Error("ChatGPT sign-in configuration could not be verified.");
		for (const name of ["authorization_endpoint", "token_endpoint", "jwks_uri", "revocation_endpoint"]) {
			const value = data[name];
			if (name === "revocation_endpoint" && value === undefined) continue;
			if (typeof value !== "string" || new URL(value).origin !== ISSUER) {
				throw new Error("ChatGPT sign-in configuration could not be verified.");
			}
		}
		return data;
	})().catch((error) => {
		discoveryPromise = undefined;
		throw error;
	});
	return discoveryPromise;
}

async function verifyIdentity(idToken, clientId, nonce) {
	const provider = await discovery();
	const { createRemoteJWKSet, jwtVerify } = await import("jose");
	remoteKeySet ??= createRemoteJWKSet(new URL(provider.jwks_uri), { timeoutDuration: 15_000 });
	const { payload } = await jwtVerify(idToken, remoteKeySet, {
		issuer: ISSUER,
		audience: clientId,
		algorithms: ["RS256"],
		clockTolerance: 5,
		requiredClaims: ["iss", "aud", "exp", "iat", "sub"],
	});
	if (
		typeof payload.sub !== "string" ||
		!payload.sub ||
		(nonce !== undefined && payload.nonce !== nonce) ||
		(payload.azp !== undefined && payload.azp !== clientId) ||
		(Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId)
	) {
		throw new Error("The ChatGPT identity could not be verified.");
	}
	return {
		subject: payload.sub,
		identity: {
			...(typeof payload.name === "string" ? { name: payload.name } : {}),
			...(typeof payload.email === "string" ? { email: payload.email } : {}),
		},
	};
}

async function tokenRequest(body, signal) {
	const provider = await discovery();
	const response = await fetch(provider.token_endpoint, {
		method: "POST",
		headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
		body,
		signal,
	});
	const data = await response.json().catch(() => undefined);
	if (!response.ok) {
		const error = new Error(`ChatGPT token request failed (${response.status}).`);
		if (response.status === 400 && data?.error === "invalid_grant") error.oauthCode = "invalid_grant";
		throw error;
	}
	if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("ChatGPT returned an invalid token response.");
	return data;
}

function credentialFields(data, previousScopes) {
	const scopeText = typeof data.scope === "string" ? data.scope : previousScopes?.join(" ");
	if (!scopeText) throw new Error("ChatGPT did not confirm the granted permissions.");
	const scopes = scopeText.split(/\s+/).filter(Boolean);
	if (!REQUIRED_SCOPES.every((scope) => scopes.includes(scope))) throw new Error("ChatGPT did not grant all required plan permissions.");
	if (
		typeof data.access_token !== "string" ||
		!data.access_token ||
		typeof data.token_type !== "string" ||
		data.token_type.toLowerCase() !== "bearer" ||
		typeof data.expires_in !== "number" ||
		!Number.isFinite(data.expires_in) ||
		data.expires_in <= 0 ||
		data.expires_in > 366 * 24 * 60 * 60 ||
		!Number.isFinite(Date.now() + data.expires_in * 1000)
	) {
		throw new Error("ChatGPT returned incomplete credentials.");
	}
	return { scopes, access: data.access_token, expires: Date.now() + data.expires_in * 1000 };
}

function callbackPage(message) {
	return `<!doctype html><html lang="en"><meta charset="utf-8"><title>LearnHarness</title><style>body{font:17px system-ui;max-width:32rem;margin:18vh auto;padding:24px;color:#202123}h1{font-size:26px}</style><h1>Return to LearnHarness</h1><p>${message}</p></html>`;
}

async function listenForCallback(expectedState, savedClientId, signal) {
	let resolveResult;
	let rejectResult;
	let settled = false;
	let port = 0;
	const result = new Promise((resolve, reject) => {
		resolveResult = resolve;
		rejectResult = reject;
	});
	void result.catch(() => undefined);
	const finish = (error, value) => {
		if (settled) return;
		settled = true;
		if (error) rejectResult(error);
		else resolveResult(value);
	};
	const server = http.createServer((request, response) => {
		response.setHeader("cache-control", "no-store");
		response.setHeader("referrer-policy", "no-referrer");
		response.setHeader("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
		let url;
		try {
			url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
		} catch {
			response.writeHead(400).end("Invalid request");
			return;
		}
		if (request.method !== "GET" || request.headers.host !== `127.0.0.1:${port}` || url.pathname !== CALLBACK_PATH || settled) {
			response.writeHead(404).end("Not found");
			return;
		}
		const returnedState = Buffer.from(url.searchParams.get("state") ?? "");
		const state = Buffer.from(expectedState);
		if (url.searchParams.getAll("state").length !== 1 || returnedState.length !== state.length || !crypto.timingSafeEqual(returnedState, state)) {
			response.writeHead(400).end("Invalid sign-in state.");
			return;
		}
		if (url.searchParams.has("error")) {
			response.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end(callbackPage("ChatGPT was not connected. You may close this tab."));
			finish(new Error(`ChatGPT authorization failed: ${url.searchParams.get("error")}`));
			return;
		}
		const code = url.searchParams.get("code");
		const returnedClientId = url.searchParams.get("client_id");
		const clientId = returnedClientId ?? savedClientId;
		if (
			!code ||
			url.searchParams.getAll("code").length !== 1 ||
			url.searchParams.getAll("client_id").length > 1 ||
			!clientId ||
			!/^[a-zA-Z0-9_-]{1,200}$/.test(clientId) ||
			clientId === DYNAMIC_CLIENT_ID ||
			(savedClientId !== undefined && returnedClientId !== null && returnedClientId !== savedClientId)
		) {
			response.writeHead(400).end("ChatGPT did not complete app registration.");
			return;
		}
		response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(callbackPage("Return to LearnHarness while your authorization is verified."));
		finish(undefined, { code, clientId });
	});
	server.requestTimeout = 15_000;
	server.headersTimeout = 10_000;
	const abort = () => finish(new Error("ChatGPT sign-in was cancelled."));
	signal.addEventListener("abort", abort, { once: true });
	try {
		await new Promise((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => {
				server.removeListener("error", reject);
				const address = server.address();
				if (!address || typeof address === "string") reject(new Error("ChatGPT callback listener failed."));
				else {
					port = address.port;
					resolve();
				}
			});
		});
		signal.throwIfAborted();
		return {
			result,
			redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
			close() {
				signal.removeEventListener("abort", abort);
				server.closeAllConnections();
				server.close();
			},
		};
	} catch (error) {
		server.close();
		throw error;
	}
}

async function authorize(previous, hostId, openBrowser, signal, onProgress) {
	const state = crypto.randomBytes(32).toString("base64url");
	const nonce = crypto.randomBytes(32).toString("base64url");
	const verifier = crypto.randomBytes(32).toString("base64url");
	const provider = await discovery();
	const listener = await listenForCallback(state, previous?.clientId, signal);
	try {
		const authorization = new URL(provider.authorization_endpoint);
		authorization.search = new URLSearchParams({
			client_id: previous?.clientId ?? DYNAMIC_CLIENT_ID,
			response_type: "code",
			redirect_uri: listener.redirectUri,
			scope: SCOPES,
			resource: RESOURCE,
			state,
			nonce,
			code_challenge_method: "S256",
			code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
			ext_agent_host_id: `urn:uuid:${hostId}`,
		}).toString();
		if (!previous?.clientId) authorization.searchParams.set("agent_name_hint", "LearnHarness");
		if (previous?.identity?.email) authorization.searchParams.set("login_hint", previous.identity.email);
		onProgress({ phase: "waiting", authorizationUrl: authorization.toString() });
		await openBrowser(authorization.toString());
		const callback = await listener.result;
		onProgress({ phase: "exchanging" });
		const data = await tokenRequest(new URLSearchParams({
			grant_type: "authorization_code",
			client_id: callback.clientId,
			code: callback.code,
			code_verifier: verifier,
			redirect_uri: listener.redirectUri,
			resource: RESOURCE,
		}), signal);
		if (typeof data.id_token !== "string") throw new Error("ChatGPT did not return a verifiable identity.");
		onProgress({ phase: "verifying" });
		const identity = await verifyIdentity(data.id_token, callback.clientId, nonce);
		if (previous?.subject && previous.subject !== identity.subject) throw new Error("This sign-in returned a different ChatGPT account.");
		const fields = credentialFields(data);
		if (typeof data.refresh_token !== "string" || !data.refresh_token) throw new Error("ChatGPT did not return a refresh token.");
		return {
			type: "oauth",
			...fields,
			refresh: data.refresh_token,
			clientId: callback.clientId,
			...identity,
		};
	} finally {
		listener.close();
	}
}

async function refreshCredential(previous) {
	if (!previous?.refresh || !previous.clientId) throw new Error("Reconnect ChatGPT to continue.");
	const data = await tokenRequest(new URLSearchParams({
		grant_type: "refresh_token",
		client_id: previous.clientId,
		refresh_token: previous.refresh,
		resource: RESOURCE,
	}), AbortSignal.timeout(60_000));
	const fields = credentialFields(data, previous.scopes);
	let identity = { subject: previous.subject, identity: previous.identity };
	if (typeof data.id_token === "string") {
		identity = await verifyIdentity(data.id_token, previous.clientId);
		if (identity.subject !== previous.subject) throw new Error("The refreshed ChatGPT identity does not match the connected account.");
	}
	return {
		...previous,
		...fields,
		refresh: typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : previous.refresh,
		...identity,
	};
}

async function revokeCredential(credential) {
	const provider = await discovery();
	if (!provider.revocation_endpoint || !credential?.refresh || !credential.clientId) return;
	const response = await fetch(provider.revocation_endpoint, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ token: credential.refresh, token_type_hint: "refresh_token", client_id: credential.clientId }),
		signal: AbortSignal.timeout(5_000),
	});
	if (!response.ok) throw new Error("ChatGPT could not be disconnected remotely. Try again.");
}

async function createChatGPTOAuthRuntime({ userDataDir, safeStorage, shell, ipcMain, log, authorizeIpc }) {
	const credentialFile = path.join(userDataDir, "chatgpt-oauth.enc.json");
	const deviceFile = path.join(userDataDir, "chatgpt-device-id");
	const credentials = createEncryptedCredentialStore(credentialFile, safeStorage);
	const brokerSecret = crypto.randomBytes(32).toString("base64url");
	let pendingLogin;
	let activeLoginController;
	let loginState = { connecting: false, phase: "idle" };
	let catalogEpoch = 0;
	let catalogCache = null;
	let catalogPending = null;
	const invalidateCatalog = () => { catalogEpoch++; catalogCache = null; catalogPending = null; };
	async function accessCredential() {
		let attemptedRefresh;
		try {
			return await credentials.modify(PROVIDER_ID, async (current) => {
				if (!validCredential(current)) return undefined;
				if (current.expires > Date.now() + 10 * 60_000) return undefined;
				attemptedRefresh = current.refresh;
				return refreshCredential(current);
			});
		} catch (error) {
			if (error?.oauthCode === "invalid_grant" && attemptedRefresh) {
				const removed = await credentials.delete(PROVIDER_ID, { expectedRefresh: attemptedRefresh });
				if (removed) {
					invalidateCatalog();
					loginState = { connecting: false, phase: "error",
						error: "Your ChatGPT authorization expired. Reconnect to continue." };
				}
			}
			throw error;
		}
	}
	async function discoverAccountModels() {
		const epoch = catalogEpoch;
		// Refresh/validate account authority before accepting a cached
		// catalog. Otherwise a revoked token could show selectable models.
		const credential = await accessCredential();
		if (!validCredential(credential)) throw new Error("ChatGPT is not connected.");
		if (catalogCache && catalogCache.expires > Date.now()) return catalogCache.models;
		if (catalogPending) return catalogPending;
		const pending = (async () => {
			const response = await fetch(`${RESOURCE}/models`, {
				headers: { authorization: `Bearer ${credential.access}` },
				signal: AbortSignal.timeout(15_000),
				redirect: "error",
			});
			if (!response.ok) throw new Error(`ChatGPT account model discovery failed (${response.status}).`);
			const contentLength = Number(response.headers.get("content-length") ?? 0);
			if (contentLength > 1_048_576) throw new Error("ChatGPT model catalog exceeds the size limit.");
			// Do not allow an upstream server to force an unbounded response
			// allocation before the size check is applied.
			if (!response.body) throw new Error("ChatGPT returned an empty model catalog.");
			const reader = response.body.getReader();
			const chunks = [];
			let size = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				size += value.byteLength;
				if (size > 1_048_576) {
					await reader.cancel().catch(() => undefined);
					throw new Error("ChatGPT model catalog exceeds the size limit.");
				}
				chunks.push(Buffer.from(value));
			}
			const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
			if (!body || !Array.isArray(body.models)) throw new Error("ChatGPT returned an invalid model catalog.");
			const models = [];
			const seen = new Set();
			for (const model of body.models.slice(0, 500)) {
				if (model?.visibility !== "list" ||
					typeof model.slug !== "string" ||
					!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(model.slug) ||
					typeof model.display_name !== "string" ||
					!model.display_name.trim() || seen.has(model.slug)) continue;
				seen.add(model.slug);
				models.push({ id: model.slug, name: model.display_name.slice(0, 160) });
			}
			if (epoch !== catalogEpoch) throw new Error("ChatGPT connection changed during model discovery.");
			catalogCache = { expires: Date.now() + 60_000, models };
			return models;
		})();
		catalogPending = pending;
		try { return await pending; }
		finally { if (catalogPending === pending) catalogPending = null; }
	}

	async function status() {
		if (!storageSecure(safeStorage)) {
			return { available: false, connected: false, error: "Secure credential storage is unavailable on this system." };
		}
		try {
			const credential = await credentials.read(PROVIDER_ID);
			const connected = validCredential(credential);
			return {
				available: true,
				connected,
				connecting: loginState.connecting,
				phase: loginState.connecting ? loginState.phase : connected ? "connected" : loginState.phase,
				...(loginState.connecting && loginState.phase === "waiting" && loginState.authorizationUrl
					? { authorizationUrl: loginState.authorizationUrl } : {}),
				...(loginState.error ? { error: loginState.error } : {}),
			};
		} catch (error) {
			return { available: true, connected: false, error: String(error?.message ?? error) };
		}
	}

	async function signIn() {
		if (pendingLogin) return status();
		if (!storageSecure(safeStorage)) throw new Error("Secure credential storage is unavailable on this system.");
		let announceStarted;
		const started = new Promise((resolve) => {
			announceStarted = resolve;
		});
		const controller = new AbortController();
		activeLoginController = controller;
		loginState = { connecting: true, phase: "preparing" };
		pendingLogin = (async () => {
			const deviceId = await loadOrCreateDeviceId(deviceFile);
			const previous = await credentials.read(PROVIDER_ID);
			const credential = await authorize(
				previous,
				deviceId,
				(url) => shell.openExternal(url),
				AbortSignal.any([controller.signal, AbortSignal.timeout(10 * 60_000)]),
				(next) => {
					loginState = { ...loginState, connecting: true, error: undefined, ...next };
					if (next.authorizationUrl) announceStarted();
				},
			);
			controller.signal.throwIfAborted();
			await credentials.modify(PROVIDER_ID, async () => credential, { signal: controller.signal });
			invalidateCatalog();
			loginState = { connecting: false, phase: "connected" };
		})().catch((error) => {
			loginState = {
				connecting: false,
				phase: "error",
				error: String(error?.message ?? error),
			};
			log(`ChatGPT sign-in error: ${error?.message ?? error}`);
		}).finally(() => {
			announceStarted();
			pendingLogin = undefined;
			activeLoginController = undefined;
		});
		void pendingLogin;
		await started;
		return status();
	}

	async function cancelSignIn() {
		activeLoginController?.abort();
		if (pendingLogin) await pendingLogin;
		if (loginState.phase !== "connected") loginState = { connecting: false, phase: "idle" };
		return status();
	}

	async function openAuthorization() {
		if (!loginState.connecting || !loginState.authorizationUrl) {
			throw new Error("No ChatGPT authorization link is active.");
		}
		await shell.openExternal(loginState.authorizationUrl);
		return status();
	}

	async function disconnect() {
		await cancelSignIn();
		// Delete through the same serialized provider queue as refresh.
		// Revoke exactly the token that was removed, not a stale pre-refresh
		// snapshot which could leave the newly rotated refresh token active.
		const credential = await credentials.delete(PROVIDER_ID);
		// Revocation is best-effort, but local disconnect MUST succeed even
		// during an outage or provider revocation failure.
		invalidateCatalog();
		loginState = { connecting: false, phase: "idle" };
		try {
			if (credential?.type === "oauth") await revokeCredential(credential);
		} catch {
			log("ChatGPT remote revocation could not be confirmed.");
			loginState = {
				connecting: false,
				phase: "idle",
				error: "Disconnected locally. Remote revocation could not be confirmed.",
			};
		}
		return status();
	}

	const server = http.createServer((req, res) => {
		void (async () => {
			const authorization = req.headers.authorization ?? "";
			if (!secureEqual(authorization, `Bearer ${brokerSecret}`)) {
				json(res, 404, { error: "not_found" });
				return;
			}
			if (req.method === "GET" && req.url === "/v1/status") {
				json(res, 200, await status());
				return;
			}
			if (req.method === "GET" && req.url === "/v1/models") {
				const connected = await status();
				if (!connected.connected) {
					json(res, 401, { error: "chatgpt_not_connected" });
					return;
				}
				try {
					json(res, 200, { models: await discoverAccountModels() });
				} catch {
					json(res, 503, { error: "chatgpt_models_unavailable" });
				}
				return;
			}
			if (req.method === "POST" && req.url === "/v1/token") {
				const credential = await accessCredential();
				if (!validCredential(credential)) {
					json(res, 401, { error: "chatgpt_not_connected" });
					return;
				}
				json(res, 200, { accessToken: credential.access, expires: credential.expires });
				return;
			}
			json(res, 404, { error: "not_found" });
		})().catch((error) => {
			log(`ChatGPT OAuth broker error: ${error?.message ?? error}`);
			if (!res.headersSent) json(res, 500, { error: "chatgpt_broker_error" });
			else res.destroy();
		});
	});

	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("ChatGPT OAuth broker did not bind to TCP.");

	// Do not trust renderer IPC merely because the channel name is private.
	// An untrusted iframe or navigated window must never manage OAuth.
	const privileged = (fn) => (event) => {
		if (typeof authorizeIpc !== "function" || !authorizeIpc(event)) {
			throw new Error("Untrusted ChatGPT IPC sender.");
		}
		return fn();
	};
	ipcMain.handle("lh:chatgpt:status", privileged(status));
	ipcMain.handle("lh:chatgpt:sign-in", privileged(signIn));
	ipcMain.handle("lh:chatgpt:cancel-sign-in", privileged(cancelSignIn));
	ipcMain.handle("lh:chatgpt:open-authorization", privileged(openAuthorization));
	ipcMain.handle("lh:chatgpt:disconnect", privileged(disconnect));

	return {
		brokerUrl: `http://127.0.0.1:${address.port}`,
		brokerSecret,
		close() {
			activeLoginController?.abort();
			server.closeAllConnections();
			server.close();
		},
	};
}

module.exports = { createChatGPTOAuthRuntime, createEncryptedCredentialStore, loadOrCreateDeviceId, storageSecure, validCredential };

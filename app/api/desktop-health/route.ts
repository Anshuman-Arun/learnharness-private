import crypto from "node:crypto";
import { NextResponse } from "next/server";

/** Challenge/response proof: never disclose the per-launch health secret
 * to untrusted localhost callers. Each Electron probe uses a fresh nonce. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request): Response {
	const secret = process.env.LH_DESKTOP_HEALTH_SECRET;
	if (!secret || secret.length < 32) {
		return new Response(null, { status: 404, headers: {"cache-control": "no-store"} });
	}
	const challenge = new URL(request.url).searchParams.get("challenge");
	if (!challenge || !/^[A-Za-z0-9_-]{20,64}$/.test(challenge)) {
		return new Response(null, {status: 400, headers: {"cache-control": "no-store"}});
	}
	const proof = crypto.createHmac("sha256", secret).update(challenge).digest("base64url");
	return NextResponse.json({ ready: true }, {
		headers: {"cache-control": "no-store", "x-lh-app-ready": proof}
	});
}

import { NextResponse } from "next/server";

/** Unguessable per-launch health proof. A random process on a recycled
 * localhost port must never be loaded into Electron with trusted preload. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(): Response {
	const secret = process.env.LH_DESKTOP_HEALTH_SECRET;
	if (!secret || secret.length < 32) {
		return new Response(null, { status: 404, headers: {"cache-control": "no-store"} });
	}
	return NextResponse.json(
		{ ready: true },
		{ headers: {"cache-control": "no-store", "x-lh-app-ready": secret} },
	);
}

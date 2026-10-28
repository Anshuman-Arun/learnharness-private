import { applyTabletEvent, tabletControlAuthorized, tabletScene } from "@/src/server";
export const runtime = "nodejs";
export function GET(request: Request) {
	if (!tabletControlAuthorized(request.headers.get("x-lh-tablet-control"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
	try { return Response.json(tabletScene(new URL(request.url).searchParams.get("id") ?? "")); }
	catch (error) { return Response.json({ error: (error as Error).message }, { status: 403 }); }
}
export async function POST(request: Request) {
	if (!tabletControlAuthorized(request.headers.get("x-lh-tablet-control"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
	try { return Response.json(applyTabletEvent(await request.json())); }
	catch (error) { return Response.json({ error: (error as Error).message }, { status: 409 }); }
}

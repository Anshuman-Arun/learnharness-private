import { createTabletLink, revokeTabletLink, tabletLinks } from "@/src/server";
export const runtime = "nodejs";
export function GET(request: Request) {
	try { return Response.json({ links: tabletLinks(new URL(request.url).searchParams.get("padId") ?? "") }); }
	catch { return Response.json({ error: "Invalid pad" }, { status: 400 }); }
}
export async function POST(request: Request) {
	try {
		const body = await request.json();
		if (body?.action === "create" && typeof body.padId === "string" && typeof body.pageId === "string") return Response.json(await createTabletLink(body.padId, body.pageId));
		if (body?.action === "revoke" && typeof body.id === "string") return Response.json({ link: await revokeTabletLink(body.id) });
		return Response.json({ error: "Invalid pairing action" }, { status: 400 });
	} catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Tablet companion unavailable" }, { status: 400 }); }
}

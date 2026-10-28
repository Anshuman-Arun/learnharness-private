import { getScratchpad, listScratchpads, saveScratchpad } from "@/src/server";
export const dynamic = "force-dynamic";
export function GET(request?: Request) {
	const id = request ? new URL(request.url).searchParams.get("id") : null;
	if (!id) return Response.json({ pads: listScratchpads() });
	try { const pad = getScratchpad(id); return pad ? Response.json({ pad }) : Response.json({ error: "Not found" }, { status: 404 }); }
	catch { return Response.json({ error: "Invalid pad identity" }, { status: 400 }); }
}
export async function PUT(request: Request) {
	try { return Response.json({ pad: saveScratchpad(await request.json()) }); }
	catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid pad" }, { status: 400 }); }
}

import { listScratchpads, saveScratchpad } from "@/src/server";
export const dynamic = "force-dynamic";
export function GET() { return Response.json({ pads: listScratchpads() }); }
export async function PUT(request: Request) {
	try { return Response.json({ pad: saveScratchpad(await request.json()) }); }
	catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid pad" }, { status: 400 }); }
}

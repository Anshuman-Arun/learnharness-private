import { runCppWorkspace } from "@/src/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
	try { return Response.json({ report: await runCppWorkspace(await request.json(), request.signal) }); }
	catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Compiler unavailable" }, { status: 400 }); }
}

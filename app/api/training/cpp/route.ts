import { listCppWorkspaces, saveCppWorkspace } from "@/src/server";
export const dynamic = "force-dynamic";
export function GET() { return Response.json({ workspaces: listCppWorkspaces() }); }
export async function PUT(request: Request) {
	try { return Response.json({ workspace: saveCppWorkspace(await request.json()) }); }
	catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid workspace" }, { status: 400 }); }
}

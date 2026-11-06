import { documentFile } from "@/src/server";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		return documentFile((await params).id, request.headers.get("range"));
	} catch {
		return new Response("Source not found", { status: 404 });
	}
}

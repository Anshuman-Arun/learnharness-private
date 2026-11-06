import { getDocument, retryDocumentGaps, pauseDocument, prepareDocument, startDocument } from "@/src/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
	try {
		return Response.json({ source: getDocument((await context.params).id) });
	} catch (cause) {
		return Response.json({ error: (cause as Error).message }, { status: 404 });
	}
}
export async function POST(request: Request, context: Context) {
	try {
		const { id } = await context.params,
			input = await request.json();
		if (input.action === "prepare" && typeof input.pages === "string")
			return Response.json({ source: await prepareDocument(id, input.pages) });
		if (input.action === "retry-gaps") return Response.json({ source: retryDocumentGaps(id) });
		if (input.action === "start") return Response.json({ source: startDocument(id) });
		if (input.action === "pause") return Response.json({ source: await pauseDocument(id) });
		throw new Error("Invalid source action");
	} catch (cause) {
		return Response.json({ error: (cause as Error).message }, { status: 400 });
	}
}

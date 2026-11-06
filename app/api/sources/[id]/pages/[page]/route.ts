import { documentPageImage } from "@/src/server";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; page: string }> }) {
	try {
		const { id, page } = await params;
		return new Response(new Uint8Array(await documentPageImage(id, Number(page))), {
			headers: {
				"Content-Type": "image/png",
				"Cache-Control": "private, max-age=3600",
				"X-Content-Type-Options": "nosniff",
			},
		});
	} catch (cause) {
		return Response.json({ error: (cause as Error).message }, { status: 400 });
	}
}

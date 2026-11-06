import { createDocument, listDocuments } from "@/src/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
	return Response.json({ sources: listDocuments() });
}
export async function POST(request: Request) {
	try {
		// Bound the actual stream, including chunked uploads, before multipart decoding.
		const reader = request.body?.getReader();
		if (!reader) return Response.json({ error: "Choose a PDF" }, { status: 400 });
		const chunks: Uint8Array[] = [];
		let total = 0;
		for (;;) {
			const part = await reader.read();
			if (part.done) break;
			total += part.value.length;
			if (total > 51 * 1024 * 1024) {
				await reader.cancel();
				return Response.json({ error: "Choose a PDF up to 50 MB" }, { status: 413 });
			}
			chunks.push(part.value);
		}
		const bytes = new Uint8Array(total);
		let at = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, at);
			at += chunk.length;
		}
		const form = await new Request(request.url, {
			method: "POST",
			headers: { "Content-Type": request.headers.get("content-type") ?? "" },
			body: bytes,
		}).formData();
		const file = form.get("file");
		if (!(file instanceof File)) throw new Error("Choose one PDF file");
		if (!/\.pdf$/i.test(file.name)) throw new Error("Choose a PDF paper or chapter");
		return Response.json(
			{ source: await createDocument(new Uint8Array(await file.arrayBuffer()), file.name) },
			{ status: 201 },
		);
	} catch (cause) {
		return Response.json({ error: (cause as Error).message }, { status: 400 });
	}
}

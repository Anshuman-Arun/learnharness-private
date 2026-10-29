import { liveModelCatalog } from "@/src/server";

/**
 * The model picker's data (model-control wave): pi-ai's configured-provider
 * catalog as client-safe DTOs — id/name/cost/context/modality plus each
 * model's SUPPORTED thinking levels (per its thinkingLevelMap). ChatGPT plan models are intersected with the live connected account roster,
 * and the response must never be cached across account changes.
 */
export async function GET() {
	return Response.json(await liveModelCatalog(), { headers: { "cache-control": "no-store" } });
}

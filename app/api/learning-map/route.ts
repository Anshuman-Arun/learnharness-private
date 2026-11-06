import { globalLearningView } from "@/src/server";
export const dynamic = "force-dynamic";

/** Read-only: saved sessions and plans remain the source of truth. */
export async function GET() {
  return Response.json(globalLearningView(), {
    headers: { "Cache-Control": "no-store" },
  });
}

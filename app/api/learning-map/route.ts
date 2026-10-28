import { stores } from "@/src/server/stores.ts";
import { buildGlobalLearningGraph } from "@/src/core/global-learning.ts";
import type { ChatRecord } from "@/src/core/contracts/chat.ts";
export const dynamic = "force-dynamic";

/** Read-only: source transcripts and saved plans are the source of truth.
 * No migration or changes to the original graph ledgers are necessary. */
export async function GET() {
  const records:ChatRecord[]=[];
  for(const summary of stores.chatStore.listChats()) {
    const chat=stores.chatStore.getChat(summary.id);
    if(chat)records.push(chat);
  }
  return Response.json(buildGlobalLearningGraph(records),{
    headers:{"Cache-Control":"no-store"},
  });
}

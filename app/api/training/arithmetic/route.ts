import { changeArithmeticRound, listArithmeticRounds } from "@/src/server";

export const dynamic = "force-dynamic";
export function GET() { return Response.json({ rounds: listArithmeticRounds(), serverNow: Date.now() }); }
export async function POST(request: Request) {
	try { return Response.json({ round: changeArithmeticRound(await request.json()), serverNow: Date.now() }); }
	catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 }); }
}

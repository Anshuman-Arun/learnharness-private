import { changeEstimate, estimateView, listEstimates } from "@/src/server";
export const dynamic="force-dynamic";
export function GET(){return Response.json({attempts:listEstimates().map(estimateView)});}
export async function POST(request:Request){try{return Response.json({attempt:changeEstimate(await request.json())});}catch(error){return Response.json({error:error instanceof Error?error.message:"Invalid estimate"},{status:400});}}

import{changeStopping,stoppingGames,stoppingView}from'@/src/server';export const dynamic='force-dynamic';
export function GET(){return Response.json({games:stoppingGames().map(stoppingView)});}
export async function POST(r:Request){try{return Response.json({game:changeStopping(await r.json())});}catch(e){return Response.json({error:e instanceof Error?e.message:'Invalid game'},{status:400});}}

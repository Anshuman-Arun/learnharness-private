import {changeExperiment,experimentView,probabilityExperiments} from '@/src/server';
export const dynamic='force-dynamic';
export function GET(){return Response.json({experiments:probabilityExperiments().map(experimentView)});}
export async function POST(r:Request){try{return Response.json({experiment:changeExperiment(await r.json())});}catch(e){return Response.json({error:e instanceof Error?e.message:'Invalid experiment'},{status:400});}}

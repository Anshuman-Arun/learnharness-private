import{changeExam,quantExams}from'@/src/server';import{examView}from'@/src/core';export const dynamic='force-dynamic';
export function GET(){const now=Date.now();return Response.json({exams:quantExams(now).map(e=>examView(e,now))});}
export async function POST(r:Request){try{return Response.json({exam:changeExam(await r.json())});}catch(e){return Response.json({error:e instanceof Error?e.message:'Invalid exam action'},{status:400});}}

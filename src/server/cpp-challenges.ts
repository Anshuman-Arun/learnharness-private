import{createHash}from'node:crypto';import type{CppChallenge,CppJudgeReport}from'../core/cpp-challenges.ts';import type{CppExecutionResult}from'../core/cpp-run.ts';import{executeCppRequest}from'./cpp-runner.ts';import{stores}from'./stores.ts';
interface Case{stdin:string;expected:string}
function collisions(values:number[]):Case{const counts=new Map<number,number>();let pairs=0;for(const x of values){pairs+=counts.get(x)??0;counts.set(x,(counts.get(x)??0)+1);}return{stdin:values.length+'\n'+values.join(' ')+'\n',expected:String(pairs)+'\n'};}
function top(values:number[],k:number):Case{return{stdin:values.length+' '+k+'\n'+values.join(' ')+'\n',expected:values.slice().sort((a,b)=>b-a).slice(0,k).join(' ')+'\n'};}
function variance(values:number[]):Case{let expected='UNDEFINED';if(values.length>1){const centered=values.map(v=>v-values[0]!),mean=centered.reduce((a,b)=>a+b,0)/values.length;expected=(centered.reduce((sum,x)=>sum+(x-mean)**2,0)/(values.length-1)).toFixed(3);}return{stdin:values.length+'\n'+values.join(' ')+'\n',expected:expected+'\n'};}
const definitions:Array<{public:CppChallenge;hidden:Case[]}>=([
 {id:'collision-pairs',title:'Count colliding pairs',statement:'Read n (0–5000), then n signed integers in [−10^9,10^9]. Output the number of unordered equal-value pairs. Aim for O(n) expected time. Duplicates count multiplicity; an empty stream has zero pairs.',examples:[collisions([1,2,1,1,2])],hidden:[collisions([]),collisions([9]),collisions([-2,-2,0,0,-2]),collisions(Array(5000).fill(7)),collisions(Array.from({length:2000},(_,i)=>i-1000)),collisions([-1000000000,1000000000,-1000000000,1000000000,0])]},
 {id:'stream-top-k',title:'Streaming largest k',statement:'Read n and k (each 0–5000), then n signed integers in [−10^9,10^9]. Output the largest min(k,n) values in descending order, separated by spaces. Count duplicates. If none are retained, output an empty line. Aim for O(n log k) time and O(k) memory.',examples:[top([8,2,8,1,9],3)],hidden:[top([],0),top([-3,-9,-1],2),top([5,5,5,4],3),top([7,2],8),top([1,2,3],0),top(Array.from({length:300},(_,i)=>(i*37)%101-50),17),top(Array(5000).fill(-1),5000)]},
 {id:'stable-variance',title:'Stable sample variance',statement:'Read n (0–5000), then n integer-valued observations with magnitude at most 10^9+100. Print the unbiased sample variance with exactly three digits after the decimal point. For n<2 print UNDEFINED. Use a stable one-pass update and O(1) memory.',examples:[variance([1,2,3])],hidden:[variance([]),variance([5]),variance([8,8,8,8]),variance([1000000001,1000000002,1000000004,1000000008]),variance([-4,2,8]),variance(Array.from({length:1000},(_,i)=>1000000000+(i%9))),variance(Array.from({length:5000},(_,i)=>-1000000000+(i%11)))]}
]).map(d=>({public:{id:d.id,title:d.title,statement:d.statement,examples:d.examples,hiddenCount:d.hidden.length},hidden:d.hidden}));
export function cppChallenges(){return definitions.map(d=>structuredClone(d.public));}
/** Hidden stdin can be echoed or included in runtime diagnostics; never return either stream. */
export function publicJudgeResult(result:CppExecutionResult,visibleCount:number):CppExecutionResult{
 const compileFailed=result.errorKind==='compile';return{...result,stdout:compileFailed?result.stdout:'',stderr:compileFailed?result.stderr:'',cases:result.cases?.map((c,i)=>i<visibleCount?c:{...c,stdout:'[hidden check output withheld]',stderr:''})};
}
export function cppJudgeHistory(){return stores.trainingStore.list<CppJudgeReport>('cpp-judge').sort((a,b)=>b.createdAt-a.createdAt).slice(0,30);}
export async function judgeCppChallenge(raw:unknown,signal?:AbortSignal):Promise<CppJudgeReport>{
 const a=raw as Record<string,unknown>,definition=definitions.find(d=>d.public.id===a?.challengeId);if(!definition)throw Error('Select a supported challenge');
 const cases=[...definition.public.examples.map((c,i)=>({...c,name:`Example ${i+1}`})),...definition.hidden.map((c,i)=>({...c,name:`Hidden ${i+1}`}))];
 const{request,result}=await executeCppRequest({files:a.files,stdin:'',sanitize:a.sanitize,prediction:a.prediction,cases},signal);
 const report:CppJudgeReport={version:1,id:crypto.randomUUID(),challengeId:definition.public.id,createdAt:Date.now(),sourceHash:createHash('sha256').update(JSON.stringify(request.files)).digest('hex'),files:request.files,result:publicJudgeResult(result,definition.public.examples.length),totalChecks:cases.length,passedChecks:result.cases?.filter(c=>c.passed).length??0,hiddenCount:definition.hidden.length};
 stores.trainingStore.write('cpp-judge',report);return report;
}

import assert from'node:assert/strict';import{after,describe,it}from'node:test';import fs from'node:fs';import os from'node:os';import path from'node:path';import{quantQuestion,retryQuestion,correctMistakeRetry,type MistakeEntry,type MistakeRetry,type QuantExam}from'../src/core/index.ts';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lh-mistake-'));process.env.LH_DATA_DIR=dir;const{stores}=await import('../src/server/stores.ts');const{changeMistake,mistakeCandidates,mistakeEntries}=await import('../src/server/mistakes.ts');after(()=>fs.rmSync(dir,{recursive:true,force:true}));
function entryResult(result:ReturnType<typeof changeMistake>){assert.ok('entry'in result);return result.entry!;}
describe('mistake provenance and targeted retries',()=>{
 it('captures only completed source attempts once and preserves original reasoning',()=>{const exam:QuantExam={version:1,id:'source-exam',seed:20,config:{counts:{arithmetic:1,probability:1,reasoning:1},durationSeconds:60},revision:1,startedAt:0,deadline:60000,responses:{0:{answer:'-1',reasoning:'I used the wrong identity',flagged:true,savedAt:100}}};stores.trainingStore.write('exam',exam);assert.equal(mistakeCandidates(5000,1000).length,0);stores.trainingStore.write('exam',{...exam,endedAt:200});const candidate=mistakeCandidates()[0]!;const entry=entryResult(changeMistake({action:'capture',source:candidate.source},1000));assert.equal(entry.reasoning,'I used the wrong identity');assert.deepEqual(entry.source,candidate.source);assert.equal(entryResult(changeMistake({action:'capture',source:candidate.source},2000)).id,entry.id);assert.equal(mistakeEntries().length,1);assert.ok(!mistakeCandidates().some(c=>c.source.index===0));});
 it('generates distinct variants of the same mathematical family',()=>{for(const section of ['arithmetic','probability','reasoning']as const)for(let seed=0;seed<30;seed++){const q=quantQuestion(section,seed,0),entry={question:q,recipe:{kind:'quant',section,family:q.family}}as MistakeEntry;const variant=retryQuestion(entry,seed+100,true);assert.equal(variant.family,q.family);assert.notEqual(variant.prompt,q.prompt);assert.ok(Number.isFinite(variant.expected));}});
 it('grades estimation retries within 1% rather than allowing scaled-squared tolerance',()=>{const q={section:'reasoning' as const,prompt:'Estimate 1000',expected:1000,explanation:'',family:'estimate-product',tolerance:10};const retry={question:q}as MistakeRetry;assert.ok(correctMistakeRetry(retry,'1009'));assert.equal(correctMistakeRetry(retry,'2000'),false);});
 it('requires a saved correction and a subsequent successful retry for demonstrated status',()=>{let e=entryResult(changeMistake({action:'manual',prompt:'What is 6 × 7?',expected:42,answer:'43',reasoning:'Counted incorrectly'},1000));assert.throws(()=>changeMistake({action:'demonstrate',id:e.id,revision:0,retryId:'missing'}),/successful retry/);e=entryResult(changeMistake({action:'edit',id:e.id,revision:e.revision,category:'arithmetic',correction:'Use 6 × (5+2) = 30+12'},2000));const started=changeMistake({action:'retry',id:e.id,mode:'original'},3000);assert.ok('retry'in started);assert.equal('expected'in started.retry!.question,false);const result=changeMistake({action:'answer-retry',id:started.retry!.id,answer:'42',reasoning:'Distribute six across five plus two'},4000);assert.ok('retry'in result&&result.retry?.correct);const done=entryResult(changeMistake({action:'demonstrate',id:e.id,revision:e.revision,retryId:started.retry!.id},5000));assert.equal(done.demonstratedBy,started.retry!.id);assert.throws(()=>changeMistake({action:'answer-retry',id:started.retry!.id,answer:'42',reasoning:'again'}),/already submitted/);assert.throws(()=>changeMistake({action:'edit',id:e.id,revision:0,category:'concept',correction:''}),/another tab/);});
});

it('captures a covered but catastrophically wrong subnormal estimate',async()=>{
 const {estimateQuestion}=await import('../src/core/estimation.ts');
 const q=estimateQuestion('product',0);
 stores.trainingStore.write('estimate',{version:1 as const,id:'extreme-covered',kind:'product',seed:0,startedAt:1,submittedAt:2,answer:{estimate:Number.MIN_VALUE,low:Number.MIN_VALUE,high:q.reference,reasoning:'A very small point estimate with a wide interval'}});
 assert.ok(mistakeCandidates().some(c=>c.source.id==='extreme-covered'));
});

it('does not disclose estimation references through tolerance before retry commitment',()=>{
 const made=entryResult(changeMistake({action:'manual',prompt:'Estimate a product',expected:1000,answer:'2',reasoning:'wrong'},1000));
 stores.trainingStore.write('mistake',{...made,question:{...made.question,tolerance:10,family:'estimate-product'},recipe:{kind:'estimate',topic:'product'}});
 const started=changeMistake({action:'retry',id:made.id,mode:'variant'},2000);assert.ok('retry'in started);
 assert.equal('expected'in started.retry!.question,false);
 assert.equal('tolerance'in started.retry!.question,false);
});

it('requires a retry of the latest correction revision even when timestamps collide',()=>{
 let e=entryResult(changeMistake({action:'manual',prompt:'Six times seven?',expected:42,answer:'43',reasoning:'wrong'},1000));
 const early=changeMistake({action:'retry',id:e.id,mode:'original'},1000);assert.ok('retry'in early);
 changeMistake({action:'answer-retry',id:early.retry!.id,answer:'42',reasoning:'I remembered the answer'},1000);
 e=entryResult(changeMistake({action:'edit',id:e.id,revision:e.revision,category:'arithmetic',correction:'Distribute across 5 + 2'},1000));
 assert.throws(()=>changeMistake({action:'demonstrate',id:e.id,revision:e.revision,retryId:early.retry!.id},1000),/successful retry/);
 const fresh=changeMistake({action:'retry',id:e.id,mode:'original'},1000);assert.ok('retry'in fresh);
 changeMistake({action:'answer-retry',id:fresh.retry!.id,answer:'42',reasoning:'30 plus 12'},1000);
 assert.equal(entryResult(changeMistake({action:'demonstrate',id:e.id,revision:e.revision,retryId:fresh.retry!.id},1000)).demonstratedBy,fresh.retry!.id);
});

it('recognizes an exam completed by its deadline without requiring another exam-page visit',()=>{
 const exam:QuantExam={version:1,id:'expired-without-refresh',seed:4,config:{counts:{arithmetic:1,probability:1,reasoning:1},durationSeconds:60},revision:0,startedAt:0,deadline:5000,responses:{0:{answer:'-1',reasoning:'Original reasoning remains intact',flagged:false,savedAt:100}}};
 stores.trainingStore.write('exam',exam);
 assert.equal(mistakeCandidates(5000,4999).some(c=>c.source.id===exam.id),false);
 const candidate=mistakeCandidates(5000,5000).find(c=>c.source.id===exam.id&&c.source.index===0);assert.ok(candidate);
 const captured=entryResult(changeMistake({action:'capture',source:candidate.source},5000));assert.equal(captured.reasoning,exam.responses[0]!.reasoning);
});

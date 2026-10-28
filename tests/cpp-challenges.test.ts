import assert from'node:assert/strict';import{describe,it}from'node:test';import{cppChallenges,publicJudgeResult}from'../src/server/cpp-challenges.ts';import type{CppExecutionResult}from'../src/core/cpp-run.ts';
describe('coding challenge boundaries',()=>{
 it('publishes statements and examples without hidden case payloads',()=>{const list=cppChallenges();assert.equal(list.length,3);for(const c of list){assert.ok(c.hiddenCount>=5);assert.equal(c.examples.length,1);assert.equal('hidden'in c,false);}assert.equal(list.find(c=>c.id==='collision-pairs')?.examples[0]?.expected.trim(),'4');});
 it('redacts hidden stdout and runtime diagnostics even when a program echoes the input',()=>{const result:CppExecutionResult={ok:false,errorKind:'checks',timedOut:false,exitCode:0,durationMs:5,image:'pinned',stdout:'secret stdin echoed by program',stderr:'secret runtime diagnostic',cases:[{name:'Example 1',passed:true,stdout:'4',stderr:'',exitCode:0},{name:'Hidden 1',passed:false,stdout:'secret input',stderr:'secret sanitizer output',exitCode:1}]};const projected=publicJudgeResult(result,1);assert.ok(!JSON.stringify(projected).includes('secret'));assert.equal(projected.cases?.[0]?.stdout,'4');assert.equal(projected.cases?.[1]?.passed,false);assert.equal(result.cases?.[1]?.stdout,'secret input','redaction does not mutate the worker result');});
});

it('rejects an explicitly invalid sanitizer flag before contacting a runner',async()=>{
 const{judgeCppChallenge}=await import('../src/server/cpp-challenges.ts');
 await assert.rejects(judgeCppChallenge({challengeId:'collision-pairs',files:[{name:'main.cpp',source:'int main(){}'}],sanitize:null}),/sanitize must be boolean/);
});

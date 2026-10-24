import test from 'node:test';
import assert from 'node:assert/strict';
import {InferenceLimits} from '../src/subscription/inference-limits.mjs';

const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
test('globally serializes requests and releases the slot even on error',async()=>{
 const guard=new InferenceLimits({maxConcurrent:1});
 const gate=defer(); const entered=[];
 const a=guard.run({},async()=>{entered.push('a');await gate.promise;throw new Error('a-error')});
 const b=guard.run({},async()=>{entered.push('b');return 'b-ok'});
 await Promise.resolve();
 assert.deepEqual(entered,['a']);
 gate.resolve();
 await assert.rejects(a,/a-error/);
 assert.equal(await b,'b-ok');
 assert.deepEqual(entered,['a','b']);
 assert.deepEqual(guard.stats,{active:0,waiting:0});
});
test('background call cap is enforced even across concurrent callers',async()=>{
 const guard=new InferenceLimits({maxConcurrent:1,maxBackgroundCalls:1});
 const a=guard.run({role:'researcher',backgroundTaskId:'job-1'},async()=> 'done');
 const b=guard.run({role:'researcher',backgroundTaskId:'job-1'},async()=> 'should not execute');
 assert.equal(await a,'done');
 await assert.rejects(b,/cap reached/);
 assert.equal(guard.getTaskCallCount('job-1'),1);
 guard.forgetTask('job-1');
 assert.equal(guard.getTaskCallCount('job-1'),0);
});
test('disabled roles and cancelled waiters do not count toward usage',async()=>{
 const guard=new InferenceLimits({maxConcurrent:1,maxBackgroundCalls:1});
 guard.setRoleEnabled('extractor',false);
 await assert.rejects(()=>guard.run({role:'extractor'},async()=>{}),/disabled/);
 const blocker=defer();
 const a=guard.run({},async()=>{await blocker.promise});
 const controller=new AbortController();
 const b=guard.run({role:'auditor',backgroundTaskId:'job-2',signal:controller.signal},async()=>{throw new Error('not reached')});
 controller.abort(new Error('cancelled'));
 await assert.rejects(b,/cancelled/);
 assert.equal(guard.getTaskCallCount('job-2'),0);
 blocker.resolve();await a;
 assert.equal(guard.stats.waiting,0);
});

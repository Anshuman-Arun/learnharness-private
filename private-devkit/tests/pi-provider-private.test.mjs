import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlanProvider,hasDesktopPlanBroker} from '../src/subscription/pi-provider.mjs';
const env={LH_SUBSCRIPTION_BROKER_PORT:'38201',LH_SUBSCRIPTION_BROKER_SECRET:'a'.repeat(43)};
const eventStream=()=>{const events=[];let done;const finished=new Promise(r=>done=r);return {events,finished,push(v){events.push(v);if(v.type==='done'||v.type==='error')done();}}};
test('provider refuses to advertise models without authenticated desktop broker',async()=>{
  const provider=createPlanProvider({env:{},makeEventStream:eventStream,getModels:async()=>{throw Error('should not query')}});
  assert.deepEqual(await provider.syncModels(),[]);
  assert.equal(await provider.auth.apiKey.resolve(),undefined);
  assert.equal(provider.getModels().length,0);
  assert.equal(hasDesktopPlanBroker({LH_SUBSCRIPTION_BROKER_PORT:'12',LH_SUBSCRIPTION_BROKER_SECRET:'a'}),false);
});
test('provider exposes account-scoped models through pi registry without key material',async()=>{
  let requests=0;
  const provider=createPlanProvider({env,makeEventStream:eventStream,
    getModels:async()=>{requests++;return [{slug:'luna-sample',displayName:'Luna'},{slug:'luna-sample',displayName:'Duplicate'},{slug:'sol-sample',displayName:'Sol'}];},
    requestEvents:async function* (){yield {type:'response.output_text.delta',output_index:0,delta:'hello'};yield {type:'response.completed',response:{}};}
  });
  assert.deepEqual(await provider.syncModels().then(x=>x.map(m=>m.id)),['luna-sample','sol-sample']);
  assert.equal(requests,1);
  assert.equal((await provider.auth.apiKey.resolve()).auth.apiKey,'desktop-broker');
  const selected=provider.getModels()[0];
  assert.equal(selected.api,'openai-responses');
  assert.equal(selected.cost.output,0);
  assert.equal(selected.thinkingLevelMap.high,'high');
  const stream=provider.streamSimple(selected,{messages:[{role:'system',content:'Tutor'},{role:'user',content:'Hello'}]},{reasoning:'high'});
  await stream.finished;
  assert.equal(stream.events.at(-1).message.content[0].text,'hello');
});
test('authorization loss clears model list and refuses stale model availability',async()=>{
  let fail=false;
  const provider=createPlanProvider({env,makeEventStream:eventStream,getModels:async()=>{if(fail)throw Error('unauthorized token');return [{slug:'model-a'}]}});
  assert.equal((await provider.syncModels()).length,1);
  fail=true;
  assert.deepEqual(await provider.syncModels(),[]);
  assert.equal(await provider.auth.apiKey.resolve(),undefined);
});

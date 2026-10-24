import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {streamDevKitEvents,assertStructuredRequest}=require('../src/subscription/devkit-event-stream.cjs');
const request={model:'gpt-6-luna',input:[{role:'user',content:'question'}],stream:true,store:false,
  tools:[{type:'namespace',name:'learnharness',tools:[{type:'function',name:'quiz',parameters:{type:'object'}}]}]};
const collect=async iterable=>{const a=[];for await(const item of iterable)a.push(item);return a};

test('DevKit extension streams function calls without exposing OAuth credentials',async()=>{
  let observed;
  const client={async streamStructuredEvents(opts){
    observed=opts;
    opts.onEvent({type:'response.output_item.added',output_index:0,item:{type:'function_call',call_id:'call_123',name:'quiz',arguments:'{}'}});
    await Promise.resolve();
    opts.onEvent({type:'response.output_item.done',output_index:0,item:{type:'function_call',call_id:'call_123',name:'quiz',arguments:'{"question":"Why?"}'}});
    opts.onEvent({type:'response.completed',response:{usage:{input_tokens:25,output_tokens:8}}});
  }};
  const events=await collect(streamDevKitEvents(client,request));
  assert.deepEqual(events.map(e=>e.type),['response.output_item.added','response.output_item.done','response.completed']);
  assert.equal(observed.store,undefined); // SDK extension forces store:false
  assert.equal(observed.stream,undefined); // SDK extension forces stream:true
  assert.equal(observed.model,'gpt-6-luna');
  assert.equal(Object.hasOwn(observed,'accessToken'),false);
  assert.equal(Object.hasOwn(observed,'getAccessToken'),false);
});

test('request gate rejects unsupported API fields and malformed tool declarations',()=>{
  assert.throws(()=>assertStructuredRequest({...request,temperature:0.7}),/Unsupported/);
  assert.throws(()=>assertStructuredRequest({...request,store:true}),/stream/);
  assert.throws(()=>assertStructuredRequest({...request,tools:[{type:'web_search'}]}),/function namespaces/);
  assert.throws(()=>assertStructuredRequest({...request,reasoning:{effort:'max'}}),/reasoning/);
  assert.equal(assertStructuredRequest(request).tools.length,1);
});

test('DevKit extension errors propagate without swallowing partial state',async()=>{
  const client={async streamStructuredEvents(opts){
    opts.onEvent({type:'response.output_text.delta',delta:'first'});
    throw new Error('synthetic-upstream-failure');
  }};
  const events=[];
  await assert.rejects(async()=>{for await(const e of streamDevKitEvents(client,request))events.push(e)},/synthetic-upstream-failure/);
  assert.equal(events[0].delta,'first');
});

test('abandoning consumer aborts upstream SDK inference',async()=>{
  let aborted=false;
  const client={async streamStructuredEvents(opts){
    opts.signal.addEventListener('abort',()=>{aborted=true},{once:true});
    opts.onEvent({type:'response.output_text.delta',delta:'partial'});
    await new Promise(resolve=>opts.signal.addEventListener('abort',resolve,{once:true}));
  }};
  for await(const event of streamDevKitEvents(client,request)){assert.equal(event.delta,'partial');break;}
  assert.equal(aborted,true);
});

test('slow consumers cannot make the structured event queue grow without bound',async()=>{
  const client={async streamStructuredEvents(opts){for(let i=0;i<300;i++)opts.onEvent({type:'response.output_text.delta',delta:'a'})}};
  await assert.rejects(async()=>collect(streamDevKitEvents(client,request)),/consumer too slow/);
});

test('original Electron packaged service matches server source adapter',async()=>{
  const packageService=require('../electron/private-subscription/electron-subscription-service.cjs');
  assert.equal(typeof packageService.createElectronSubscriptionService,'function');
  const packageStream=require('../electron/private-subscription/devkit-event-stream.cjs');
  assert.equal(typeof packageStream.streamDevKitEvents,'function');
});

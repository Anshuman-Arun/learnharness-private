import test from 'node:test';
import assert from 'node:assert/strict';
import {
 buildSubscriptionRequest,localFunctionNamespace,functionResult,parseSse,requestSubscriptionEvents
} from '../src/subscription/response-protocol.mjs';
const schemas=[{name:'quiz',description:'Ask a diagnostic question',parameters:{type:'object',properties:{question:{type:'string'}},required:['question'],additionalProperties:false}}];
const tools=[localFunctionNamespace('learning',schemas)];
function streamParts(parts) {return new ReadableStream({start(c) {for(const p of parts)c.enqueue(new TextEncoder().encode(p));c.close();}})}
const sse = event=>`data: ${JSON.stringify(event)}\n\n`;

test('required protocol fields and no unsupported fields',()=>{
 const r=buildSubscriptionRequest({model:'gpt-6-luna',input:[{role:'user',content:'Hi'}],instructions:'Teach carefully',tools});
 assert.equal(r.store,false);assert.equal(r.stream,true);assert.equal(r.instructions,'Teach carefully');
 assert.deepEqual(r.tools,tools);assert.equal(r.temperature,undefined);assert.equal(r.previous_response_id,undefined);
});
test('system-role message rejected; developer instructions separate',()=>{
 assert.throws(()=>buildSubscriptionRequest({model:'m',input:[{role:'system',content:'x'}]}),/system-role/);
});
test('tool return preserves matching call ID',()=>{
 const item={type:'function_call',call_id:'call_7',name:'quiz',arguments:'{}'};
 assert.deepEqual(functionResult(item,{answer:42}),{type:'function_call_output',call_id:'call_7',output:'{"answer":42}'});
});
test('split SSE data and CRLF framing parsed',async()=>{
 const stream=streamParts(['data: {"type":"response.output_text.delta","delta":"H','i"}\r\n\r\n',sse({type:'response.completed'})]);
 const output=[];for await(const e of parseSse(stream))output.push(e.type);
 assert.deepEqual(output,['response.output_text.delta','response.completed']);
});
test('valid completion stream and no credentials in payload',async()=>{
 let captured;
 const fetchImpl=async (url,req)=>{captured={url,req};return new Response(streamParts([
    sse({type:'response.output_text.delta',delta:'Hello'}),
    sse({type:'response.output_item.done',item:{type:'function_call',call_id:'call_1',name:'quiz',arguments:'{}'}}),
    sse({type:'response.completed',response:{usage:{input_tokens:30,output_tokens:12}}})
 ]),{status:200,headers:{'Content-Type':'text/event-stream'}})};
 const events=[];for await(const e of requestSubscriptionEvents({getAccessToken:async()=> 'TEST_FAKE_TOKEN',model:'gpt-6-luna',input:[{role:'user',content:'hello'}],tools,fetchImpl}))events.push(e);
 assert.equal(events.length,3);
 assert.equal(captured.url,'https://api.openai.com/v1/responses');
 assert.equal(captured.req.headers.Authorization,'Bearer TEST_FAKE_TOKEN');
 assert.equal(JSON.stringify(JSON.parse(captured.req.body)).includes('TEST_FAKE_TOKEN'),false);
});
test('stream without completed event is a failure',async()=>{
 const fetchImpl=async()=>new Response(streamParts([sse({type:'response.output_text.delta',delta:'partial'})]),{status:200});
 await assert.rejects(async()=>{for await(const _ of requestSubscriptionEvents({getAccessToken:async()=> 'fake',model:'x',input:[],fetchImpl})){}},/without response.completed/);
});
test('usage errors can arrive after token streaming',async()=>{
 const fetchImpl=async()=>new Response(streamParts([
  sse({type:'response.output_text.delta',delta:'partial'}),
  sse({type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}})
 ]),{status:200});
 await assert.rejects(async()=>{for await(const _ of requestSubscriptionEvents({getAccessToken:async()=> 'fake',model:'x',input:[],fetchImpl})){}},/usage_limit_exceeded/);
});
test('API errors never echo access tokens',async()=>{
 const fetchImpl=async()=>new Response('server details',{status:429});
 await assert.rejects(async()=>{for await(const _ of requestSubscriptionEvents({getAccessToken:async()=> 'SUPER_PRIVATE',model:'x',input:[],fetchImpl})){}},e=>e.message.includes('429')&&!e.message.includes('SUPER_PRIVATE'));
});
test('tool continuation replays call and result in next request (no previous_response_id)',async()=>{
 const seen=[];
 const responses=[
  [{type:'response.output_item.done',item:{type:'function_call',call_id:'call_demo',name:'quiz',namespace:'learning',arguments:'{"question":"2+2?"}'}},{type:'response.completed'}],
  [{type:'response.output_text.delta',delta:'Correct.'},{type:'response.completed'}]
 ];
 const fetchImpl=async (_url,req)=>{
  const body=JSON.parse(req.body);seen.push(body);
  return new Response(streamParts(responses[seen.length-1].map(sse)),{status:200});
 };
 const initial=[{role:'user',content:'Test arithmetic.'}];
 const first=[];
 for await (const e of requestSubscriptionEvents({getAccessToken:async()=> 'fake',model:'m',input:initial,tools,fetchImpl}))first.push(e);
 const call=first.find(e=>e.type==='response.output_item.done').item;
 const replay=[...initial,call,functionResult(call,'4')];
 for await (const _ of requestSubscriptionEvents({getAccessToken:async()=> 'fake',model:'m',input:replay,tools,fetchImpl})){}
 assert.equal(seen.length,2);
 assert.equal(seen[1].input[1].call_id,'call_demo');
 assert.equal(seen[1].input[2].call_id,'call_demo');
 assert.equal(seen[1].previous_response_id,undefined);
});

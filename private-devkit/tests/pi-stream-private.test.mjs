import test from 'node:test';
import assert from 'node:assert/strict';
import {createPiSubscriptionStream} from '../src/subscription/pi-stream-bridge.mjs';
import {projectPiSystem,namespaceForPiTools,nativeToolName} from '../src/subscription/pi-tool-registry.mjs';

const enc=e=>`data: ${JSON.stringify(e)}\n\n`;
const response=(...events)=>new Response(new ReadableStream({start(c){
  const s=events.map(enc).join('');
  // Split event frames and multi-byte UTF-8 in arbitrary positions.
  const data=new TextEncoder().encode(s);for(let i=0;i<data.length;i+=11)c.enqueue(data.slice(i,i+11));c.close();
}}),{status:200,headers:{'content-type':'text/event-stream'}});
const streamFactory=()=>{
  const events=[];let resolve;
  const finished=new Promise(r=>resolve=r);
  return {events,finished,push(e){events.push(e);if(['done','error'].includes(e.type))resolve();}};
};
const model={id:'mock-plan-model'};
const schema={type:'object',properties:{prompt:{type:'string'}},required:['prompt'],additionalProperties:false};
const setup=(extra=[])=>({messages:[
  {role:'system',content:'Act as a mathematical tutor.',toolsAdded:[{name:'quiz',description:'Pose a question',parameters:schema}]},
  {role:'user',content:'Teach me quadratic variation.'},...extra
]});
const invoke=async({events,context=setup(),signal}={})=>{
  let posted;
  const fetchImpl=async(url,opts)=>{posted=JSON.parse(opts.body);return response(...events)};
  const stream=createPiSubscriptionStream(model,context,{reasoning:'high',signal},{
    makeEventStream:streamFactory,getAccessToken:async()=> 'fake-oauth-token',fetchImpl
  });
  await stream.finished;
  return {stream,posted};
};

test('pi system model tools survive system transcription and do not vanish',()=>{
  const sys=projectPiSystem([
    {role:'system',content:'Teach',sections:{s1:'First',s2:'Old'},toolsAdded:[
      {name:'quiz',description:'Pose a question',parameters:schema},
      {name:'research',description:'Search',parameters:schema}]},
    {role:'user',content:'Start'},
    {role:'system',content:'Do not flatter',sections:{s2:null,s3:'New'},toolsRemoved:[{name:'research'}]}
  ]);
  assert.equal(sys.instructions,'Teach\n\nDo not flatter\n\nFirst\n\nNew');
  assert.equal(sys.messages.length,1);
  assert.deepEqual(sys.tools.map(t=>t.name),['quiz']);
  assert.deepEqual(namespaceForPiTools(sys.tools).tools[0].parameters,schema);
});

test('pi stream text events, completions, usage, requests, and zero billed cost',async()=>{
  const {stream,posted}=await invoke({events:[
    {type:'response.output_text.delta',output_index:0,content_index:0,delta:'First, '},
    {type:'response.output_text.delta',output_index:0,content_index:0,delta:'define Brownian motion.'},
    {type:'response.output_text.done',output_index:0,content_index:0,text:'First, define Brownian motion.'},
    {type:'response.completed',response:{id:'resp1',usage:{input_tokens:145,output_tokens:38,total_tokens:183,
      input_tokens_details:{cached_tokens:42},output_tokens_details:{reasoning_tokens:9}}}}
  ]});
  assert.equal(posted.instructions,'Act as a mathematical tutor.');
  assert.equal(posted.tools.length,1);
  assert.equal(posted.tools[0].name,'learnharness');
  assert.equal(posted.tools[0].tools[0].name,'quiz');
  assert.equal(posted.reasoning.effort,'high');
  assert.equal(posted.store,false);assert.equal(posted.stream,true);
  assert.equal(posted.previous_response_id,undefined);
  assert.deepEqual(stream.events.map(e=>e.type),['start','text_start','text_delta','text_delta','text_end','done']);
  const end=stream.events.at(-1);
  assert.equal(end.message.content[0].text,'First, define Brownian motion.');
  assert.equal(end.message.usage.input,145);
  assert.equal(end.message.usage.reasoning,9);
  assert.equal(end.message.usage.cacheRead,42);
  assert.equal(end.message.usage.cost.total,0);
  assert.equal(end.reason,'stop');
});

test('pi stream preserves tool calls, namespace mapping, JSON arguments and result semantics',async()=>{
  const {stream,posted}=await invoke({events:[
    {type:'response.output_item.added',output_index:0,item:{type:'function_call',call_id:'call_123',name:'quiz',namespace:'learnharness'}},
    {type:'response.function_call_arguments.delta',output_index:0,delta:'{"prom'},
    {type:'response.function_call_arguments.delta',output_index:0,delta:'pt":"Give an example"}'},
    {type:'response.output_item.done',output_index:0,item:{type:'function_call',call_id:'call_123',name:'quiz',namespace:'learnharness',arguments:'{"prompt":"Give an example"}'}},
    {type:'response.completed',response:{usage:{input_tokens:35,output_tokens:18}}}
  ]});
  assert.deepEqual(stream.events.map(e=>e.type),['start','toolcall_start','toolcall_delta','toolcall_delta','toolcall_end','done']);
  const call=stream.events.find(e=>e.type==='toolcall_end').toolCall;
  assert.deepEqual(call,{type:'toolCall',id:'call_123',name:'quiz',namespace:'learnharness',arguments:{prompt:'Give an example'}});
  assert.equal(stream.events.at(-1).reason,'toolUse');
  assert.equal(posted.tools[0].tools[0].type,'function');
});

test('pi stream rejects a fake namespace',async()=>{
  const {stream}=await invoke({events:[
    {type:'response.output_item.done',output_index:0,item:{type:'function_call',call_id:'call_11',name:'danger',namespace:'unknown',arguments:'{}'}},
    {type:'response.completed',response:{}}
  ]});
  assert.equal(stream.events.at(-1).type,'error');
});

test('incomplete network stream never reports pi success',async()=>{
  const {stream}=await invoke({events:[
    {type:'response.output_text.delta',delta:'Partial!',output_index:0}
  ]});
  assert.equal(stream.events.at(-1).type,'error');
  assert.ok(!stream.events.some(e=>e.type==='done'));
});

test('usage limit after partial text reports error, not false completion',async()=>{
  const {stream}=await invoke({events:[
    {type:'response.output_text.delta',delta:'Partial',output_index:0},
    {type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}
  ]});
  assert.equal(stream.events.at(-1).reason,'error');
  assert.match(stream.events.at(-1).error.errorMessage,/allowance/);
});

test('abort is propagated to the pi event stream',async()=>{
  const ac=new AbortController();ac.abort();
  const {stream}=await invoke({events:[],signal:ac.signal});
  assert.equal(stream.events.at(-1).reason,'aborted');
});

test('an invalid JSON tool call preserves the malformed arguments for pi validation',async()=>{
  const {stream}=await invoke({events:[
    {type:'response.output_item.done',output_index:0,item:{type:'function_call',call_id:'call_bad',name:'quiz',arguments:'[invalid'}},
    {type:'response.completed',response:{}}
  ]});
  const call=stream.events.find(e=>e.type==='toolcall_end').toolCall;
  assert.deepEqual(call.arguments,{});
  assert.match(call.argumentsError,/Malformed JSON/);
});

test('malicious tool names rejected at configuration and execution',()=>{
  assert.throws(()=>namespaceForPiTools([{name:'../evil',parameters:schema,description:'Evil'}]),/Invalid/);
  assert.throws(()=>nativeToolName({type:'function_call',name:'../evil'}),/Invalid/);
});


test('namespace identity is conserved when resuming recorded tool calls',async()=>{
  const {toSubscriptionHistory}=await import('../src/subscription/pi-message-codec.mjs');
  const m=[{role:'user',content:'Start.'},
    {role:'assistant',content:[{type:'toolCall',name:'quiz',namespace:'learnharness',id:'call_6',arguments:{prompt:'State an assumption'}}]},
    {role:'toolResult',toolCallId:'call_6',toolName:'quiz',content:[{type:'text',text:'Bounded'}]}];
  const h=toSubscriptionHistory(m);
  assert.deepEqual(h.input.map(x=>x.type??x.role),['user','function_call','function_call_output']);
  assert.equal(h.input[1].namespace,'learnharness');
});

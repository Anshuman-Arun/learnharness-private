/**
 * End-to-end fake inference HTTP test using pi native transcripts.
 * Verifies that the codec preserves the decisive LearnHarness boundary:
 * a question tool call, the learner's answer, and a resumed lesson.
 * No account, network, or credentials are used.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {toSubscriptionHistory} from '../src/subscription/pi-message-codec.mjs';
import {requestSubscriptionEvents} from '../src/subscription/response-protocol.mjs';
const encode = event=>`data: ${JSON.stringify(event)}\n\n`;
const streamingResponse = (...events)=>new Response(new ReadableStream({start(c){
  c.enqueue(new TextEncoder().encode(events.map(encode).join('')));c.close();
}}),{status:200,headers:{'Content-Type':'text/event-stream'}});

test('persisted pi history resumes quiz across HTTP requests without response ID',async()=>{
  const sent=[];
  const fetchImpl=async(_,opts)=>{
    sent.push(JSON.parse(opts.body));
    if(sent.length===1) return streamingResponse(
      {type:'response.output_item.done',item:{type:'function_call',call_id:'call_exam',name:'quiz',arguments:'{"question":"Explain quadratic variation"}'}},
      {type:'response.completed',response:{usage:{input_tokens:500,output_tokens:100}}});
    return streamingResponse(
      {type:'response.output_text.delta',delta:'That reasoning is insufficient because...'},
      {type:'response.completed',response:{usage:{input_tokens:620,output_tokens:180}}});
  };
  const messages=[{role:'system',content:'Diagnostic mathematics tutor.'},{role:'user',content:'Teach stochastic calculus.'}];
  const first=toSubscriptionHistory(messages);
  const events=[];
  for await(const evt of requestSubscriptionEvents({model:'model-from-account',input:first.input,
    instructions:first.instructions,getAccessToken:async()=> 'stub-token',fetchImpl})) events.push(evt);
  const call=events.find(x=>x.type==='response.output_item.done').item;
  messages.push({role:'assistant',content:[{type:'toolCall',id:call.call_id,name:call.name,arguments:JSON.parse(call.arguments)}]});
  messages.push({role:'toolResult',toolCallId:call.call_id,toolName:call.name,
    content:[{type:'text',text:'The sum of squared Brownian increments converges to t because independent increments.'}]});
  const second=toSubscriptionHistory(messages);
  for await(const _ of requestSubscriptionEvents({model:'model-from-account',input:second.input,
    instructions:second.instructions,getAccessToken:async()=> 'stub-token',fetchImpl})){}
  assert.equal(sent.length,2);
  assert.equal(sent[1].instructions,'Diagnostic mathematics tutor.');
  assert.deepEqual(sent[1].input.map(x=>x.type??x.role),['user','function_call','function_call_output']);
  assert.equal(sent[1].input[2].call_id,'call_exam');
  assert.equal(sent[1].previous_response_id,undefined);
  assert.equal(sent[1].store,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {brokerInferenceEvents} from '../src/subscription/loopback-client.mjs';
import {createPiSubscriptionStream} from '../src/subscription/pi-stream-bridge.mjs';
const require=createRequire(import.meta.url);
const {startSubscriptionBroker}=require('../src/subscription/loopback-broker.cjs');
const makeStream=()=>{
  const events=[];let done;
  const settled=new Promise(r=>done=r);
  return {events,settled,push(ev){events.push(ev);if(['done','error'].includes(ev.type))done()}};
};
const tool={name:'quiz',description:'Ask a question',parameters:{type:'object',properties:{prompt:{type:'string'}},required:['prompt']}};

test('entire mocked desktop broker -> pi tool -> persisted answer -> continuation',async()=>{
  const seen=[];
  const service={
    session:async()=>({status:'connected',sharing:true}),
    models:async()=>[{slug:'luna-test',displayName:'Luna'}],
    infer:async function* (payload){
      seen.push(payload);
      assert.equal(payload.store,false);
      assert.equal(payload.stream,true);
      assert.equal(payload.instructions,'Teach mathematics.');
      assert.equal(payload.previous_response_id,undefined);
      if(seen.length===1){
        assert.equal(payload.tools[0].tools[0].name,'quiz');
        yield {type:'response.output_item.done',output_index:0,item:{type:'function_call',call_id:'call_42',name:'quiz',namespace:'learnharness',arguments:'{"prompt":"What is dW²?"}'}};
        yield {type:'response.completed',response:{usage:{input_tokens:75,output_tokens:16}}};
      } else {
        assert.equal(payload.input.at(-2).call_id,'call_42');
        assert.equal(payload.input.at(-1).call_id,'call_42');
        assert.equal(payload.input.at(-1).output,'dt');
        yield {type:'response.output_text.delta',output_index:0,content_index:0,delta:'Correct under Itô rules.'};
        yield {type:'response.completed',response:{usage:{input_tokens:140,output_tokens:8}}};
      }
    }
  };
  const broker=await startSubscriptionBroker({service});
  try{
    const opts={env:{LH_SUBSCRIPTION_BROKER_PORT:String(broker.port),LH_SUBSCRIPTION_BROKER_SECRET:broker.secret}};
    const deps={makeEventStream:makeStream,requestEvents:(input,other)=>brokerInferenceEvents(input,{...other,...opts})};
    const first=createPiSubscriptionStream({id:'luna-test'},
      {messages:[{role:'system',content:'Teach mathematics.',toolsAdded:[tool]},
        {role:'user',content:'Explain quadratic variation.'}]},{reasoning:'high'},deps);
    await first.settled;
    assert.equal(first.events.at(-1).reason,'toolUse');
    const call=first.events.at(-1).message.content.find(v=>v.type==='toolCall');
    assert.equal(call.name,'quiz');
    const second=createPiSubscriptionStream({id:'luna-test'},
      {messages:[{role:'system',content:'Teach mathematics.',toolsAdded:[tool]},
        {role:'user',content:'Explain quadratic variation.'},
        {role:'assistant',content:[call]},
        {role:'toolResult',toolCallId:call.id,toolName:'quiz',content:[{type:'text',text:'dt'}]}]},
      {reasoning:'high'},deps);
    await second.settled;
    assert.equal(second.events.at(-1).reason,'stop');
    assert.equal(second.events.at(-1).message.content[0].text,'Correct under Itô rules.');
    assert.equal(seen.length,2);
  }finally{await broker.close();}
});

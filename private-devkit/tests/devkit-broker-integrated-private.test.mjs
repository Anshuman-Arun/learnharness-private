/** Exercises the actual default SDK-extension adapter through the HTTP broker
 * and LearnHarness's native pi stream bridge (still synthetic OAuth/model). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {brokerInferenceEvents,brokerModels} from '../src/subscription/loopback-client.mjs';
import {createPiSubscriptionStream} from '../src/subscription/pi-stream-bridge.mjs';
const require=createRequire(import.meta.url);
const {startSubscriptionBroker}=require('../src/subscription/loopback-broker.cjs');
const {createElectronSubscriptionService}=require('../src/subscription/electron-subscription-service.cjs');
const makeStream=()=>{const events=[];let done;const settled=new Promise(r=>done=r);return {events,settled,push(e){events.push(e);if(e.type==='done'||e.type==='error')done(e);}}};
function desktopFixture(){
  const seen=[];
  const client={
    getSession:async()=>({status:'connected',sharing:true}),
    signIn:async()=>({status:'connected',sharing:true}),
    listModels:async()=>[{slug:'gpt-6-luna',displayName:'GPT-6 Luna'}],
    disconnect:async()=>{},
    async streamStructuredEvents(req){
      seen.push(req);
      assert.equal(req.store,undefined); // the trusted SDK adds this field itself
      assert.equal(req.stream,undefined);
      assert.equal(req.tools?.[0].type,'namespace');
      assert.equal(req.tools[0].tools[0].name,'quiz');
      if(seen.length===1){
        req.onEvent({type:'response.output_item.done',output_index:0,item:{type:'function_call',namespace:'learnharness',call_id:'call_student',name:'quiz',arguments:'{"question":"What is quadratic variation?"}'}});
      } else {
        const last=req.input.at(-1);
        assert.equal(last.type,'function_call_output');
        assert.equal(last.call_id,'call_student');
        req.onEvent({type:'response.output_text.delta',output_index:0,content_index:0,delta:'You correctly described quadratic variation.'});
      }
      req.onEvent({type:'response.completed',response:{usage:{input_tokens:75,output_tokens:20}}});
    }
  };
  const service=createElectronSubscriptionService({
    app:{isReady:()=>true,getPath:()=>'/tmp'},shell:{openExternal:async()=>{}},
    safeStorage:{isEncryptionAvailable:()=>true,encryptString:Buffer.from,decryptString:b=>String(b)},
    createChatGPT:()=>client,
  });
  return {service,seen};
}

test('native provider -> real HTTP broker -> actual default DevKit extension adapter -> quiz -> resume',async()=>{
  const {service,seen}=desktopFixture();
  const broker=await startSubscriptionBroker({service});
  try{
    const env={LH_SUBSCRIPTION_BROKER_PORT:String(broker.port),LH_SUBSCRIPTION_BROKER_SECRET:broker.secret};
    const list=await brokerModels({env});
    assert.equal(list[0].slug,'gpt-6-luna');
    const deps={makeEventStream:makeStream,requestEvents:(req,{signal}={})=>brokerInferenceEvents(req,{env,signal})};
    const prompt={role:'system',content:'Teach math.',toolsAdded:[{name:'quiz',description:'Ask a question',parameters:{type:'object'}}]};
    const first=createPiSubscriptionStream({id:'gpt-6-luna'},
      {messages:[prompt,{role:'user',content:'Explain stochastic calculus.'}]},{reasoning:'high'},deps);
    await first.settled;
    assert.equal(first.events.at(-1).reason,'toolUse');
    const call=first.events.at(-1).message.content.find(x=>x.type==='toolCall');
    assert.equal(call.name,'quiz');
    assert.equal(call.id,'call_student');
    const second=createPiSubscriptionStream({id:'gpt-6-luna'},
      {messages:[prompt,{role:'user',content:'Explain stochastic calculus.'},
        {role:'assistant',content:[call]},
        {role:'toolResult',toolCallId:'call_student',toolName:'quiz',content:[{type:'text',text:'Limit of squared increments.'}]}]},
      {reasoning:'high'},deps);
    await second.settled;
    assert.equal(second.events.at(-1).reason,'stop');
    assert.equal(second.events.at(-1).message.content[0].text,'You correctly described quadratic variation.');
    assert.equal(seen.length,2);
    assert.equal(seen[1].input.at(-2).type,'function_call');
    assert.equal(seen[1].input.at(-1).type,'function_call_output');
    assert.equal(seen[1].reasoning.effort,'high');
  }finally{await broker.close()}
});

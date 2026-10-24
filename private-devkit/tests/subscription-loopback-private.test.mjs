import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import http from 'node:http';
import {brokerModels,brokerSession,brokerInferenceEvents,brokerRequest} from '../src/subscription/loopback-client.mjs';
const require=createRequire(import.meta.url);
const {startSubscriptionBroker}=require('../src/subscription/loopback-broker.cjs');
const delay=(t)=>new Promise(r=>setTimeout(r,t));
const token='test-capability-that-is-not-a-real-credential-012345';
const fakeService={
  session:async()=>({status:'connected',sharing:true}),
  models:async()=>[{slug:'test-luna',displayName:'Test model'}],
  infer:async function* (request,{signal}) {
    yield {type:'response.output_text.delta',delta:'Hello'};
    await delay(2);
    signal.throwIfAborted();
    yield {type:'response.completed',response:{id:'resp_test',usage:{input_tokens:2,output_tokens:1}}};
  }
};
async function withServer(run,service=fakeService){
  const broker=await startSubscriptionBroker({service,secret:token});
  const opts={env:{LH_SUBSCRIPTION_BROKER_PORT:String(broker.port),LH_SUBSCRIPTION_BROKER_SECRET:token}};
  try {await run({...opts,port:broker.port});}finally{await broker.close();}
}

test('authenticated broker session and account models without exposing credential',async()=>{
  await withServer(async opts=>{
    assert.equal((await brokerSession(opts)).status,'connected');
    assert.equal((await brokerModels(opts))[0].slug,'test-luna');
    const out=[];
    for await (const event of brokerInferenceEvents({model:'test-luna',input:[{role:'user',content:'Hello'}]},opts)) out.push(event);
    assert.deepEqual(out.map(x=>x.type),['response.output_text.delta','response.completed']);
    assert.equal(JSON.stringify(out).includes(token),false);
  });
});

test('reject forged capability, host header, Origin and GET without touching backend',async()=>{
  let calls=0;
  const service={...fakeService,models:async()=>{calls++;return []}};
  await withServer(async opts=>{
    const url=`http://127.0.0.1:${opts.port}/models`;
    const auth=`Bearer ${token}`;
    const cases=[
      [{method:'POST',headers:{Authorization:'Bearer wrong','Content-Type':'application/json'},body:'{}'},401],
      [{method:'POST',headers:{Authorization:auth,Host:'evil.example','Content-Type':'application/json'},body:'{}'},403],
      [{method:'POST',headers:{Authorization:auth,Origin:'http://localhost','Content-Type':'application/json'},body:'{}'},403],
      [{method:'GET',headers:{Authorization:auth}},405],
      [{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:'not json'},400]
    ];
    for(const [init,expected] of cases) {
      const status = init.headers.Host ? await new Promise((resolve,reject)=>{
        const req=http.request(url,{method:init.method,headers:init.headers},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
        req.on('error',reject);req.end(init.body);
      }) : (await fetch(url,init)).status;
      assert.equal(status,expected);
    }
    assert.equal(calls,0);
  },service);
});

test('child refuses to start if broker capability is not present',async()=>{
  await assert.rejects(()=>brokerSession({env:{}}),/desktop broker/);
});

test('stream ends without response.completed -> error, rather than silently succeeding',async()=>{
  const service={...fakeService,infer:async function*(){yield {type:'response.output_text.delta',delta:'partial'};}};
  await withServer(async opts=>{
    await assert.rejects(async()=>{for await(const event of brokerInferenceEvents({model:'test-luna',input:[]},opts)){}},/Incomplete subscription response/);
  },service);
});

test('broker rejects unauthenticated long payloads before memory allocation',async()=>{
  await withServer(async opts=>{
    const response=await fetch(`http://127.0.0.1:${opts.port}/infer`,{method:'POST',headers:{Authorization:'Bearer wrong','Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(1024*1024)})});
    assert.equal(response.status,401);
  });
});

test('model stream cancellation reaches trusted main process',async()=>{
  let cancelled=false;
  const service={...fakeService,infer:async function* (_req,{signal}) {
    try {yield {type:'response.output_text.delta',delta:'start'};await new Promise(r=>setTimeout(r,150));signal.throwIfAborted();yield {type:'response.completed'};}
    finally {cancelled=signal.aborted;}
  }};
  await withServer(async opts=>{
    const ac=new AbortController();
    const iter=brokerInferenceEvents({model:'test-luna',input:[]},{...opts,signal:ac.signal});
    const first=await iter.next();
    assert.equal(first.value.delta,'start');
    ac.abort();
    await assert.rejects(async()=>{await iter.next()});
    await delay(180);
    assert.equal(cancelled,true);
  },service);
});

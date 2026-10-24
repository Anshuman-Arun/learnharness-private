import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createElectronSubscriptionService}=require('../src/subscription/electron-subscription-service.cjs');
const secret='secret-token-that-must-never-leak';
function fixture(){
  let state={status:'disconnected',sharing:false};
  const calls=[];
  const app={isReady:()=>true,getPath:()=>'/temporary'};
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};
  const shell={openExternal:url=>{calls.push(url);}};
  const createChatGPT=config=>{
    calls.push(config);
    return {getSession:async()=>({...state,credentials:{accessToken:secret}}),
      signIn:async()=>{state={status:'connected',sharing:true};return state},
      listModels:async()=>[{slug:'luna-test',displayName:'Test Luna'},{slug:100}],
      disconnect:async()=>{state={status:'disconnected',sharing:false}}};
  };
  return {app,safeStorage,shell,createChatGPT,calls};
}

test('uses official DevKit constructor with Electron safeStorage and no plaintext fallback',async()=>{
  const f=fixture();
  const service=createElectronSubscriptionService(f);
  const config=f.calls[0];
  assert.equal(config.redirectPort,0);
  assert.equal(config.appId,'learnharness-private');
  assert.equal(config.credentialEncryption.id,'electron-safe-storage-v1');
  assert.equal(config.credentialEncryption.decrypt(config.credentialEncryption.encrypt('hello')),'hello');
  assert.equal((await service.session()).status,'disconnected');
});

test('does not leak DevKit token to session JSON or model listings',async()=>{
  const f=fixture();
  const service=createElectronSubscriptionService(f);
  assert.equal((await service.session()).credentials,undefined);
  await assert.rejects(()=>service.models(),/not authorized/);
  await service.signIn();
  const state=await service.session();
  assert.equal(JSON.stringify(state).includes(secret),false);
  assert.deepEqual(await service.models(),[{slug:'luna-test',displayName:'Test Luna'}]);
  await service.disconnect();
  assert.equal((await service.session()).status,'disconnected');
});

test('tool-enabled inference cannot silently substitute the text-only official SDK',async()=>{
  const f=fixture();const service=createElectronSubscriptionService(f);
  await service.signIn();
  await assert.rejects(()=>service.infer({model:'luna-test',input:[]},{signal:new AbortController().signal}),/tool-stream extension/);
});

test('inference extension runs only after successful sharing sign-in',async()=>{
  const f=fixture();let invoked=0;
  const service=createElectronSubscriptionService({...f,streamEventsExtension:()=>{invoked++;return (async function*(){yield {type:'response.completed'}})();}});
  await assert.rejects(()=>service.infer({model:'luna-test',input:[]},{signal:new AbortController().signal}),/not authorized/);
  assert.equal(invoked,0);
  await service.signIn();
  const events=await service.infer({model:'luna-test',input:[]},{signal:new AbortController().signal});
  const all=[];for await(const e of events)all.push(e);
  assert.equal(invoked,1);
  assert.equal(all[0].type,'response.completed');
});

test('credential encryption unavailability blocks official login integration',()=>{
  const f=fixture();f.safeStorage.isEncryptionAvailable=()=>false;
  const service=createElectronSubscriptionService(f);
  assert.throws(()=>f.calls[0].credentialEncryption.encrypt('token'),/unavailable/);
  assert.equal(service!==undefined,true);
});

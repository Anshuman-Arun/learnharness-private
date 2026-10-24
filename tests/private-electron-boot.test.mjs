import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {brokerModels,brokerSession} from '../src/subscription/loopback-client.mjs';
const require=createRequire(import.meta.url);
const {startPrivateSubscription}=require('../electron/private-subscription/init.cjs');
const mockElectron=()=>({app:{isReady:()=>true,getPath:()=>'/tmp/learnharness-private'},shell:{openExternal:()=>{}},
 safeStorage:{isEncryptionAvailable:()=>true,encryptString:x=>Buffer.from(x),decryptString:b=>b.toString('utf8')}});
const mockSdk=()=>({getSession:async()=>({status:'connected',sharing:true,identity:{email:'do.not.leak@example.com'},credentials:{refreshToken:'secret'}}),
 signIn:async()=>({status:'connected',sharing:true}),disconnect:async()=>{},listModels:async()=>[{slug:'luna-demo',displayName:'Luna demo'}]});
test('trusted Electron boot starts broker but cannot return OAuth credentials',async()=>{
 const session=await startPrivateSubscription({...mockElectron(),createChatGPT:mockSdk});
 assert.ok(session);
 try{
   assert.ok(session.childEnvironment.LH_SUBSCRIPTION_BROKER_SECRET.length>=32);
   const o={env:session.childEnvironment};
   const st=await brokerSession(o);
   assert.equal(st.status,'connected');
   assert.equal(JSON.stringify(st).includes('secret'),false);
   assert.equal(JSON.stringify(st).includes('@example.com'),false);
   assert.equal((await brokerModels(o))[0].slug,'luna-demo');
 }finally{await session.close();}
});
test('Electron broker fails closed when SDK is unavailable',async()=>{
 const log=[];
 const x=await startPrivateSubscription({...mockElectron(),log:t=>log.push(t)});
 assert.equal(x,null);
 assert.match(log.join(' '),/not installed/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverPlanModels,selectedModelAllowed} from '../src/subscription/model-catalog.mjs';

test('discovers only list-visible models, de-duplicates, preserves ordering',async()=>{
 let request;
 const models=await discoverPlanModels({getAccessToken:async()=> 'fake-oauth-token',fetchImpl:async(url,init)=>{
  request={url,init};return new Response(JSON.stringify({models:[
   {slug:'m1',display_name:'Model One',visibility:'list'},
   {slug:'hidden',display_name:'Hidden Model',visibility:'hidden'},
   {slug:'m1',display_name:'Dup',visibility:'list'},
   {slug:'m2',display_name:'Model Two',visibility:'list'}
  ]}),{status:200,headers:{'Content-Type':'application/json'}});
 }});
 assert.deepEqual(models,[{id:'m1',name:'Model One'},{id:'m2',name:'Model Two'}]);
 assert.equal(request.url,'https://api.openai.com/v1/models');
 assert.equal(request.init.headers.Authorization,'Bearer fake-oauth-token');
 assert.equal(selectedModelAllowed(models,'m2'),true);
 assert.equal(selectedModelAllowed(models,'not-in-account'),false);
});
test('never silently substitutes an unavailable model',async()=>{
 await assert.rejects(()=>discoverPlanModels({getAccessToken:async()=> 'x',fetchImpl:async()=>new Response('bad',{status:403})}),/403/);
});

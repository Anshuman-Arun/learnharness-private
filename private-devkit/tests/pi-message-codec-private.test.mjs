import test from 'node:test';
import assert from 'node:assert/strict';
import {toSubscriptionHistory} from '../src/subscription/pi-message-codec.mjs';

const piMessage={role:'assistant',id:'internal-1',model:'some-model',content:[
  {type:'text',text:'Before.'},
  {type:'thinking',thinking:'not for replay'},
  {type:'toolCall',id:'call_7',name:'quiz',arguments:{question:'What is 2+2?'}},
  {type:'text',text:'After.'}
]};
test('pi transcript is full replay with instructions separated and tool identifiers conserved',()=>{
  const messages=[
    {role:'system',content:'Follow the teaching protocol.'},
    {role:'user',content:[{type:'text',text:'Teach me.'}]},
    piMessage,
    {role:'toolResult',toolCallId:'call_7',toolName:'quiz',content:[{type:'text',text:'4'}]},
    {role:'user',content:'Please continue.'}
  ];
  const result=toSubscriptionHistory(messages);
  assert.equal(result.instructions,'Follow the teaching protocol.');
  assert.deepEqual(result.input.map(x=>x.type||x.role),['user','assistant','function_call','assistant','function_call_output','user']);
  assert.equal(result.input[2].call_id,'call_7');
  assert.equal(result.input[4].call_id,'call_7');
  assert.equal(result.unreplayedReasoningBlocks,1);
  assert.equal(JSON.stringify(result).includes('not for replay'),false);
  assert.equal(JSON.stringify(result).includes('internal-1'),false);
});
test('image content is replayed as data URL, no remote file upload',()=>{
  const result=toSubscriptionHistory([{role:'user',content:[
    {type:'text',text:'See this image'},{type:'image',mimeType:'image/png',data:'YWJj'}]}]);
  assert.equal(result.input[0].content[1].image_url,'data:image/png;base64,YWJj');
});
test('unsupported content and custom markers fail rather than silently disappear',()=>{
 assert.throws(()=>toSubscriptionHistory([{role:'custom',content:'injected'}]),/toLlmMessages/);
 assert.throws(()=>toSubscriptionHistory([{role:'user',content:[{type:'audio',data:'x'}]}]),/audio/);
 assert.throws(()=>toSubscriptionHistory([{role:'assistant',content:[{type:'unknown'}]}]),/unknown/);
});

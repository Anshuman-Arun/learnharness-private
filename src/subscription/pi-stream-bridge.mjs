/**
 * Early pi-ai StreamFunction-compatible adapter for ChatGPT plan Responses.
 * Dependency-free core; production binds makeEventStream to
 * @earendil-works/pi-ai.createAssistantMessageEventStream.
 *
 * This intentionally does NOT implement OAuth. getAccessToken MUST be backed
 * by the official DevKit on the trusted local side, not the browser renderer.
 * It also does not register a provider in LearnHarness's model catalog yet.
 */
import {requestSubscriptionEvents} from './response-protocol.mjs';
import {toSubscriptionHistory} from './pi-message-codec.mjs';
import {projectPiSystem,namespaceForPiTools,nativeToolName} from './pi-tool-registry.mjs';

const blankUsage = () => ({input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,
  cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}});

function convertUsage(usage) {
  const u=blankUsage();
  if (!usage) return u;
  u.input=Math.max(0,Number(usage.input_tokens)||0);
  u.output=Math.max(0,Number(usage.output_tokens)||0);
  u.cacheRead=Math.max(0,Number(usage.input_tokens_details?.cached_tokens)||0);
  u.totalTokens=Number(usage.total_tokens)||(u.input+u.output);
  if(usage.output_tokens_details?.reasoning_tokens!==undefined)
    u.reasoning=Math.max(0,Number(usage.output_tokens_details.reasoning_tokens)||0);
  // Dollars are deliberately 0: these are not billed API calls.
  return u;
}

function argumentsObject(raw){
  try {
    const obj=JSON.parse(raw||'{}');
    if(obj && typeof obj==='object' && !Array.isArray(obj)) return {parsed:obj};
  }catch{}
  return {parsed:{},error:`Malformed JSON object for tool call; raw arguments: ${String(raw).slice(0,4096)}`};
}

/** The pi-compatible stream is returned synchronously; async work runs off-turn. */
export function createPiSubscriptionStream(model,context,options={},deps={}) {
  if(typeof deps.makeEventStream !== 'function') throw new Error('Inject createAssistantMessageEventStream from pi-ai');
  const stream=deps.makeEventStream();
  const msg={role:'assistant',api:'openai-responses',provider:'chatgpt-plan',model:model.id,
    timestamp:Date.now(),content:[],usage:blankUsage(),stopReason:'pending'};

  void (async()=>{
    let terminal=false;
    const textItems=new Map();
    const calls=new Map();
    const push=(event)=>stream.push(event);
    const endText=(key, definitive)=>{
      const entry=textItems.get(key);
      if(!entry || entry.done) return;
      if(typeof definitive==='string') msg.content[entry.index].text=definitive;
      entry.done=true;
      push({type:'text_end',contentIndex:entry.index,content:msg.content[entry.index].text,partial:msg});
    };
    const initText=(key)=>{
      if(textItems.has(key))return textItems.get(key);
      const index=msg.content.length;
      msg.content.push({type:'text',text:''});
      const entry={index,done:false}; textItems.set(key,entry);
      push({type:'text_start',contentIndex:index,partial:msg});
      return entry;
    };
    const initCall=(key,item={})=>{
      if(calls.has(key))return calls.get(key);
      const index=msg.content.length;
      const call={type:'toolCall',id:item.call_id??'',name:item.name??'',arguments:{}};
      msg.content.push(call);
      const entry={index,raw:'',done:false,item};calls.set(key,entry);
      push({type:'toolcall_start',contentIndex:index,partial:msg});
      return entry;
    };
    const endCall=(key,item)=>{
      const entry=initCall(key,item);
      if(entry.done) return;
      const complete={...entry.item,...item,type:'function_call'};
      if(!complete.call_id || typeof complete.call_id!=='string')throw new Error('Tool call missing call_id');
      const nativeName=nativeToolName(complete);
      if(typeof complete.arguments==='string')entry.raw=complete.arguments;
      const {parsed,error}=argumentsObject(entry.raw);
      const call={type:'toolCall',id:complete.call_id,name:nativeName,arguments:parsed,
        ...(complete.namespace?{namespace:complete.namespace}:{}),
        ...(error?{argumentsError:error}:{})};
      msg.content[entry.index]=call;entry.done=true;
      push({type:'toolcall_end',contentIndex:entry.index,toolCall:call,partial:msg});
    };
    try {
      if(typeof model?.id!=='string'||!model.id)throw new Error('Missing selected model id');
      const sys=projectPiSystem(context.messages);
      const history=toSubscriptionHistory(sys.messages);
      const namespace=namespaceForPiTools(sys.tools);
      const reasoning=options.reasoning&&options.reasoning!=='off'?{effort:options.reasoning}:undefined;
      // First event must precede partial deltas; own fake stream adapters
      // can reproduce the pi exact timing contract in unit tests.
      push({type:'start',partial:msg});
      const params={model:model.id,input:history.input,
        instructions:sys.instructions||history.instructions||undefined,
        ...(reasoning?{reasoning}:{}),...(namespace?{tools:[namespace]}:{})};
      const events=typeof deps.requestEvents==='function'
        ? deps.requestEvents(params,{signal:options.signal})
        : requestSubscriptionEvents({...params,getAccessToken:deps.getAccessToken,
            fetchImpl:deps.fetchImpl??fetch,signal:options.signal});
      for await (const ev of events) {
        if(options.signal?.aborted) throw new DOMException('Aborted','AbortError');
        if(ev.type==='response.output_text.delta'){
          const key=ev.item_id??`text:${ev.output_index??0}:${ev.content_index??0}`;
          const entry=initText(key);
          const delta=ev.delta??'';
          if(typeof delta!=='string')throw new Error('Malformed text delta');
          msg.content[entry.index].text+=delta;
          push({type:'text_delta',contentIndex:entry.index,delta,partial:msg});
        } else if(ev.type==='response.output_text.done'){
          const key=ev.item_id??`text:${ev.output_index??0}:${ev.content_index??0}`;
          initText(key);endText(key,ev.text);
        } else if(ev.type==='response.output_item.added' && ev.item?.type==='function_call'){
          initCall(String(ev.output_index??ev.item.id??ev.item.call_id),ev.item);
        } else if(ev.type==='response.function_call_arguments.delta'){
          const key=String(ev.output_index??ev.item_id??'');
          const entry=initCall(key);
          const delta=ev.delta??'';
          if(typeof delta!=='string')throw new Error('Malformed tool arguments delta');
          entry.raw+=delta;
          push({type:'toolcall_delta',contentIndex:entry.index,delta,partial:msg});
        } else if(ev.type==='response.output_item.done' && ev.item?.type==='function_call'){
          endCall(String(ev.output_index??ev.item.id??ev.item.call_id),ev.item);
        } else if(ev.type==='response.completed'){
          for(const [key] of textItems)endText(key);
          // Do NOT claim success if a tool call was never completed.
          if([...calls.values()].some(c=>!c.done))throw new Error('Tool invocation was interrupted mid-stream');
          msg.usage=convertUsage(ev.response?.usage);
          msg.responseId=ev.response?.id;
          msg.stopReason=msg.content.some(c=>c.type==='toolCall')?'toolUse':'stop';
          terminal=true;
          push({type:'done',reason:msg.stopReason,message:msg});
        }
      }
      if(!terminal)throw new Error('Missing response.completed');
    } catch(e) {
      if(terminal)return;
      const aborted=options.signal?.aborted||e?.name==='AbortError';
      msg.stopReason=aborted?'aborted':'error';
      // Never include credentials, raw HTTP request or user content in errors.
      msg.errorMessage=aborted?'Request cancelled':
        /subscription_sharing_usage_(limit_exceeded|unavailable)/.test(String(e?.message))?
        'ChatGPT sharing allowance unavailable; check your ChatGPT usage.':
        'ChatGPT subscription inference failed. Review local diagnostic logs.';
      push({type:'error',reason:msg.stopReason,error:msg});
    }
  })();
  return stream;
}

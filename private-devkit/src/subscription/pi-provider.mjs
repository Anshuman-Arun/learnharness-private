/**
 * Plan-authenticated pi-ai provider registered into LearnHarness's ORIGINAL
 * model registry. No parallel agent loop, and no bearer credential in Next.
 *
 * The provider has a dynamic model list: the UI's GET /api/models refreshes
 * it through the Electron-owned capability broker. Missing desktop broker =
 * empty catalog. This is a fail-closed production-wiring increment, not
 * proof that the official DevKit supports tool-capable requests.
 */
import {createPiSubscriptionStream} from './pi-stream-bridge.mjs';
import {brokerInferenceEvents,brokerModels} from './loopback-client.mjs';

export const PLAN_PROVIDER_ID='chatgpt-plan';
const LEVEL_MAP={off:null,minimal:null,low:'low',medium:'medium',high:'high',xhigh:'xhigh',max:null};
const NO_COST={input:0,output:0,cacheRead:0,cacheWrite:0};
function planModel(m){
  if(!m || typeof m.slug!=='string'|| !/^[a-zA-Z0-9_.-]{1,120}$/.test(m.slug))
    throw new Error('Invalid ChatGPT model identifier');
  return {
    id:m.slug,name:typeof m.displayName==='string' && m.displayName.trim()?m.displayName:m.slug,
    provider:PLAN_PROVIDER_ID,api:'openai-responses',baseUrl:'http://127.0.0.1',
    input:['text','image'],reasoning:true,thinkingLevelMap:LEVEL_MAP,
    cost:NO_COST,
    // pi-ai's existing UI requires numeric context limits; these are
    // conservative application placeholders, NOT official per-model limits.
    contextWindow:32_768,maxTokens:4_096,
  };
}
export function hasDesktopPlanBroker(env=process.env){
  const p=Number(env.LH_SUBSCRIPTION_BROKER_PORT);
  return Number.isInteger(p)&&p>0&&p<=65535&&typeof env.LH_SUBSCRIPTION_BROKER_SECRET==='string'&&env.LH_SUBSCRIPTION_BROKER_SECRET.length>=32;
}
/**
 * @param {object} hooks
 * @param {Function} hooks.makeEventStream pi-ai's createAssistantMessageEventStream
 * @param {Function} [hooks.getModels] capability broker account model list
 * @param {Function} [hooks.requestEvents] capability broker event stream
 */
export function createPlanProvider({makeEventStream,getModels=brokerModels,requestEvents=brokerInferenceEvents,env=process.env}={}){
  if(typeof makeEventStream!=='function')throw new Error('pi-ai event stream constructor required');
  let available=[];
  let connected=false;
  const sync=async()=>{
    // In browser/dev mode, no fake "available" models or OAuth credentials.
    if(!hasDesktopPlanBroker(env)){available=[];connected=false;return [];}
    try{
      const catalog=await getModels({env});
      if(!Array.isArray(catalog))throw new Error('Invalid model list');
      const unique=new Set();
      available=catalog.map(planModel).filter(m=>{
        if(unique.has(m.id))return false;
        unique.add(m.id);return true;
      });
      connected=true;
      return [...available];
    }catch{
      available=[];connected=false;
      // Never retain a stale entitlement or expose an upstream auth error.
      return [];
    }
  };
  const streamSimple=(model,context,options={})=>createPiSubscriptionStream(model,context,options,{
    makeEventStream,requestEvents:(body,{signal}={})=>requestEvents(body,{env,signal})
  });
  const provider={
    id:PLAN_PROVIDER_ID,name:'ChatGPT Subscription (Private)',
    baseUrl:'http://127.0.0.1',
    auth:{apiKey:{name:'ChatGPT desktop sign-in',
      async resolve(){
        // pi's model collection requires ProviderAuth to check a provider.
        // This is a non-secret sentinel; Electron broker authenticates EACH
        // request and checks the actual ChatGPT subscription. Never derive a
        // fake OAuth token or copy one into the child process.
        return hasDesktopPlanBroker(env)&&connected?
          {auth:{apiKey:'desktop-broker'},source:'ChatGPT desktop authorization'}:undefined;
      }}},
    getModels(){return available;},
    stream:streamSimple,
    streamSimple,
    syncModels:sync,
  };
  return provider;
}

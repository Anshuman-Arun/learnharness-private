/** Next child client for the trusted Electron-owned subscription broker.
 * Only the per-launch capability crosses processes, NEVER the OAuth token.
 * This module is server-only; importing into a renderer would be a serious
 * security error. No automatic cross-origin redirects are accepted.
 */
import {parseSse,buildSubscriptionRequest} from './response-protocol.mjs';

function readConfig(env) {
  const port=Number(env.LH_SUBSCRIPTION_BROKER_PORT);
  const capability=env.LH_SUBSCRIPTION_BROKER_SECRET;
  if (!Number.isSafeInteger(port) || port<1 || port>65535 || typeof capability!=='string' || capability.length<32) {
    throw new Error('ChatGPT subscription requires the private Electron desktop broker');
  }
  return {port,capability};
}
export async function brokerRequest(route,body, {env=process.env,signal,fetchImpl=fetch}={}) {
  if (!['/session','/models','/infer'].includes(route)) throw new Error('Unsupported subscription broker operation');
  const {port,capability}=readConfig(env);
  const response=await fetchImpl(`http://127.0.0.1:${port}${route}`,{
    method:'POST',
    headers:{Authorization:`Bearer ${capability}`,'Content-Type':'application/json'},
    body:JSON.stringify(body),redirect:'error',signal
  });
  if (!response.ok) {
    // NEVER echo arbitrary body; it could contain sensitive diagnostics.
    throw new Error(`ChatGPT desktop subscription bridge unavailable (HTTP ${response.status})`);
  }
  return response;
}
export async function brokerModels(opts={}) {
  const response=await brokerRequest('/models',{},opts);
  const value=await response.json();
  if (!Array.isArray(value)) throw new Error('Invalid account model catalog');
  return value;
}
export async function brokerSession(opts={}) {
  const response=await brokerRequest('/session',{},opts);
  const value=await response.json();
  if (!value || typeof value!=='object' || !['connected','disconnected','connecting','reauth_required'].includes(value.status))
    throw new Error('Invalid subscription session state');
  return value;
}
export async function* brokerInferenceEvents(body,opts={}) {
  const payload=buildSubscriptionRequest(body);
  const response=await brokerRequest('/infer',payload,opts);
  const ct=response.headers?.get('content-type')?.split(';')[0]?.trim()?.toLowerCase();
  if(ct && ct!=='text/event-stream')throw new Error('Invalid broker event stream');
  if(!response.body)throw new Error('Missing broker event stream');
  let completed=false;
  for await (const event of parseSse(response.body)) {
    if(event.type==='error'||event.type==='response.failed'||event.type==='response.incomplete') throw new Error('ChatGPT subscription stream failed');
    if(event.type==='response.completed')completed=true;
    yield event;
  }
  if(!completed)throw new Error('Incomplete subscription response');
}

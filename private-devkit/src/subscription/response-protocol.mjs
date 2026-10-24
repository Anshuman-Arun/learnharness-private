/**
 * Standalone, dependency-free protocol proof for official Sign in with ChatGPT
 * HTTP Responses flow. Deliberately NOT wired into pi-agent-core yet.
 * Credentials MUST come from an official local OAuth credential manager.
 * Do not use browser cookies, ChatGPT backend-api endpoints, or API keys.
 */
const URL = 'https://api.openai.com/v1/responses';
const FORBIDDEN = [
  'background','conversation','max_output_tokens','max_tool_calls',
  'metadata','moderation','multi_agent','prompt','prompt_cache_retention',
  'safety_identifier','temperature','top_logprobs','top_p','truncation',
  'user','previous_response_id'
];
const fail = message => {throw new Error(message)};

export function buildSubscriptionRequest({model,input,instructions,reasoning,tools} = {}) {
  if (!model || typeof model !== 'string') fail('Select a model from the connected account catalog');
  if (!Array.isArray(input)) fail('Full persisted conversation history is required in input[]');
  if (input.some(item => item?.role === 'system')) fail('Explicit system-role items not accepted: use instructions');
  if (tools !== undefined && (!Array.isArray(tools) || tools.some(t => t.type !== 'namespace'))) {
    fail('The proof adapter currently accepts only non-deferred local-tool namespaces');
  }
  const body = {model,input,store:false,stream:true};
  if (instructions !== undefined) {
    if (typeof instructions !== 'string') fail('instructions must be a string');
    body.instructions = instructions;
  }
  if (reasoning !== undefined) {
    if (typeof reasoning !== 'object' || reasoning === null || Array.isArray(reasoning)) fail('Invalid reasoning object');
    body.reasoning = reasoning;
  }
  if (tools?.length) body.tools = tools;
  // Defense against accidental spread of unsupported API-only options.
  for (const key of FORBIDDEN) if (key in body) fail(`Unsupported subscription field: ${key}`);
  return body;
}

export function localFunctionNamespace(name, entries) {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) fail('Invalid namespace');
  if (!Array.isArray(entries) || entries.length === 0) fail('Namespace must have functions');
  if (entries.some(x=>!x?.name || !x?.description || !x?.parameters)) fail('Each function needs name, description, parameters');
  return {type:'namespace',name,description:`Local ${name} tools`,tools:entries.map(x=>({
    type:'function',name:x.name,description:x.description,parameters:x.parameters,
    ...(x.strict!==undefined ? {strict:!!x.strict} : {})
  }))};
}

export function functionResult(call, value) {
  if (call?.type !== 'function_call' || !call.call_id) fail('Expected a saved function_call item with call_id');
  return {type:'function_call_output',call_id:call.call_id,output:typeof value==='string'?value:JSON.stringify(value)};
}

/**
 * Parse SSE robustly across chunk boundaries and CRLF, including multiline
 * data. Caller handles response events, not this parser.
 */
export async function* parseSse(stream) {
  if (!stream?.getReader) fail('Expected WHATWG readable stream');
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = '';
  try {
    while (true) {
      const {value,done} = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value,{stream:true});
      buffer = buffer.replace(/\r\n/g, '\n');
      let pos;
      while ((pos = buffer.indexOf('\n\n')) !== -1) {
        const frame=buffer.slice(0,pos);
        buffer=buffer.slice(pos+2);
        const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
        if (!data || data==='[DONE]') continue;
        let item;
        try {item=JSON.parse(data);} catch {throw new Error('Malformed SSE response event');}
        yield item;
      }
      if (done) break;
    }
    if (buffer.trim()) fail('Incomplete SSE frame at end of stream');
  } finally {reader.releaseLock();}
}

/**
 * Yield raw Responses events while validating terminal conditions.
 * Tool call events and reasoning events remain available to the caller.
 * Never logs the bearer token or returns it to the renderer.
 */
export async function* requestSubscriptionEvents({getAccessToken,model,input,instructions,reasoning,tools,signal,fetchImpl=fetch}) {
  if (typeof getAccessToken !== 'function') fail('Official OAuth access-token provider required');
  const token=await getAccessToken();
  if (!token || typeof token !== 'string') fail('Not signed in with ChatGPT');
  const payload=buildSubscriptionRequest({model,input,instructions,reasoning,tools});
  const response=await fetchImpl(URL,{
    method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(payload),signal,redirect:'error'
  });
  if (!response.ok) throw new Error(`ChatGPT plan inference HTTP ${response.status}; sign in or inspect usage limits`);
  const contentType = response.headers?.get?.('content-type')?.split(';')[0]?.trim()?.toLowerCase();
  if (contentType && contentType !== 'text/event-stream') throw new Error('ChatGPT plan inference did not return an SSE stream');
  if (!response.body) throw new Error('ChatGPT plan inference returned no response stream');
  let completed=false;
  for await (const event of parseSse(response.body)) {
    if (event.type==='response.failed') {
      const code=event.response?.error?.code||'unknown_error';
      throw new Error(`Subscription response failed: ${code}`);
    }
    if (event.type==='response.incomplete') throw new Error('Subscription response incomplete');
    if (event.type==='error') throw new Error(`Subscription stream error: ${event.code||'unknown'}`);
    if (event.type==='response.completed') completed=true;
    yield event;
  }
  if (!completed) throw new Error('Streaming response ended without response.completed');
}

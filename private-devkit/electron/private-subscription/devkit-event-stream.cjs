/**
 * Adapts the locally patched official @siwc/local method to a bounded
 * AsyncIterable of Responses events. No access/refresh credential crosses
 * this boundary: authenticated() lives INSIDE the official DevKit.
 *
 * The next server sends the model request to the Electron-owned broker;
 * Electron calls this adapter with the public DevKit client object.
 */
'use strict';

const MAX_QUEUED_EVENTS = 128;

function assertStructuredRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid structured inference request');
  const fields = new Set(['model', 'input', 'instructions', 'reasoning', 'tools', 'stream', 'store']);
  if (Object.keys(request).some(key => !fields.has(key))) throw new Error('Unsupported structured inference field');
  if (typeof request.model !== 'string' || !request.model.trim() || request.model.length > 128) throw new Error('Invalid model');
  if (!Array.isArray(request.input) || request.input.length > 10000) throw new Error('Invalid conversation history');
  if (request.stream !== true || request.store !== false) throw new Error('Subscription requests must stream without storage');
  if (request.instructions !== undefined && typeof request.instructions !== 'string') throw new Error('Invalid instructions');
  if (request.reasoning !== undefined && (
    !request.reasoning || typeof request.reasoning !== 'object' || Array.isArray(request.reasoning) ||
    !['minimal','low','medium','high','xhigh'].includes(request.reasoning.effort) ||
    Object.keys(request.reasoning).some(key => key !== 'effort')
  )) throw new Error('Unsupported reasoning level');
  if (request.tools !== undefined && (!Array.isArray(request.tools) || request.tools.some(tool =>
    tool?.type !== 'namespace' || typeof tool.name !== 'string' || !Array.isArray(tool.tools) ||
    tool.tools.some(fn => fn?.type !== 'function' || typeof fn.name !== 'string' || !fn.parameters)
  ))) throw new Error('Only local function namespaces are supported');
  return {model:request.model,input:request.input,
    ...(request.instructions !== undefined ? {instructions:request.instructions}:{}),
    ...(request.reasoning !== undefined ? {reasoning:request.reasoning}:{}),
    ...(request.tools !== undefined ? {tools:request.tools}:{})};
}

/** The SDK method is deliberately not a token getter. It manages refresh. */
async function* streamDevKitEvents(client, request, {signal} = {}) {
  if (typeof client?.streamStructuredEvents !== 'function')
    throw new Error('DevKit tool-stream extension not installed');
  const body = assertStructuredRequest(request);
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason ?? new Error('Caller cancelled'));
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort',abort,{once:true});
  const queue = [];
  let settled = false;
  let failure;
  let wake;
  const notify = () => {if(wake){const f=wake;wake=undefined;f();}};
  const onEvent = event => {
    if (controller.signal.aborted) throw new Error('Structured response cancelled');
    if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string')
      throw new Error('Invalid structured event');
    if (queue.length >= MAX_QUEUED_EVENTS) throw new Error('Structured event consumer too slow');
    queue.push(event);
    notify();
  };
  const worker = Promise.resolve().then(() => client.streamStructuredEvents({...body,signal:controller.signal,onEvent}));
  // Handle errors immediately to avoid an unhandled rejection when the
  // consumer is slow or disconnects between frames.
  const finished = worker.then(()=>{settled=true;notify();},err=>{failure=err;settled=true;notify();});
  try {
    while (!settled || queue.length > 0) {
      if (!queue.length) {
        await new Promise(resolve => {wake=resolve;});
        continue;
      }
      yield queue.shift();
    }
    if (failure) throw failure;
  } finally {
    controller.abort(new Error('Structured event consumer finished'));
    signal?.removeEventListener('abort',abort);
    await finished;
  }
}

module.exports={streamDevKitEvents,assertStructuredRequest};

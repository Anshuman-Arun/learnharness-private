/**
 * Electron MAIN <-> standalone Next CHILD model-inference capability bridge.
 *
 * No ChatGPT OAuth tokens ever transit this bridge. The Electron main process
 * owns account selection, refresh and all upstream model requests. A random
 * per-launch capability is shared ONLY with the child process environment.
 * This local RPC endpoint is not an authentication or login implementation.
 *
 * The service must implement:
 *   session() -> renderer-safe session status object
 *   models()  -> array of available model descriptors
 *   infer(request, { signal }) -> AsyncIterable of raw Responses events
 *
 * Requests are bounded, authenticated, POST-only, and accepted exclusively
 * on 127.0.0.1. The service is never allowed to return OAuth credentials.
 */
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { URL } = require('node:url');

const MAX_REQUEST_BYTES = 24 * 1024 * 1024; // images can be large
const MAX_EVENT_BYTES = 16 * 1024 * 1024;
const MAX_ACTIVE_REQUESTS = 2;
const MAX_QUEUED_REQUESTS = 8;
const MAX_INFERENCE_MS = 3 * 60 * 1000;
const DEFAULT_ERROR = 'Subscription service unavailable';

function safelyEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function sendJson(res, code, value) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
async function bodyJson(req, signal) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    signal.throwIfAborted();
    bytes += chunk.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      const e = new Error('request_too_large'); e.statusCode = 413; throw e;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); }
  catch { const e = new Error('invalid_json'); e.statusCode = 400; throw e; }
}
function validateInput(route, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (route === '/session' || route === '/models') return Object.keys(data).length === 0;
  // The parent service performs the complete subscription request validation
  // via buildSubscriptionRequest immediately before dispatching upstream.
  return route === '/infer' && typeof data.model === 'string' && data.model.length <= 128 && Array.isArray(data.input) && data.input.length <= 10000;
}

async function startSubscriptionBroker({service, port = 0, host = '127.0.0.1', secret = crypto.randomBytes(32).toString('base64url'), maxActive = MAX_ACTIVE_REQUESTS, maxQueued = MAX_QUEUED_REQUESTS} = {}) {
  if (host !== '127.0.0.1') throw new Error('Subscription broker must bind only to IPv4 loopback');
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Broker capability must have at least 32 characters');
  if (!service || typeof service.session !== 'function' || typeof service.models !== 'function' || typeof service.infer !== 'function') throw new Error('Trusted subscription service required');
  const permitted = new Set(['/session', '/models', '/infer']);
  const controllers = new Set();
  let active = 0;
  let queued = 0;
  const waiters = [];
  const acquire = (signal) => {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (active < maxActive && waiters.length === 0) { active++; return Promise.resolve(); }
    if (queued >= maxQueued) { const e = new Error('busy'); e.statusCode = 429; return Promise.reject(e); }
    queued++;
    return new Promise((resolve, reject) => {
      const node = {done:false, start() { if (node.done) return; node.done = true; queued--; signal.removeEventListener('abort', abort); active++; resolve(); }};
      const abort = () => {if(node.done)return; node.done=true; queued--; waiters.splice(waiters.indexOf(node),1); reject(signal.reason);};
      signal.addEventListener('abort', abort, {once:true});
      waiters.push(node);
    });
  };
  const release = () => {
    active--;
    while (waiters.length) {const next = waiters.shift();if (!next.done) {next.start();break;}}
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // RemoteAddress is checked even though listen() is bound to loopback.
    if (req.socket.remoteAddress !== '127.0.0.1') return sendJson(res,403,{error:'forbidden'});
    const hostHeader = req.headers.host;
    // Host name and port are verified once server.listen finishes below.
    const expectedHost = `127.0.0.1:${server.address().port}`;
    if (hostHeader !== expectedHost) return sendJson(res,403,{error:'invalid_host'});
    if (req.headers.origin !== undefined) return sendJson(res,403,{error:'origin_not_allowed'});
    if (!safelyEqual(req.headers.authorization, `Bearer ${secret}`)) return sendJson(res,401,{error:'unauthorized'});
    if (req.method !== 'POST') return sendJson(res,405,{error:'method_not_allowed'});
    const route = new URL(req.url,'http://127.0.0.1').pathname;
    if (!permitted.has(route)) return sendJson(res,404,{error:'not_found'});
    if (req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return sendJson(res,415,{error:'unsupported_content_type'});
    const ac = new AbortController();
    controllers.add(ac);
    const onDisconnect = () => ac.abort(new Error('client_disconnected'));
    res.once('close', onDisconnect);
    const timer = setTimeout(() => ac.abort(new Error('deadline_exceeded')), MAX_INFERENCE_MS);
    timer.unref();
    let acquired = false;
    try {
      const data = await bodyJson(req, ac.signal);
      if (!validateInput(route, data)) return sendJson(res,400,{error:'invalid_request'});
      await acquire(ac.signal);
      acquired = true;
      if (route === '/session') return sendJson(res,200, await service.session());
      if (route === '/models') return sendJson(res,200, await service.models());
      const events = await service.infer(data,{signal:ac.signal});
      if (!events || typeof events[Symbol.asyncIterator] !== 'function') throw new Error('inference_backend_invalid');
      res.writeHead(200, { 'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-store', 'X-Accel-Buffering':'no', 'X-Content-Type-Options':'nosniff' });
      for await (const event of events) {
        ac.signal.throwIfAborted();
        const data = JSON.stringify(event);
        if (data.length > MAX_EVENT_BYTES) throw new Error('inference_event_too_large');
        if (!res.write(`data: ${data}\n\n`)) await once(res,'drain', {signal:ac.signal});
      }
      if (!res.writableEnded) res.end();
    } catch(err) {
      if (!res.headersSent) sendJson(res, err.statusCode ?? 503, {error:err.statusCode === 400?'invalid_request':err.statusCode === 413?'request_too_large':err.statusCode === 429?'busy':DEFAULT_ERROR});
      else if (!res.destroyed) {
        res.write('data: {"type":"error","code":"broker_stream_failed"}\n\n');
        res.end();
      }
    } finally {
      if (acquired) release();
      controllers.delete(ac);
      clearTimeout(timer);
      res.off('close', onDisconnect);
    }
  });
  await new Promise((resolve, reject) => {server.once('error',reject);server.listen(port,host,resolve);});
  return {
    port:server.address().port,
    secret,
    host,
    async close() {
      for (const controller of controllers) controller.abort(new Error('broker_shutting_down'));
      // closeAllConnections unblocks stuck requests during app exit.
      server.closeAllConnections();
      await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    }
  };
}
module.exports = { startSubscriptionBroker };

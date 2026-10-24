/**
 * PRIVATE NONCOMMERCIAL EXTENSION for the official Sign in with ChatGPT DevKit.
 * This file is installed INTO packages/local/src of a separate DevKit checkout.
 * It is NOT a replacement OAuth flow, and does not expose credentials.
 *
 * Invoke only from Electron's trusted main process using the public
 * createChatGPT().streamStructuredEvents method added by our patcher.
 */
import OpenAI from 'openai';
import { apiError, ChatGPTError, isObject } from './errors.js';
import type { StructuredStreamOptions } from './types.js';

/**
 * The SDK's own authenticated() wraps this function, guaranteeing account
 * selection, token refresh, rotation persistence and cancellation semantics.
 */
export async function streamStructuredEvents(accessToken: string, options: StructuredStreamOptions, signal: AbortSignal): Promise<void> {
  if (typeof options.model !== 'string' || !options.model.trim() || options.model.length > 128 ||
      !Array.isArray(options.input) || options.input.length > 10000 || typeof options.onEvent !== 'function') {
    throw new ChatGPTError('invalid_request', 'Provide a model, complete input array, and event callback.');
  }
  if (options.instructions !== undefined && typeof options.instructions !== 'string') {
    throw new ChatGPTError('invalid_request', 'Invalid instructions.');
  }
  if (options.reasoning !== undefined && (
    !options.reasoning || !['minimal','low','medium','high','xhigh'].includes(options.reasoning.effort) ||
    Object.keys(options.reasoning).some(key => key !== 'effort')
  )) throw new ChatGPTError('invalid_request', 'Unsupported reasoning effort.');
  if (options.tools !== undefined && (!Array.isArray(options.tools) || options.tools.some(tool =>
    !isObject(tool) || tool.type !== 'namespace' || !Array.isArray(tool.tools)
  ))) throw new ChatGPTError('invalid_request', 'Only local function namespaces are supported.');
  if (options.input.some(item => isObject(item) && item.role === 'system')) {
    throw new ChatGPTError('invalid_request', 'Use instructions instead of system-role items.');
  }

  const client = new OpenAI({
    apiKey: accessToken,
    baseURL: 'https://api.openai.com/v1',
    organization: null,
    project: null,
    logLevel: 'warn',
    maxRetries: 0,
    fetchOptions: { redirect: 'error' },
    defaultHeaders: {
      authorization: `Bearer ${accessToken}`,
      'openai-organization': null,
      'openai-project': null,
    },
  });
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(180_000)]);
  let completed = false;
  let seenTerminal = false;
  try {
    // Full conversation history; previous_response_id and unsupported params
    // intentionally absent. SDK typing may lag preview-only namespace items.
    const body = {
      model: options.model, input: options.input,
      ...(options.instructions !== undefined ? {instructions:options.instructions}:{}),
      ...(options.reasoning !== undefined ? {reasoning:options.reasoning}:{}),
      ...(options.tools !== undefined ? {tools:options.tools}:{}),
      store: false as const,
      stream: true as const,
    };
    const result = await client.responses.create({
      ...body,
      input: body.input as any,
      ...(body.tools !== undefined ? { tools: body.tools as any } : {}),
    }, {
      signal: requestSignal, headers: { accept: 'text/event-stream' },
    }).withResponse();
    const contentType = result.response.headers.get('content-type')?.split(';',1)[0]?.trim().toLowerCase();
    if (!result.response.body || (contentType && contentType !== 'text/event-stream')) {
      await result.response.body?.cancel();
      throw new ChatGPTError('invalid_stream', 'Expected an SSE stream from the ChatGPT plan.', true);
    }
    for await (const event of result.data) {
      requestSignal.throwIfAborted();
      if (!isObject(event)) continue;
      if (event.type === 'response.failed' || event.type === 'error') {
        throw apiError(event.type === 'response.failed' ? event.response : event, result.response.status, result.request_id);
      }
      if (event.type === 'response.incomplete') {
        throw new ChatGPTError('response_incomplete', 'ChatGPT returned an incomplete response.', true);
      }
      if (event.type === 'response.completed') {
        if (seenTerminal) throw new ChatGPTError('invalid_stream', 'Duplicate terminal response.');
        completed = true;
        seenTerminal = true;
      }
      // Raw structured events are delivered only inside Electron main;
      // no tokens are attached. The broker enforces frame-size limits.
      options.onEvent(event);
      if (completed) break;
    }
    requestSignal.throwIfAborted();
    if (!completed) throw new ChatGPTError('stream_interrupted', 'ChatGPT stopped before response.completed.', true);
  } catch (error) {
    if (signal.aborted) throw new ChatGPTError('cancelled', 'ChatGPT request cancelled.');
    if (error instanceof ChatGPTError) throw error;
    if (error instanceof OpenAI.APIError && !(error instanceof OpenAI.APIConnectionError) && !(error instanceof OpenAI.APIUserAbortError)) {
      const detail = typeof error.error === 'string' ? {error:error.error} : error.error;
      throw apiError(detail, error.status, error.requestID);
    }
    // Do not include model input, access tokens, response payloads or headers
    // in diagnostics. The official SDK's renderer must remain credential-free.
    throw new ChatGPTError('stream_interrupted','ChatGPT tool stream failed; retry the request.',true);
  }
}

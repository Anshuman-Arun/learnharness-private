/**
 * LearnHarness native pi-ai messages -> subscription-compatible Responses
 * history.  This is a tested codec, NOT a connected pi-ai StreamFunction.
 *
 * LearnHarness already flattens its custom markers and compaction through
 * toLlmMessages() in src/core/native-messages.ts. The codec accepts the
 * resulting native pi Message[] and strips SDK-only stamps and record ids.
 * HTTP has no previous_response_id: reconstruct the complete history.
 */
const invalid = message => {throw new Error(`Cannot serialize LearnHarness history: ${message}`)};

function partsForUser(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) invalid('user content must be text or content blocks');
  const parts = [];
  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string') {
      parts.push({type:'input_text',text:part.text});
    } else if (part?.type === 'image' && typeof part.data === 'string' && /^image\//.test(part.mimeType||'')) {
      // Responses accepts data URLs as image_url for image inputs.
      parts.push({type:'input_image',image_url:`data:${part.mimeType};base64,${part.data}`});
    } else {
      invalid(`unsupported user content block: ${String(part?.type)}`);
    }
  }
  return parts;
}

function textForToolResult(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) invalid('tool result must have content blocks');
  const out=[];
  for (const part of content) {
    if (part?.type !== 'text' || typeof part.text !== 'string')
      invalid(`unsupported tool result block: ${String(part?.type)}`);
    out.push(part.text);
  }
  return out.join('\n');
}

/**
 * @returns {{instructions?:string,input:Array,unreplayedReasoningBlocks:number}}
 * Reasoning blocks cannot be reconstructed as encrypted reasoning state;
 * only the model-visible assistant output and tool history is replayed.
 */
export function toSubscriptionHistory(messages) {
  if (!Array.isArray(messages)) invalid('expected native pi Message[]');
  const input=[];
  const system=[];
  let unreplayedReasoningBlocks = 0;
  for (const msg of messages) {
    if (!msg || typeof msg.role !== 'string') invalid('missing message role');
    if (msg.role === 'system') {
      if (typeof msg.content !== 'string') invalid('system prompt must be text');
      system.push(msg.content);
      continue;
    }
    if (msg.role === 'user') {
      input.push({role:'user',content:partsForUser(msg.content)});
      continue;
    }
    if (msg.role === 'assistant') {
      if (!Array.isArray(msg.content)) invalid('assistant content must be blocks');
      let buffer='';
      const flush=()=>{if(buffer){input.push({role:'assistant',content:buffer});buffer='';}};
      for (const part of msg.content) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          buffer += part.text;
        } else if (part?.type === 'thinking') {
          // Plaintext thinking is not a valid stand-in for encrypted
          // reasoning context. Do not expose private reasoning or
          // synthesize reasoning items when replaying saved history.
          unreplayedReasoningBlocks++;
        } else if (part?.type === 'toolCall' && typeof part.id === 'string' && typeof part.name === 'string') {
          flush();
          input.push({type:'function_call',call_id:part.id,name:part.name,arguments:JSON.stringify(part.arguments??{}),
            ...(part.namespace ? {namespace:part.namespace} : {})});
        } else invalid(`unsupported assistant content block: ${String(part?.type)}`);
      }
      flush();
      continue;
    }
    if (msg.role === 'toolResult') {
      if (typeof msg.toolCallId !== 'string') invalid('missing tool result call ID');
      input.push({type:'function_call_output',call_id:msg.toolCallId,output:textForToolResult(msg.content)});
      continue;
    }
    // LearnHarness calls toLlmMessages BEFORE requesting inference; if
    // this branch is hit, a marker was not converted and may change intent.
    invalid(`unexpected role ${msg.role}; call toLlmMessages first`);
  }
  return {
    ...(system.length ? {instructions:system.join('\n\n')} : {}),
    input,
    unreplayedReasoningBlocks
  };
}

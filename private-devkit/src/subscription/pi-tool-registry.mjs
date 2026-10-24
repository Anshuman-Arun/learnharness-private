/**
 * Translate pi-ai's normalized transcript's system tool declarations to
 * subscription-compatible (non-deferred, local) namespace tools.
 *
 * IMPORTANT: pi's tools are declarations embedded in system messages, not
 * a context.tools array. Dropping them disables the whole learning harness.
 */
const TOOL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

function messageText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every(x => x?.type === 'text')) {
    return value.map(x => x.text ?? '').join('\n');
  }
  throw new Error('Unsupported pi system content; cannot silently lose instructions');
}

export function projectPiSystem(messages) {
  if (!Array.isArray(messages)) throw new Error('Expected pi normalized transcript messages');
  const chunks = [];
  const sections = new Map();
  const tools = new Map();
  const nonSystem = [];
  for (const msg of messages) {
    if (msg?.role !== 'system') {
      nonSystem.push(msg);
      continue;
    }
    if (msg.content) chunks.push(messageText(msg.content));
    for (const [name,value] of Object.entries(msg.sections ?? {})) {
      if (value === null) sections.delete(name);
      else if (typeof value === 'string') sections.set(name, value);
      else throw new Error(`Invalid prompt section ${name}`);
    }
    for (const tool of msg.toolsRemoved ?? []) tools.delete(tool.name);
    for (const tool of msg.toolsAdded ?? []) {
      if (!TOOL_NAME.test(tool.name)) throw new Error(`Cannot use local tool name: ${tool.name}`);
      tools.set(tool.name,tool);
    }
  }
  return {
    instructions: [...chunks, ...sections.values()].filter(Boolean).join('\n\n'),
    tools: [...tools.values()],
    messages: nonSystem
  };
}

export function namespaceForPiTools(tools, namespace = 'learnharness') {
  if (!Array.isArray(tools)) throw new Error('Expected array of pi tool declarations');
  if (!tools.length) return undefined;
  if (!TOOL_NAME.test(namespace)) throw new Error('Invalid local tool namespace');
  const seen = new Set();
  return {
    type:'namespace',name:namespace,description:'LearnHarness local learning tools',
    tools:tools.map(tool => {
      if (!TOOL_NAME.test(tool?.name) || seen.has(tool.name)) throw new Error(`Invalid/duplicate tool: ${tool?.name}`);
      seen.add(tool.name);
      if (typeof tool.description !== 'string' || !tool.parameters || typeof tool.parameters !== 'object') {
        throw new Error(`Invalid pi tool definition: ${tool.name}`);
      }
      // pi tools are TypeBox JSON schema declarations. Disabled constrained
      // grammars are not silently approximated: reject unsupported formats.
      if (tool.constrainedSampling && tool.constrainedSampling.type !== 'json_schema') {
        throw new Error(`Unsupported constrained tool schema: ${tool.name}`);
      }
      return {type:'function',name:tool.name,description:tool.description,
        parameters:JSON.parse(JSON.stringify(tool.parameters))};
    })
  };
}

/** Recover LearnHarness tool identity without trusting arbitrary namespaces. */
export function nativeToolName(call, namespace='learnharness') {
  if (call?.type !== 'function_call') throw new Error('Expected function call');
  if (call.namespace && call.namespace !== namespace) throw new Error(`Unrecognized tool namespace: ${call.namespace}`);
  let name = call.name;
  if (typeof name === 'string' && name.startsWith(`${namespace}.`)) name = name.slice(namespace.length+1);
  if (!TOOL_NAME.test(name ?? '')) throw new Error('Invalid tool invocation name');
  return name;
}

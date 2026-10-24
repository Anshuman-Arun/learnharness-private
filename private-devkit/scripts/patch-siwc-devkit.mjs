/**
 * Safely extend a separate, source-checked-out OpenAI DevKit for LOCAL
 * NONCOMMERCIAL use. No source of OpenAI's DevKit is bundled with this kit.
 *
 *   node scripts/patch-siwc-devkit.mjs /path/to/sign-in-with-chatgpt-devkit --dry-run
 *   node scripts/patch-siwc-devkit.mjs /path/to/sign-in-with-chatgpt-devkit
 *
 * Review OpenAI's noncommercial license before using a patched build.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const target=path.resolve(process.argv[2]??'.');
const dry=process.argv.includes('--dry-run');
const kit=path.dirname(fileURLToPath(import.meta.url));
const changes=new Map();
function ensure(test,message){if(!test)throw new Error(message)}
function read(name){return fs.readFileSync(path.join(target,name),'utf8').replace(/\r\n/g,'\n')}
function replaceOnce(str,needle,replacement,label){
  const count=str.split(needle).length-1;
  ensure(count===1,`${label}: expected one exact source anchor, found ${count}`);
  return str.replace(needle,replacement);
}
try{
  const root=JSON.parse(read('package.json'));
  const pkg=JSON.parse(read('packages/local/package.json'));
  ensure(root.private===true && pkg.name==='@siwc/local','Not the official DevKit source checkout');
  const extensionDest='packages/local/src/structured-events.ts';
  ensure(!fs.existsSync(path.join(target,extensionDest)),'Extension already present; will not overwrite');
  const originalTypes=read('packages/local/src/types.ts');
  let types=replaceOnce(originalTypes,'export interface StreamResponseOptions {',
`/** Tool-capable plan Responses events, usable only in a trusted local process.
 * Credentials remain inside the DevKit's authenticated() closure. */
export interface StructuredStreamOptions {
  model: string;
  input: unknown[];
  instructions?: string;
  reasoning?: { effort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' };
  tools?: unknown[];
  signal?: AbortSignal;
  onEvent: (event: unknown) => void;
}

export interface StreamResponseOptions {`,'SDK types');
  types=replaceOnce(types,'  streamResponse(options: StreamResponseOptions): Promise<{ text: string }>;','  streamResponse(options: StreamResponseOptions): Promise<{ text: string }>;\n  streamStructuredEvents(options: StructuredStreamOptions): Promise<void>;','SDK client interface');
  changes.set('packages/local/src/types.ts',types);
  let index=read('packages/local/src/index.ts');
  index=replaceOnce(index,'import { streamResponse } from "./responses.js";',
    'import { streamResponse } from "./responses.js";\nimport { streamStructuredEvents } from "./structured-events.js";','SDK index import');
  index=replaceOnce(index,'SignInOptions, StreamResponseOptions } from "./types.js";',
    'SignInOptions, StreamResponseOptions, StructuredStreamOptions } from "./types.js";','SDK index type exports');
  index=replaceOnce(index,
`    async streamResponse(options) {
      if (!options.model.trim()) throw new ChatGPTError("invalid_request", "Choose a model before starting a request.");
      return authenticated((accessToken, signal) => streamResponse(accessToken, options, signal), options.signal);
    },`,
`    async streamResponse(options) {
      if (!options.model.trim()) throw new ChatGPTError("invalid_request", "Choose a model before starting a request.");
      return authenticated((accessToken, signal) => streamResponse(accessToken, options, signal), options.signal);
    },

    // Only exposes structured inference events. Access/refresh tokens never
    // leave the SDK and refresh remains bound to the authenticated() lock.
    async streamStructuredEvents(options) {
      if (!options.model.trim()) throw new ChatGPTError("invalid_request", "Choose a model before starting a request.");
      return authenticated((accessToken, signal) => streamStructuredEvents(accessToken, options, signal), options.signal);
    },`, 'SDK authenticated method');
  changes.set('packages/local/src/index.ts',index);
  changes.set(extensionDest,fs.readFileSync(path.join(kit,'siwc-structured-extension.ts'),'utf8'));
  if(dry) console.log('DevKit extension preview:\n'+[...changes.keys()].join('\n'));
  else {
    for(const [p,data] of changes){const file=path.join(target,p);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data)}
    console.log('Patched DevKit source. Build using npm install && npm run build within that DevKit checkout.');
  }
}catch(e){console.error('DevKit not modified: '+e.message);process.exitCode=1}

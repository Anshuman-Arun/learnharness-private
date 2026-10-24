import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const script=path.resolve('scripts/patch-siwc-devkit.mjs');
function temporarySdk() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lh-siwc-fixture-'));
  const src=path.join(root,'packages','local','src');fs.mkdirSync(src,{recursive:true});
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({private:true,workspaces:['packages/*']}));
  fs.writeFileSync(path.join(root,'packages','local','package.json'),JSON.stringify({name:'@siwc/local'}));
  fs.writeFileSync(path.join(src,'types.ts'),`export interface StreamResponseOptions { model: string; }
export interface ChatGPTClient {
  streamResponse(options: StreamResponseOptions): Promise<{ text: string }>;
}\n`);
  fs.writeFileSync(path.join(src,'index.ts'),`import { streamResponse } from "./responses.js";
export type { ChatGPTClient, ChatGPTConfig, ChatGPTModel, CredentialEncryption, LoginProfile, ResponseInputMessage, SessionError, SessionIdentity, SessionState, SignInOptions, StreamResponseOptions } from "./types.js";
const client = {
    async streamResponse(options) {
      if (!options.model.trim()) throw new ChatGPTError("invalid_request", "Choose a model before starting a request.");
      return authenticated((accessToken, signal) => streamResponse(accessToken, options, signal), options.signal);
    },
};\n`);
  return root;
}

test('DevKit patcher dry-run leaves original source untouched',t=>{
  const root=temporarySdk();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const before=fs.readFileSync(path.join(root,'packages/local/src/types.ts'),'utf8');
  const output=execFileSync(process.execPath,[script,root,'--dry-run'],{encoding:'utf8'});
  assert.match(output,/structured-events.ts/);
  assert.equal(fs.readFileSync(path.join(root,'packages/local/src/types.ts'),'utf8'),before);
  assert.equal(fs.existsSync(path.join(root,'packages/local/src/structured-events.ts')),false);
});

test('DevKit patcher adds authenticated structured method and avoids repeated patching',t=>{
  const root=temporarySdk();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  execFileSync(process.execPath,[script,root]);
  const types=fs.readFileSync(path.join(root,'packages/local/src/types.ts'),'utf8');
  const index=fs.readFileSync(path.join(root,'packages/local/src/index.ts'),'utf8');
  const structured=fs.readFileSync(path.join(root,'packages/local/src/structured-events.ts'),'utf8');
  assert.match(types,/streamStructuredEvents\(options: StructuredStreamOptions\): Promise<void>/);
  assert.match(index,/authenticated\(\(accessToken, signal\) => streamStructuredEvents\(accessToken, options, signal\)/);
  assert.match(structured,/store: false as const/);
  assert.match(structured,/stream: true as const/);
  assert.doesNotMatch(structured,/previous_response_id\s*:/); // never part of request body
  assert.throws(()=>execFileSync(process.execPath,[script,root],{stdio:'pipe'}),/Command failed/);
});

test('DevKit patcher refuses upstream drift without partial changes',t=>{
  const root=temporarySdk();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const src=path.join(root,'packages/local/src');
  fs.writeFileSync(path.join(src,'index.ts'),'unexpected new sdk version');
  assert.throws(()=>execFileSync(process.execPath,[script,root],{stdio:'pipe'}),/Command failed/);
  assert.equal(fs.existsSync(path.join(src,'structured-events.ts')),false);
  assert.equal(fs.readFileSync(path.join(src,'types.ts'),'utf8').includes('StructuredStreamOptions'),false);
});

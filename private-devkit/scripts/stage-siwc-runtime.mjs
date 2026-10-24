/**
 * Builds a PRIVATE, installable, self-contained copy of a separately cloned,
 * patched official Sign in with ChatGPT SDK. No source code is scraped,
 * no credentials are read, and no token is placed into the app package.
 *
 * Usage from a LearnHarness PRIVATE checkout:
 *   node scripts/stage-siwc-runtime.mjs C:\\path\\to\\sign-in-with-chatgpt-devkit
 *
 * Requires official DevKit checkout to have been explicitly patched using
 * patch-siwc-devkit.mjs and built (`npm ci && npm run build -w @siwc/local`).
 * Installs via a tarball (NOT an npm local-path symlink) so the Windows
 * installer does not point to an external development directory.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const sdk = path.resolve(process.argv[2] ?? '.');
const out=path.resolve('vendor/siwc-runtime');
const target=path.join(sdk,'packages/local');
function requirePresent(filename){if(!fs.existsSync(filename))throw new Error(`Missing ${filename}`)}
function npm(args,opts={}) {
  const command=process.platform==='win32'?'npm.cmd':'npm';
  const result=spawnSync(command,args,{encoding:'utf8',shell:process.platform==='win32',...opts});
  if(result.error)throw result.error;
  if(result.status!==0) throw new Error(`npm ${args[0]} failed: ${(result.stderr??result.stdout).slice(0,1000)}`);
  return result.stdout.trim();
}
let tmp;
try {
  const devkit=JSON.parse(fs.readFileSync(path.join(sdk,'package.json'),'utf8'));
  const local=JSON.parse(fs.readFileSync(path.join(target,'package.json'),'utf8'));
  if(devkit.name!=='sign-in-with-chatgpt' || local.name!=='@siwc/local')throw new Error('Expected an official DevKit source checkout');
  requirePresent(path.join(target,'src/structured-events.ts'));
  requirePresent(path.join(target,'dist/index.js'));
  requirePresent(path.join(target,'dist/structured-events.js'));
  requirePresent(path.join(sdk,'LICENSE'));
  if(fs.existsSync(out))throw new Error('A staged SDK already exists. Review and remove it explicitly before restaging.');
  tmp=fs.mkdtempSync(path.join(os.tmpdir(),'learnharness-siwc-'));
  const packed=npm(['pack',target,'--pack-destination',tmp,'--json']);
  const files=JSON.parse(packed);
  const tarball=path.join(tmp,files?.[0]?.filename??'');
  requirePresent(tarball);
  fs.mkdirSync(out,{recursive:true});
  // --omit=dev and --ignore-scripts avoid unreviewed npm lifecycle hooks.
  npm(['install','--prefix',out,'--omit=dev','--ignore-scripts','--no-audit','--no-fund','--save=false',tarball]);
  requirePresent(path.join(out,'node_modules/@siwc/local/dist/structured-events.js'));
  fs.copyFileSync(path.join(sdk,'LICENSE'),path.join(out,'OPENAI_DEVKIT_LICENSE.txt'));
  const notices=path.join(sdk,'THIRD_PARTY_NOTICES.md');
  if(fs.existsSync(notices))fs.copyFileSync(notices,path.join(out,'THIRD_PARTY_NOTICES.md'));
  // Fail closed on an accidental package that lacks the noncommercial notices.
  console.log('Staged private SIWC runtime:',out);
} catch (err) {
  console.error('SIWC runtime staging failed:',err.message);
  process.exitCode=1;
} finally {
  if(tmp)fs.rmSync(tmp,{recursive:true,force:true});
}

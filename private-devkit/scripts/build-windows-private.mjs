/** Never publish: native Windows build of private derivative. */
import { spawnSync } from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {addSiwcResources} from './private-electron-builder-config.mjs';
import {join} from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
if (process.platform !== 'win32') throw new Error('Run on Windows x64; do not cross-build the bundled server');
if (!existsSync(join('vendor','siwc-runtime','node_modules','@siwc','local','dist','structured-events.js')))
  throw new Error('Run stage-siwc-runtime.mjs with a built, patched DevKit checkout first.');
function run(command,args) {
  console.log('>',command,args.join(' '));
  const p = spawnSync(command,args,{stdio:'inherit',env:process.env});
  if(p.error) throw p.error;
  if(p.status!==0) throw new Error(`${command} failed with exit status ${p.status}`);
}
run(process.execPath,[require.resolve('next/dist/bin/next'),'build']);
run(process.execPath,['scripts/build-server.mjs']);
run(process.execPath,['scripts/smoke-server.mjs','--electron']);
// Generate a temporary config. The standard upstream-independent installer
// can still be built without a DevKit, but this private installer MUST include
// the reviewed, staged SDK inside resources/siwc-runtime.
const generated='.private-electron-builder.generated.yml';
if(existsSync(generated))throw new Error('Refusing to overwrite generated private config');
const original=readFileSync('electron-builder.yml','utf8');
writeFileSync(generated,addSiwcResources(original));
const npx = 'npx.cmd';
// Avoid command injection (fixed arguments), and prevent ANY publish path.
try {
  const p = spawnSync(npx,['--no-install','electron-builder','--config',generated,'--win','--x64','--publish','never'],
    {stdio:'inherit',env:process.env,shell:true});
  if (p.error) throw p.error;
  if (p.status!==0) throw new Error(`electron-builder failed: ${p.status}`);
} finally {
  rmSync(generated,{force:true});
}

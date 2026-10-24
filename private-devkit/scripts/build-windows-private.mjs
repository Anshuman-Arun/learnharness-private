/** Never publish: native Windows build of private derivative. */
import { spawnSync } from 'node:child_process';
import {existsSync} from 'node:fs';
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
const npx = 'npx.cmd';
// Avoid command injection (fixed arguments), and prevent ANY publish path.
const p = spawnSync(npx,['--no-install','electron-builder','--win','--x64','--publish','never'],
  {stdio:'inherit',env:process.env,shell:true});
if (p.error) throw p.error;
if (p.status!==0) throw new Error(`electron-builder failed: ${p.status}`);

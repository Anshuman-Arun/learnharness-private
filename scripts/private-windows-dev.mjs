/**
 * The trusted Electron process owns the Next.js dev child, so the latter
 * receives the per-launch broker capability only through inherited env.
 * Running 'next dev' separately would sever the authentication bridge.
 */
import { spawn } from 'node:child_process';
const env={
  ...process.env,
  LH_DEV_URL:'http://127.0.0.1:3000',
  LH_PRIVATE_NEXT_DEV:'1'
};
const executable=process.platform==='win32'?'node_modules\\.bin\\electron.cmd':'node_modules/.bin/electron';
const electron=spawn(executable,['.'],{env,stdio:'inherit',shell:process.platform==='win32'});
electron.on('error',err=>{console.error('Could not start private desktop:',err.message);process.exitCode=1;});
electron.on('exit',code=>{process.exitCode=code??1;});
process.on('SIGINT',()=>electron.kill());

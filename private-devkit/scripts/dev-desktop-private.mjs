/**
 * Windows-safe dev startup. Electron owns BOTH the subscription broker and
 * the Next dev child, allowing the latter to inherit a fresh per-launch
 * broker capability without ever writing it to a file or console.
 */
import {spawn} from 'node:child_process';
import path from 'node:path';
const electronCli=path.resolve('node_modules/electron/cli.js');
const child=spawn(process.execPath,[electronCli,'.'],{
  stdio:'inherit',
  env:{...process.env,LH_DEV_URL:'http://127.0.0.1:3000',LH_PRIVATE_NEXT_DEV:'1'},
});
child.on('error',e=>{console.error('Unable to launch private Electron dev shell:',e.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill());

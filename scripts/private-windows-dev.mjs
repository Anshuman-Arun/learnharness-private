/** Windows Electron development without Unix shell syntax.
 * In this baseline stage this uses the original Next server and has NO
 * ChatGPT broker. Run npm ci before invoking. */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const env = {...process.env, LH_DEV_URL:"http://127.0.0.1:3000"};
const next=spawn(process.execPath, ["./node_modules/next/dist/bin/next", "dev", "-H","127.0.0.1"], {env,stdio:"inherit"});
await delay(2000);
if(next.exitCode!==null)process.exit(next.exitCode||1);
const electron=spawn(process.platform==="win32"?"node_modules\\.bin\\electron.cmd":"node_modules/.bin/electron", ["."], {env,stdio:"inherit",shell:process.platform==="win32"});
const stop=()=>{next.kill();electron.kill();};
process.on("SIGINT",stop);
electron.on("exit",(code)=>{next.kill();process.exitCode=code??1});
next.on("exit",(code)=>{if(electron.exitCode===null)electron.kill();process.exitCode??=code??1});

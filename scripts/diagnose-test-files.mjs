/**
 * Pinpoint nonterminating node:test files before the parallel suite wedges
 * a full CI runner. Each test gets its own child, 20s bounded wall clock.
 * Failing and timed-out files report their names and captured tail.
 * This is a diagnostic gate, not a replacement for the combined npm test.
 */
import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

const files = readdirSync("tests").filter((f) => /\.test\.tsx?$/.test(f)).sort();
const parallel = 6;
const timeout = 45_000;
let next = 0;
const failures = [];
async function worker() {
  for (;;) {
    const index = next++;
    if (index >= files.length) return;
    const file = join("tests", files[index]);
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath,
        ["--import", "tsx", "--test", file],
        { env: {...process.env, NODE_ENV:"test"}, stdio:["ignore","pipe","pipe"] });
      let output = "";
      let settled = false;
      const push = (chunk) => { output = (output + String(chunk)).slice(-5000); };
      child.stdout.on("data", push);
      child.stderr.on("data", push);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        resolve({ok:false,why:"timeout",output});
      }, timeout);
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ok:false,why:error.message,output});
      });
      child.once("close", (code,signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ok:code===0,why:code === 0 ? "" : "exit="+code+" signal="+signal,output});
      });
    });
    if (!result.ok) {
      failures.push({file, ...result});
      console.error("[REGRESSION DIAGNOSTIC FAIL]", file, result.why, "\n", result.output);
    } else {
      console.log("[REGRESSION DIAGNOSTIC PASS]",file);
    }
  }
}
await Promise.all(Array.from({length:Math.min(parallel,files.length)},() => worker()));
console.log("Isolated regression files:", files.length, "Failures or timeouts:", failures.length);
if (failures.length) process.exitCode = 1;

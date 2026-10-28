/**
 * Browser-level visual QA for the REAL Next.js UI (not the static concept mock).
 * Run after npm run build, on a Linux Actions runner with Chrome installed.
 * Uses only synthetic/ephemeral graph/settings responses, never user data.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const outDir = join(process.cwd(), "artifacts", "editorial-ui");
mkdirSync(outDir, { recursive: true });
const candidates = [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/opt/google/chrome/chrome"].filter(Boolean);
let chromePath = candidates.find((p) => existsSync(p));
if (!chromePath) {
  try { chromePath = execFileSync("which", ["google-chrome"], { encoding: "utf8" }).trim(); }
  catch { throw new Error("No Chrome binary found for visual QA"); }
}
const port = 4317;
const server = spawn(process.execPath, [".next/standalone/server.js"], { stdio: "inherit", env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1" } });
let browser;
const base = `http://127.0.0.1:${port}`;
const createdAt = "2026-10-01T12:00:00.000Z";
const labels = ["Expectation by indicators", "Linearity of expectation", "Conditional probability", "Bayes' rule", "Variance decomposition", "Martingale increments"];
const nodes = labels.map((name,i)=>({
  id: `n_visual_${i}`, name, statement: `${name}: a synthetic visual test proposition.`,
  aliases: [], createdAt, provenance: [{ chatId: "visual-session", messageId: "visual" }]
}));
const graph = {
  nodes, propositions: nodes,
  edges: [{ from: nodes[0].id, to: nodes[1].id }, { from: nodes[1].id, to: nodes[2].id }, { from: nodes[3].id, to: nodes[4].id }, { from: nodes[4].id, to: nodes[5].id }],
  logicalEdges: [{ from: nodes[0].id, to: nodes[1].id }, { from: nodes[1].id, to: nodes[2].id }, { from: nodes[3].id, to: nodes[4].id }, { from: nodes[4].id, to: nodes[5].id }],
  impLinks: [], chains: [], sessions: { "visual-session": "Quant mathematics" }, fileSources: {},
  nodeSessions: Object.fromEntries(nodes.map(n=>[n.id,["visual-session"]])),
  clusters: [{ id:"c_expectation", label:"Expectation", members:nodes.slice(0,3).map(n=>n.id) },{ id:"c_probability", label:"Probability", members:nodes.slice(3).map(n=>n.id) }],
  positions: Object.fromEntries(nodes.map((n,i)=>[n.id,{x:(i%3)*150+(i<3?0:110),y:Math.floor(i/3)*200}]))
};
let appearance = { mode: "dark", accent:"coral", accentIntensity:16, zoomPercent:100, corners:"soft", borders:"regular" };
function settingsResponse() {
  return JSON.stringify({ settings:{ version:1, general:{autoUpdate:true,microphoneId:"default",microphoneLabel:""}, appearance } });
}
async function waitForServer() {
  for (let i=0;i<100;i++) {
    if (server.exitCode !== null) throw new Error("Next server exited before becoming ready");
    try { const r = await fetch(base); if(r.status < 500) return; } catch {}
    await new Promise(r=>setTimeout(r,250));
  }
  throw new Error("Next server never became ready");
}
try {
  await waitForServer();
  browser = await puppeteer.launch({ executablePath:chromePath, headless:true, args:["--no-sandbox","--disable-dev-shm-usage","--use-gl=swiftshader"] });
  for (const size of [{width:1366,height:768},{width:1920,height:1080}]) {
    const page = await browser.newPage();
    await page.setViewport({ ...size, deviceScaleFactor:1 });
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.setRequestInterception(true);
    page.on("request", request=>{
      const url = new URL(request.url());
      if(url.pathname==="/api/graph") return void request.respond({status:200,contentType:"application/json",body:JSON.stringify(graph)});
      if(url.pathname==="/api/settings" && request.method()==="GET") return void request.respond({status:200,contentType:"application/json",body:settingsResponse()});
      if(url.pathname==="/api/settings/appearance" && request.method()==="PUT") {
        appearance=JSON.parse(request.postData()??"{}");
        return void request.respond({status:200,contentType:"application/json",body:settingsResponse()});
      }
      return void request.continue();
    });
    await page.goto(base,{waitUntil:"networkidle2",timeout:60000});
    await page.waitForSelector("canvas",{timeout:30000});
    await new Promise(r=>setTimeout(r,1200)); // allow graph bitmap and fonts to settle
    await page.evaluate(()=>document.fonts.ready);
    for(const theme of ["dark","light"]) {
      const result=await page.evaluate(async t=>{
        const root=document.documentElement;
        // This is the SAME root token change the persisted provider makes;
        // settings persistence is separately tested in the unit suite.
        root.classList.toggle("dark",t==="dark");
        root.dataset.theme=t;
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const canvas=document.querySelector("canvas");
        const rect=canvas?.getBoundingClientRect();
        const styles=getComputedStyle(root);
        return { background:styles.getPropertyValue("--background").trim(), foreground:styles.getPropertyValue("--foreground").trim(), canvasSize:canvas?[canvas.width,canvas.height]:null, rect:rect?[rect.width,rect.height]:null };
      },theme);
      assert.ok(result.canvasSize?.[0] > 200 && result.canvasSize?.[1]>150, `graph canvas size in ${theme}`);
      assert.ok(result.rect?.[0] > 200, "canvas CSS box");
      assert.ok(result.background && result.foreground && result.background!==result.foreground, `theme foreground contrast ${theme}`);
      await page.screenshot({path:join(outDir,`home-${theme}-${size.width}x${size.height}.png`),fullPage:false});
      console.log("VISUAL",size,theme,result);
    }
    assert.deepEqual(errors,[],"no browser page errors");
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

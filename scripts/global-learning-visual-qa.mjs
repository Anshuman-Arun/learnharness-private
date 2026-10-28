/** Browser acceptance for global DAG using the ORIGINAL PlanDiagram renderer.
 * A real compiled Next.js server, synthetic data, and Chrome; no user files.
 * This is a smoke/geometry check, not a substitute for Windows Electron QA. */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
const out=join(process.cwd(),"artifacts","global-learning-ui");mkdirSync(out,{recursive:true});
const chrome=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser"].find(existsSync)
  ??execFileSync("which",["google-chrome"],{encoding:"utf8"}).trim();
const port=4381;
const server=spawn(process.execPath,[".next/standalone/server.js"],
  {stdio:"inherit",env:{...process.env,HOSTNAME:"127.0.0.1",PORT:String(port)}});
const base=`http://127.0.0.1:${port}`;
let browser;
const title=["Gradient","Divergence","Curl","Jacobian","Vector fields",
  "Maxwell equations","Stokes theorem","Gauss theorem","Directional derivative",
  "Electromagnetic induction","Laplace operator","Linear algebra"];
const concepts=title.map((name,i)=>({id:`concept:${name.toLowerCase().replaceAll(" ","%20")}`,title:name,
  sources:[{chatId:i<5?"calculus":"physics",chatTitle:i<5?"Multivariable calculus":"Electromagnetism",
    localNodeId:`n${i}`,summary:"Synthetic lesson"}],evidence:[],
  correctChecks:i%2,incorrectChecks:0,ungradedChecks:0}));
const deps=[[0,1],[0,2],[3,8],[4,1],[4,2],[1,7],[2,6],[5,9],[7,10],[4,5],[3,10]];
const learningMap={concepts,
  dependencies:deps.map(([a,b])=>({from:concepts[a].id,to:concepts[b].id,sessions:["test"]})),
  conflicts:[],sessions:[{id:"calculus",title:"Multivariable calculus",concepts:5},
    {id:"physics",title:"Electromagnetism",concepts:7}],unlinkedAnswers:0};
async function ready(){
  for(let i=0;i<120;i++){if(server.exitCode!==null)throw Error("Next exited");
    try{const r=await fetch(base+"/learning-map");if(r.status<500)return;}catch{}
    await new Promise(r=>setTimeout(r,300));
  }
  throw Error("Next server not ready");
}
try {
  await ready();
  browser=await puppeteer.launch({executablePath:chrome,headless:true,
    args:["--no-sandbox","--disable-dev-shm-usage","--use-gl=swiftshader"]});
  for(const size of [{width:1366,height:768},{width:390,height:844}]) {
    const page=await browser.newPage();await page.setViewport({...size,deviceScaleFactor:1});
    const exceptions=[];page.on("pageerror",e=>exceptions.push(e.message));
    await page.setRequestInterception(true);
    page.on("request",req=>{
      if(new URL(req.url()).pathname==="/api/learning-map")return void req.respond({
        status:200,contentType:"application/json",body:JSON.stringify(learningMap)});
      return void req.continue();
    });
    await page.goto(base+"/learning-map",{waitUntil:"networkidle2",timeout:65000});
    await page.waitForFunction(()=>document.querySelectorAll('[data-testid^="plan-node-"]').length>=12,{timeout:30000});
    await page.evaluate(()=>document.fonts.ready);
    // Wait for ResizeObserver + camera fit to run, then verify geometry.
    await new Promise(r=>setTimeout(r,450));
    const result=await page.evaluate(()=>{
      const svg=document.querySelector('svg[aria-label="Plan diagram"]');
      if(!svg) return {svg:false,overlaps:[],curves:0,hidden:0,rect:[]};
      const boxes=[...svg.querySelectorAll('[data-testid^="plan-node-"] > rect')];
      const rects=boxes.map(b=>b.getBoundingClientRect());
      const overlaps=[];
      for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
        const a=rects[i],b=rects[j];
        const width=Math.min(a.right,b.right)-Math.max(a.left,b.left);
        const height=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
        if(width>1&&height>1)overlaps.push([i,j,width,height]);
      }
      const paths=[...svg.querySelectorAll('path[d]')];
      return {svg:true,nodeCount:rects.length,overlaps,
        curves:paths.filter(p=>/\bC\b/.test(p.getAttribute("d")??"")).length,
        rect:[svg.getBoundingClientRect().width,svg.getBoundingClientRect().height],
        titles:[...svg.querySelectorAll('text')].slice(0,3).map(n=>n.textContent),
      };
    });
    assert.equal(result.svg,true,"original PlanDiagram is mounted");
    assert.equal(result.nodeCount,12,"all concepts rendered");
    assert.equal(result.overlaps.length,0,"Dagre placed nonoverlapping node boxes");
    assert.ok(result.curves>0,"original curved SVG link geometry");
    assert.ok(result.rect[0]>0&&result.rect[1]>0,"SVG dimensions are nonzero");
    assert.deepEqual(exceptions,[],"no Chrome runtime exceptions");
    await page.screenshot({path:join(out,`global-dag-${size.width}x${size.height}.png`)});
    // Filtering must preserve original renderer while showing fewer nodes.
    await page.select('select[aria-label="Filter by lesson"]',"calculus");
    await page.waitForFunction(()=>document.querySelectorAll('[data-testid^="plan-node-"]').length===5);
    await page.screenshot({path:join(out,`global-dag-calculus-${size.width}x${size.height}.png`)});
    console.log("Global DAG visual:",size,result);
    await page.close();
  }
} finally {await browser?.close();server.kill("SIGTERM");}

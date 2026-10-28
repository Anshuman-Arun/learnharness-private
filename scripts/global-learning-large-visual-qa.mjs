/** Larger, intentionally *untuned* integration test of the actual global
 * learning map UI. Four loosely linked subjects; no hand positions,
 * clusters/colors, rerouting, or production data written. */
import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {mkdirSync,existsSync} from "node:fs";
import {join} from "node:path";
import puppeteer from "puppeteer-core";
import {exampleFields,exampleBridges,exampleGlobalLearningGraph as fixture}
  from "./fixtures/global-learning-four-fields.mjs";

const dir=join(process.cwd(),"artifacts","global-learning-large");
mkdirSync(dir,{recursive:true});
const chrome=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser"].find(existsSync)
  ??execFileSync("which",["google-chrome"],{encoding:"utf8"}).trim();
const base="http://127.0.0.1:4382";
const server=spawn(process.execPath,[".next/standalone/server.js"],{
  stdio:"inherit",env:{...process.env,HOSTNAME:"127.0.0.1",PORT:"4382"}
});
let browser;
function checkFixture(){
  assert.equal(exampleFields.length,4);
  assert.equal(exampleBridges.length,9);
  assert.equal(fixture.concepts.length,48);
  const ids=new Set(fixture.concepts.map(c=>c.id));
  assert.equal(ids.size,fixture.concepts.length);
  const indegree=new Map([...ids].map(id=>[id,0]));
  const outgoing=new Map();
  for(const e of fixture.dependencies) {
    assert.ok(ids.has(e.from)&&ids.has(e.to),"fixture edge must have two real endpoints");
    assert.notEqual(e.from,e.to);
    indegree.set(e.to,indegree.get(e.to)+1);
    if(!outgoing.has(e.from))outgoing.set(e.from,[]);
    outgoing.get(e.from).push(e.to);
  }
  let processed=0;
  const queue=[...indegree].filter(([,d])=>d===0).map(([id])=>id);
  while(queue.length) {
    const id=queue.pop();processed++;
    for(const to of outgoing.get(id)??[]){
      indegree.set(to,indegree.get(to)-1);
      if(indegree.get(to)===0)queue.push(to);
    }
  }
  assert.equal(processed,ids.size,"fixture is an actual DAG");
}
async function waitServer(){
  for(let i=0;i<140;i++) {
    if(server.exitCode!==null) throw Error("Server stopped before browser QA");
    try{const r=await fetch(base+"/learning-map");if(r.status<500)return;}catch{}
    await new Promise(r=>setTimeout(r,300));
  }
  throw Error("Server never became ready");
}
async function newPage(viewport){
  const page=await browser.newPage();
  await page.setViewport({...viewport,deviceScaleFactor:1});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on("request",req=>{
    if(new URL(req.url()).pathname==="/api/learning-map")
      return void req.respond({status:200,contentType:"application/json",body:JSON.stringify(fixture)});
    return void req.continue();
  });
  await page.goto(base+"/learning-map",{waitUntil:"networkidle2",timeout:65000});
  await page.waitForFunction(n=>
    document.querySelectorAll('svg[aria-label="Plan diagram"] [data-testid^="plan-node-"]').length===n,
    {timeout:40000},fixture.concepts.length);
  await page.evaluate(()=>document.fonts.ready);
  await new Promise(r=>setTimeout(r,500));
  assert.deepEqual(errors,[],"no JS exceptions in browser");
  return page;
}
async function geometry(page){
  return page.evaluate(()=>{
    const svg=document.querySelector('svg[aria-label="Plan diagram"]');
    if(!svg)throw Error("Original PlanDiagram missing");
    const rects=[...svg.querySelectorAll('[data-testid^="plan-node-"] > rect')]
      .map(e=>e.getBoundingClientRect());
    const overlaps=[];
    for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
      const a=rects[i],b=rects[j],dw=Math.min(a.right,b.right)-Math.max(a.left,b.left);
      const dh=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
      if(dw>1 && dh>1)overlaps.push([i,j,dw,dh]);
    }
    const edges=[...svg.querySelectorAll("path[marker-end]")];
    const invalid=edges.filter(e=>/NaN|Infinity|undefined/.test(e.getAttribute("d")??"")).length;
    const vb=svg.viewBox.baseVal;
    return {
      nodes:rects.length,edges:edges.length,
      curved:edges.filter(e=>/[Cc]/.test(e.getAttribute("d")??"")).length,
      overlaps,invalid,viewBox:{width:vb.width,height:vb.height},
      viewportWidth:document.querySelector("main[data-global-learning-page]")?.getBoundingClientRect().width??0,
    };
  });
}
/** Capture a 1:1-ish export of the *actual DOM-generated SVG*. Copying its
 * SVG with identical classes is not a replacement renderer or edited layout.
 * Scaling only controls raster size; Dagre still authored every coordinate. */
async function nativeScreenshot(page){
  const dimensions=await page.evaluate(()=>{
    const svg=document.querySelector('svg[aria-label="Plan diagram"]');
    const vb=svg.viewBox.baseVal;
    const scale=Math.min(1,3600/(vb.width+48),2700/(vb.height+48));
    const width=Math.ceil((vb.width+48)*scale);
    const height=Math.ceil((vb.height+48)*scale);
    const frame=document.createElement("div");
    frame.id="qa-native-svg";
    Object.assign(frame.style,{
      position:"absolute",top:"0px",left:"0px",zIndex:"2147483646",
      width:width+"px",height:height+"px",background:"#171717",
      overflow:"hidden",pointerEvents:"none",
    });
    const cloned=svg.cloneNode(true);
    Object.assign(cloned.style,{
      position:"absolute",top:"24px",left:"24px",
      width:vb.width+"px",height:vb.height+"px",
      maxWidth:"none",transform:`scale(${scale})`,
      transformOrigin:"top left",
    });
    // The original plan is an SVG whose own CSS classes resolve in the
    // same document/theme. No new layout algorithm is introduced here.
    frame.append(cloned);document.body.append(frame);
    return {width,height,scale,raw:[vb.width,vb.height]};
  });
  await page.setViewport({width:Math.max(900,dimensions.width),
    height:Math.max(600,dimensions.height),deviceScaleFactor:1});
  await new Promise(r=>setTimeout(r,200));
  await page.screenshot({path:join(dir,"four-fields-native.png"),
    clip:{x:0,y:0,width:dimensions.width,height:dimensions.height},
    captureBeyondViewport:true});
  await page.evaluate(()=>document.querySelector("#qa-native-svg")?.remove());
  console.log("native svg export",dimensions);
}
try {
  checkFixture();
  await waitServer();
  browser=await puppeteer.launch({executablePath:chrome,headless:true,
    args:["--no-sandbox","--disable-dev-shm-usage","--use-gl=swiftshader"]});
  const desktop=await newPage({width:1920,height:1080});
  const g=await geometry(desktop);
  assert.equal(g.nodes,48);
  assert.equal(g.edges,fixture.dependencies.length,"all cross-subject edges are really drawn");
  assert.equal(g.invalid,0);
  assert.deepEqual(g.overlaps,[],"no actual node boxes may intersect");
  assert.ok(g.curved>=exampleBridges.length,"must preserve curved routing");
  await desktop.screenshot({path:join(dir,"four-fields-desktop-fit.png")});
  await nativeScreenshot(desktop);
  // Verify per-field filter and reset, not merely static fixture drawing.
  await desktop.select('select[aria-label="Filter by lesson"]',"sample-physics");
  await desktop.waitForFunction(()=>document.querySelectorAll('[data-testid^="plan-node-"]').length===12);
  const filtered=await geometry(desktop);
  assert.equal(filtered.nodes,12);
  assert.equal(filtered.edges,exampleFields[1].edges.length,
    "cross-field links disappear when other fields are hidden");
  await desktop.screenshot({path:join(dir,"four-fields-physics-filter.png")});
  await desktop.close();

  const mobile=await newPage({width:390,height:844});
  const m=await geometry(mobile);
  assert.equal(m.nodes,48);
  assert.equal(m.edges,fixture.dependencies.length);
  assert.deepEqual(m.overlaps,[],"mobile fit still has no box collisions");
  assert.ok(m.viewportWidth>=386,"phone content is not squeezed by the sidebar");
  await mobile.screenshot({path:join(dir,"four-fields-mobile-fit.png")});
  // At high density zooming should work and should not change the data.
  const svg=await mobile.$('svg[aria-label="Plan diagram"]');
  const before=await mobile.evaluate(el=>el.getBoundingClientRect().width,svg);
  await mobile.click('button[aria-label="Zoom in"]');
  const after=await mobile.evaluate(el=>el.getBoundingClientRect().width,svg);
  assert.ok(after>before+1,"zoom button enlarges the real PlanDiagram");
  assert.equal((await geometry(mobile)).edges,fixture.dependencies.length);
  await mobile.close();
  console.log(JSON.stringify({pass:true,subjects:exampleFields.map(f=>f.title),
    nodes:g.nodes,edges:g.edges,crossFieldLinks:exampleBridges.length,
    curvedEdges:g.curved,nodeOverlaps:0,invalidPaths:0,
    naturalSize:g.viewBox,mobileWidth:m.viewportWidth},null,2));
} finally {await browser?.close();server.kill("SIGTERM");}

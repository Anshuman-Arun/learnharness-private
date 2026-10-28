/** Actual Next/Chrome cross-page design audit. No user files or API calls:
 * all preview sessions and responses live in a temporary LH_DATA_DIR and
 * intercepted browser requests. Only tests the existing UI components.
 * Covers logo, fonts, contrast, lesson/chat, plan, practice, settings, graph.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
const chrome=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser"]
  .find(existsSync)??execFileSync("which",["google-chrome"],{encoding:"utf8"}).trim();
const out=join(process.cwd(),"artifacts","editorial-pages");mkdirSync(out,{recursive:true});
const data=mkdtempSync(join(tmpdir(),"learnharness-ui-audit-"));
const port=4372,base=`http://127.0.0.1:${port}`;
const timestamp=Date.parse("2026-10-20T17:00:00Z");
const tree={
  version:1,
  nodes:[
    {id:"indicators",title:"Expectation by indicators",summary:"Counting complicated events via linearity."},
    {id:"linearity",title:"Linearity of expectation"},
    {id:"conditional",title:"Conditional expectation"},
    {id:"variance",title:"Law of total variance"},
    {id:"application",title:"Quant interview applications"},
  ],
  edges:[
    {from:"indicators",to:"linearity"},
    {from:"linearity",to:"conditional"},
    {from:"conditional",to:"variance"},
    {from:"linearity",to:"application"},
  ]
};
const usage={input:100,output:80,cached:0};
const nativeAssistant=(id,content)=>({
  id,role:"assistant",content,timestamp,api:"openai-responses",
  provider:"openai",model:"audit-fixture",usage,stopReason:"stop"
});
const teach={
  id:"visual_teaching",version:1,title:"Expectation by indicators",createdAt:new Date(timestamp).toISOString(),
  updatedAt:new Date(timestamp).toISOString(),tree,
  messages:[
    {id:"u1",role:"user",content:"Help me understand expectation by indicators for quant interviews.",timestamp},
    nativeAssistant("a1",[
      {type:"text",text:"Suppose we throw \\(n\\) distinct balls into \\(m\\) bins independently. How many bins do you expect to be occupied?\n\nStart with an indicator \\(I_j=\\mathbf{1}\\{\\text{bin }j\\text{ is occupied}\\}\\). Then \\(X=\\sum_j I_j\\), so linearity of expectation reduces the problem to computing one probability."},
      {type:"toolCall",id:"plan1",name:"plan_init",arguments:{mermaid:"flowchart TD\\n  indicators-->linearity-->conditional-->variance\\n  linearity-->application"}},
    ]),
    {id:"t1",role:"toolResult",toolCallId:"plan1",toolName:"plan_init",
      content:[{type:"text",text:"Plan created."}],details:{ok:true,tree},isError:false,timestamp},
    nativeAssistant("a2",[{type:"text",text:"This approach generalizes immediately to occupancy, collision counting, runs of successes, and random permutations. The key is **choosing an indicator for the quantity being counted**."}]),
  ]
};
const practice={...teach,id:"visual_practice",kind:"practice",title:"Practice: Conditional probability",
  tree:undefined,messages:[
    {id:"u2",role:"user",content:"Practice tricky conditional probability and counting questions.",timestamp},
    nativeAssistant("a3",[{type:"text",text:"We will work through probability interview exercises one at a time. Explain your reasoning, not just the answer.\n\n**Warm-up:** Two cards are drawn without replacement from a standard deck. What is the probability both are aces?"}]),
  ]};
const quiz={...teach,id:"visual_quiz",title:"Interview check: expectation by indicators",
  messages:[
    {id:"u-quiz",role:"user",content:"Test my understanding with a probability question.",timestamp},
    nativeAssistant("a-quiz",[
      {type:"text",text:"Use the indicator-variable method. Think about which outcomes contribute to the expected value."},
      {type:"toolCall",id:"check-1",name:"quiz",arguments:{
        type:"check",nodeId:"indicators",
        question:"What is the expected number of fixed points in a uniformly random permutation of n elements?",
        options:[{label:"1",value:"one"},{label:"n/2",value:"half"},{label:"sqrt(n)",value:"sqrt"},{label:"n",value:"n"}],
        correctAnswer:"one",
        explanation:"Let I_i indicate that permutation i maps to itself. Each E[I_i]=1/n, so the sum of n indicators has expectation 1.",
      }},
    ]),
  ]};
mkdirSync(join(data,"chats"),{recursive:true});
for(const c of [teach,practice,quiz])writeFileSync(join(data,"chats",c.id+".json"),JSON.stringify(c));
const graphNodes=["Expectation by indicators","Linearity of expectation","Conditional probability","Bayes' rule","Variance decomposition","Martingale increments"]
.map((name,i)=>({id:"node_"+i,name,statement:name+" is a synthetic example for visual QA.",
  aliases:[],createdAt:new Date(timestamp).toISOString(),
  provenance:[{chatId:"visual_teaching",messageId:"a1"}]}));
const graphEdges=[[0,1],[1,2],[3,4],[4,5]].map(([a,b])=>({from:graphNodes[a].id,to:graphNodes[b].id}));
const graph={nodes:graphNodes,propositions:graphNodes,edges:graphEdges,logicalEdges:graphEdges,
  impLinks:[],chains:[],sessions:{visual_teaching:"Expectation by indicators"},
  fileSources:{},nodeSessions:Object.fromEntries(graphNodes.map(n=>[n.id,["visual_teaching"]])),
  clusters:[{id:"one",label:"Probability",members:graphNodes.slice(0,3).map(n=>n.id)},
            {id:"two",label:"Reasoning",members:graphNodes.slice(3).map(n=>n.id)}],
  positions:Object.fromEntries(graphNodes.map((n,i)=>[n.id,{x:(i%3)*160,y:Math.floor(i/3)*160}]))};
const server=spawn(process.execPath,[".next/standalone/server.js"],{
  stdio:"inherit",env:{...process.env,HOSTNAME:"127.0.0.1",PORT:String(port),LH_DATA_DIR:data}
});
let browser;
function rgb(raw) {
  if(/^#[0-9a-f]{6}$/i.test(raw))return [1,3,5].map(i=>parseInt(raw.slice(i,i+2),16));
  if(/^#[0-9a-f]{3}$/i.test(raw))return [1,2,3].map(i=>parseInt(raw[i]+raw[i],16));
  const v=raw.replace(/[a-z()]/gi,"").split(/[ ,/]+/).filter(Boolean).slice(0,3).map(Number);
  if(v.length!==3||v.some(n=>!Number.isFinite(n)))throw Error("Non-RGB color "+raw);
  return v;
}
function luminance(c) {
  const a=c.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});
  return .2126*a[0]+.7152*a[1]+.0722*a[2];
}
function contrast(a,b) {
  const [x,y]=[luminance(a),luminance(b)].sort((a,b)=>b-a);
  return (x+.05)/(y+.05);
}
async function waitServer(){
  for(let i=0;i<130;i++){
    if(server.exitCode!==null)throw Error("Next server stopped");
    try{const r=await fetch(base);if(r.status<500)return;}catch{}
    await new Promise(r=>setTimeout(r,300));
  }
  throw Error("Next server timeout");
}
const audit=[];
async function newPage(theme="dark",width=1440,height=900) {
  const page=await browser.newPage();
  await page.setViewport({width,height,deviceScaleFactor:1});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  const appearance={mode:theme,accent:"coral",accentIntensity:16,zoomPercent:100,
    corners:"soft",borders:"regular",fontFamily:null,proseFontSize:16,
    sessionNameSerif:true,mdRendering:{headingWeight:650,boldColor:null,italicColor:null}};
  await page.evaluateOnNewDocument(()=>{
    localStorage.setItem("lh:sidebar-open","1");
    localStorage.removeItem("lh.graph.camera.v1");
  });
  await page.setRequestInterception(true);
  page.on("request",req=>{
    const url=new URL(req.url());
    if(url.pathname==="/api/settings"&&req.method()==="GET")
      return void req.respond({status:200,contentType:"application/json",body:JSON.stringify({settings:{version:1,appearance,general:{autoUpdate:true,microphoneId:"default",microphoneLabel:""}}})});
    if(url.pathname==="/api/graph"&&req.method()==="GET")
      return void req.respond({status:200,contentType:"application/json",body:JSON.stringify(graph)});
    return void req.continue();
  });
  return {page,errors,appearance};
}
async function open({page},path){
  const r=await page.goto(base+path,{waitUntil:"networkidle2",timeout:60000});
  assert.ok(r?.status()!==500,"route "+path+" has no server failure");
  await page.evaluate(()=>document.fonts.ready);
  await new Promise(r=>setTimeout(r,350));
}
async function snap({page,errors},name){
  await page.screenshot({path:join(out,name+".png")});
  assert.deepEqual(errors,[],"browser errors while capturing "+name);
  const stats=await page.evaluate(()=>{
    const root=document.documentElement;
    const cs=getComputedStyle(root),body=getComputedStyle(document.body);
    const label=document.querySelector(".lh-editorial-brand-label");
    const mark=document.querySelector("svg[viewBox='0 0 806 806']");
    const logoPaths=mark?[...mark.querySelectorAll("path,circle")].map(x=>getComputedStyle(x).fill):[];
    return {
      mode:root.dataset.theme,
      uiFont:body.fontFamily,
      titleFont:label?getComputedStyle(label).fontFamily:null,
      background:cs.getPropertyValue("--background").trim(),
      foreground:cs.getPropertyValue("--foreground").trim(),
      primary:cs.getPropertyValue("--primary").trim(),
      logoPaths,
      logoVisible:!!mark && mark.getBoundingClientRect().width>=20,
      viewport:document.body.scrollWidth,
    };
  });
  audit.push({name,...stats});
  assert.ok(stats.background && stats.foreground && stats.background!==stats.foreground);
  assert.ok(stats.logoVisible,"brand mark visible in "+name);
  assert.ok(/IBM Plex Sans|__.*plex|plex/i.test(stats.uiFont),"editorial UI font mounted");
  assert.ok(stats.logoPaths.length===3,"logo path geometry preserved");
}
async function settingShot(ctx,key){
  const {page}=ctx;
  await page.click('[data-testid="settings-entry"]');
  await page.waitForSelector('[data-testid="settings-dialog"]');
  await page.click('[data-testid="settings-nav-'+key+'"]');
  await page.waitForSelector('[data-testid="section-'+key+'"]');
  await new Promise(r=>setTimeout(r,180));
  await snap(ctx,"settings-"+key+"-"+ctx.appearance.mode);
  await page.click('[data-testid="settings-close"]');
}
try{
  await waitServer();
  browser=await puppeteer.launch({executablePath:chrome,headless:true,
    args:["--no-sandbox","--disable-dev-shm-usage","--use-gl=swiftshader"]});
  for(const mode of ["dark","light"]){
    const ctx=await newPage(mode);
    const {page}=ctx;
    await open(ctx,"/");
    await page.waitForSelector('svg[aria-label="Plan diagram"]',{timeout:25000});
    await snap(ctx,"home-"+mode);
    // Verify all seven selectable accent colors on the real brand mark.
    // Only the root dataset is overridden: the same var resolution as
    // AppearanceProvider; this does not persist or change the user's data.
    for(const color of ["ink","cobalt","teal","amber","coral","violet","rose"]) {
      const palette=await page.evaluate(ac=>{
        const root=document.documentElement;root.dataset.accent=ac;
        const mark=document.querySelector("svg[viewBox='0 0 806 806']");
        const shapes=[...mark.querySelectorAll("path,circle")];
        return {
          background:getComputedStyle(root).getPropertyValue("--background").trim(),
          primary:getComputedStyle(root).getPropertyValue("--primary").trim(),
          fills:shapes.map(x=>getComputedStyle(x).fill),
        };
      },color);
      assert.ok(contrast(rgb(palette.background),rgb(palette.primary))>=3,
        `accent ${color} legible on ${mode}`);
      assert.equal(palette.fills[0],palette.fills[2],
        `accent ${color} has no mismatched terminal color`);
      const brand=await page.$(".lh-editorial-brand");
      assert.ok(brand,"Brand link exists");
      await brand.screenshot({path:join(out,`brand-${mode}-${color}.png`)});
    }
    await page.evaluate(()=>document.documentElement.dataset.accent="coral");
    await page.click('[data-testid="home-graph-view-toggle"]');
    await new Promise(r=>setTimeout(r,300));
    await snap(ctx,"home-atlas-"+mode);
    await page.click('[data-testid="home-graph-view-toggle"]');
    await settingShot(ctx,"appearance");
    // The font selection menu is an important user-facing popover.
    await page.click('[data-testid="settings-entry"]');
    await page.waitForSelector('[data-testid="settings-dialog"]');
    await page.click('[data-testid="settings-nav-appearance"]');
    await page.click('[data-testid="font-trigger"]');
    await new Promise(r=>setTimeout(r,220));
    await snap(ctx,"font-menu-"+mode);
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-testid="font-menu"]',{hidden:true,timeout:10000});
    assert.ok(await page.$('[data-testid="settings-dialog"]'),
      "one Escape closes only the font submenu, not its settings dialog");
    await page.click('[data-testid="settings-close"]');
    await settingShot(ctx,"general");
    await settingShot(ctx,"agent");
    await settingShot(ctx,"keys");
    await settingShot(ctx,"graph");
    await settingShot(ctx,"keyboard");
    await page.close();
    const teachCtx=await newPage(mode);
    await open(teachCtx,"/chat/visual_teaching");
    await teachCtx.page.waitForSelector('[data-testid="plan-chip"]',{timeout:30000});
    await snap(teachCtx,"lesson-"+mode);
    await teachCtx.page.click('[data-testid="plan-chip"]');
    await new Promise(r=>setTimeout(r,450));
    // Directly audit the ACTUAL rendered SVG, not merely its CSS classes.
    const planInk=await teachCtx.page.evaluate(()=>{
      const upcoming=document.querySelector('[data-testid="plan-popup"] svg g[data-status="upcoming"] text');
      const outline=document.querySelector('[data-testid="plan-popup"] svg g[data-status="upcoming"] rect');
      const root=getComputedStyle(document.documentElement);
      return {
        ink:upcoming?getComputedStyle(upcoming).fill:null,
        stroke:outline?getComputedStyle(outline).stroke:null,
        background:root.getPropertyValue("--background").trim(),
      };
    });
    assert.ok(planInk.ink&&planInk.stroke,"plan text and box are visible");
    assert.ok(contrast(rgb(planInk.ink),rgb(planInk.background))>=4.5,
      `plan node text contrast in ${mode}`);
    assert.ok(contrast(rgb(planInk.stroke),rgb(planInk.background))>=3,
      `plan node outlines must remain distinguishable in ${mode}`);
    await snap(teachCtx,"lesson-plan-"+mode);
    await teachCtx.page.close();
    const practiceCtx=await newPage(mode);
    await open(practiceCtx,"/chat/visual_practice");
    await snap(practiceCtx,"practice-"+mode);
    await practiceCtx.page.close();
    const quizCtx=await newPage(mode);
    await open(quizCtx,"/chat/visual_quiz");
    await quizCtx.page.waitForSelector('[data-testid="question-dock"]',{timeout:25000});
    await snap(quizCtx,"quiz-dock-"+mode);
    await quizCtx.page.close();
  }
  const narrow=await newPage("dark",390,844);
  await open(narrow,"/");
  await snap(narrow,"home-mobile-dark");
  await narrow.page.close();
  // Both logo layers and interface colors must have sufficient foreground/
  // background contrast in either mode; the filled terminal uses primary.
  for(const row of audit){
    const bg=rgb(row.background),fg=rgb(row.foreground),primary=rgb(row.primary);
    assert.ok(contrast(bg,fg)>=7,`base text contrast ${row.name}`);
    assert.ok(contrast(bg,primary)>=3,`brand-accent contrast ${row.name}`);
    assert.equal(row.logoPaths[0],row.logoPaths[2],
      `spiral and filled dot must share exact saved accent ${row.name}`);
    assert.notEqual(row.logoPaths[1],row.logoPaths[2],
      `outlined terminal uses independent theme ink ${row.name}`);
  }
  console.log("PAGE-AUDIT",JSON.stringify({pass:true,
    screenshots:audit.map(r=>r.name),themes:[...new Set(audit.map(r=>r.mode))],
    testedLogoContrast:true,font:"IBM Plex Sans + Newsreader + Source Sans 3"},null,2));
} finally {await browser?.close();server.kill("SIGTERM");rmSync(data,{recursive:true,force:true});}

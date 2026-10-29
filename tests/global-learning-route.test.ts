import assert from "node:assert/strict";
import { it } from "node:test";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("serves persisted native answers, updates after deletion, and never rewrites source records",async()=>{
  const temporary=fs.mkdtempSync(join(tmpdir(),"lh-learning-route-"));
  process.env.LH_DATA_DIR=join(temporary,"data");
  process.env.LH_AUTH_FILE=join(temporary,"auth.json");
  const {stores}=await import("../src/server/stores.ts");
  const {GET}=await import("../app/api/learning-map/route.ts");
  try {
    assert.deepEqual((await (await GET()).json()).concepts,[]);
    const a=stores.chatStore.createChat("Calculus");
    const b=stores.chatStore.createChat("Physics");
    for(const record of [a,b])stores.chatStore.saveTree(record.id,{version:1,
      nodes:[{id:"g",title:"Gradient"}],edges:[]});
    stores.chatStore.saveMessages(a.id,[
      {role:"assistant",content:[{type:"toolCall",id:"q",name:"quiz",arguments:{nodeId:"g",type:"check",question:"Compute the gradient"}}]},
      {role:"toolResult",toolCallId:"q",toolName:"quiz",content:[],details:{correct:true,answeredAt:"2026-10-28T00:00:00Z",thinking:"Differentiate",confidence:90}},
    ] as never);
    const file=join(temporary,"data","chats",a.id+".json");
    const before=fs.readFileSync(file,"utf8");
    const response=await GET();
    assert.equal(response.headers.get("cache-control"),"no-store");
    const graph=await response.json();
    assert.equal(graph.concepts.length,1);
    assert.equal(graph.concepts[0].sources.length,2);
    assert.equal(graph.concepts[0].correctChecks,1);
    assert.equal(graph.concepts[0].evidence[0].reasoning,"Differentiate");
    await GET();
    assert.equal(fs.readFileSync(file,"utf8"),before);
    stores.chatStore.deleteChat(b.id);
    assert.equal((await (await GET()).json()).concepts[0].sources.length,1);
    stores.chatStore.deleteChat(a.id);
    assert.deepEqual((await (await GET()).json()).concepts,[]);
  }finally{fs.rmSync(temporary,{recursive:true,force:true,maxRetries:5});}
});

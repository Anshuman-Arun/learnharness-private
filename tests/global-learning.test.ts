import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGlobalLearningGraph, learningIdentity } from "../src/core/global-learning.ts";
import type { ChatRecord } from "../src/core/contracts/chat.ts";

function lesson(id:string,title:string, nodes:Array<[string,string]>,
  edges:Array<[string,string]>,answers:Array<{id:string;nodeId:string;correct?:boolean;kind?:string}>=[]):ChatRecord {
  const messages:unknown[]=[];
  for(const a of answers) {
    messages.push({role:"assistant",content:[{type:"toolCall",id:a.id,
      name:a.kind==="explain"?"explain":"quiz",
      arguments:{question:"Apply "+a.nodeId,nodeId:a.nodeId,type:"check"}}]});
    messages.push({role:"toolResult",toolCallId:a.id,toolName:a.kind==="explain"?"explain":"quiz",
      details:{kind:a.kind==="explain"?"explain":"quiz",correct:a.correct,
        questionText:"Apply "+a.nodeId,answeredAt:"2026-10-28T00:00:00Z"}})
  }
  return {id,title,createdAt:"2026-10-20T00:00:00Z",updatedAt:"2026-10-28T00:00:00Z",
    messages,tree:{version:1,
      nodes:nodes.map(([nodeId,name])=>({id:nodeId,title:name})),
      edges:edges.map(([from,to])=>({from,to}))}} as unknown as ChatRecord;
}
describe("cross-session global learning map",()=>{
  it("reuses precise concepts across calculus and physics without creating a CalcuIus III megaclass",()=>{
    const calculus=lesson("calculus","Calculus III",[
      ["grad","Gradient"],["div","Divergence"],["curl","Curl"],["overview","Overview"]],
      [["grad","div"],["div","curl"]],[{id:"q1",nodeId:"div",correct:true}]);
    const physics=lesson("physics","Electromagnetism",[
      ["div-physics","Divergence"],["maxwell","Maxwell equations"],["overview","Overview"]],
      [["div-physics","maxwell"]],[{id:"q2",nodeId:"div-physics",correct:false}]);
    const g=buildGlobalLearningGraph([physics,calculus]);
    const divergence=g.concepts.find(n=>n.title==="Divergence")!;
    assert.ok(divergence);
    assert.equal(g.concepts.filter(n=>n.title==="Divergence").length,1);
    assert.equal(divergence.sources.length,2);
    assert.equal(divergence.correctChecks,1);
    assert.equal(divergence.incorrectChecks,1);
    assert.equal(g.concepts.filter(n=>n.title==="Overview").length,2);
    assert.equal(g.dependencies.length,3);
  });
  it("does not silently merge generic or ambiguous concept names",()=>{
    assert.notEqual(learningIdentity("Introduction","a","x"),learningIdentity("Introduction","b","y"));
    assert.notEqual(learningIdentity("Rank","linear","x"),learningIdentity("Rank","statistics","z"));
    assert.equal(learningIdentity("Gradient","a","x"),learningIdentity("gradient","b","y"));
    assert.equal(learningIdentity("Conditional expectation","a","x"),learningIdentity("Conditional Expectation","b","y"));
  });
  it("rejects a cycle induced by two independently valid session plans",()=>{
    const a=lesson("a","Course 1",[["a","Conditional expectation"],["b","Gradient"]],[["a","b"]]);
    const b=lesson("b","Course 2",[["a","Conditional expectation"],["b","Gradient"]],[["b","a"]]);
    const g=buildGlobalLearningGraph([a,b]);
    assert.equal(g.dependencies.length,1);
    assert.equal(g.conflicts.length,1);
    assert.equal(g.conflicts[0]!.reason,"would_create_cycle");
  });
  it("does not call free recall correct, and never treats a prediction as a mastery check",()=>{
    const a=lesson("a","Example",[["grad","Gradient"]],[],
      [{id:"free",nodeId:"grad",kind:"explain"},{id:"grade",nodeId:"grad",correct:true}]);
    const g=buildGlobalLearningGraph([a]);
    const node=g.concepts[0]!;
    assert.equal(node.correctChecks,1);
    assert.equal(node.ungradedChecks,1);
    const original=a.messages[0] as unknown as {content:Array<{arguments:Record<string,string>}>};
    original.content[0]!.arguments.type="predict";
    const again=buildGlobalLearningGraph([a]).concepts[0]!;
    assert.equal(again.correctChecks,1); // only grade is counted
    assert.equal(again.ungradedChecks,0); // predict isn't counted
  });
  it("does not infer mastery from visited plans, explanation prose or unbound results",()=>{
    const a=lesson("a","Empty",[["l","Divergence"]],[]);
    a.messages.push({role:"toolResult",toolCallId:"ghost",toolName:"probe",details:{correct:true}} as never);
    const g=buildGlobalLearningGraph([a]);
    assert.equal(g.concepts[0]!.correctChecks,0);
    assert.equal(g.unlinkedAnswers,1);
  });
});

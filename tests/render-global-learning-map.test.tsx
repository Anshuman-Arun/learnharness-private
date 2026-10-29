import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { GlobalLearningMap } from "../components/global-learning-map.tsx";
import { PlanDiagram } from "../components/plan-block.tsx";
import { buildGlobalLearningGraph } from "../src/core/global-learning.ts";
import type { ChatRecord } from "../src/core/contracts/chat.ts";

describe("global learning map keeps the ORIGINAL mini-DAG renderer", () => {
  it("renders original plan SVG with Dagre-curved arrows and text-sized boxes", () => {
    const nodes = [
      {id:"n1",title:"Gradient"},
      {id:"n2",title:"Divergence"},
      {id:"n3",title:"Gauss's theorem"},
    ];
    const edges=[{from:"n1",to:"n2"},{from:"n2",to:"n3"}];
    const html=renderToStaticMarkup(createElement(PlanDiagram,{
      nodes,edges,markerId:"global-svg-test",pad:40,naturalSize:true,
      statusOf:()=> "visited" as const,
    }));
    assert.match(html,/aria-label="Plan diagram"/);
    assert.match(html,/data-testid="plan-node-n1"/);
    assert.match(html,/data-testid="plan-node-n3"/);
    assert.match(html,/markerEnd|marker-end/);
    assert.match(html,/<path/);
    assert.match(html,/<rect/);
  });
  it("uses the shared original PlanDiagram and pan/zoom, not a replacement renderer",()=>{
    const source=readFileSync(new URL("../components/global-learning-map.tsx",import.meta.url),"utf8");
    assert.match(source,/import \{ PlanDiagram, blockLayout, GRAPH_PAD \} from "@\/components\/plan-block"/);
    assert.match(source,/from "@\/components\/pan-zoom"/);
    assert.doesNotMatch(source,/@xyflow\/react|ReactFlow|graph-canvas/);
    const html=renderToStaticMarkup(createElement(GlobalLearningMap));
    assert.match(html,/Global learning map/);
  });
  it("never writes a new plan or graph record when building a view",()=>{
    const record:ChatRecord={
      id:"one",title:"Physics",createdAt:"2026-01-01T00:00:00Z",
      updatedAt:"2026-01-01T00:00:00Z",messages:[],
      tree:{version:1,nodes:[{id:"a",title:"Divergence"}],edges:[]},
    } as ChatRecord;
    const before=JSON.stringify(record);
    const graph=buildGlobalLearningGraph([record]);
    assert.equal(graph.concepts[0]?.title,"Divergence");
    assert.equal(JSON.stringify(record),before);
  });
});

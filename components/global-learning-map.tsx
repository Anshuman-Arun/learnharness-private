"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ReactFlow, Background, Controls, MiniMap, MarkerType, Position, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GlobalLearningGraph, LearningConcept } from "@/src/core/global-learning.ts";

const EMPTY: GlobalLearningGraph={concepts:[],dependencies:[],conflicts:[],sessions:[],unlinkedAnswers:0};
function layout(
  concepts:readonly LearningConcept[],
  dependencies:ReadonlyArray<{from:string;to:string}>,
  selectedId:string|null,
): {nodes:Node[];edges:Edge[]} {
  const byId=new Map(concepts.map(x=>[x.id,x]));
  const indegree=new Map(concepts.map(x=>[x.id,0]));
  const outgoing=new Map<string,string[]>();
  for(const e of dependencies) {
    if(!byId.has(e.from)||!byId.has(e.to))continue;
    indegree.set(e.to,(indegree.get(e.to)??0)+1);
    const arr=outgoing.get(e.from);
    if(arr)arr.push(e.to);else outgoing.set(e.from,[e.to]);
  }
  const queue=[...indegree].filter(([,count])=>count===0).map(([id])=>id).sort();
  const depth=new Map<string,number>();
  let n=0;
  while(n<queue.length) {
    const id=queue[n++]!;
    const rank=depth.get(id)??0;
    for(const target of outgoing.get(id)??[]) {
      depth.set(target,Math.max(depth.get(target)??0,rank+1));
      const next=(indegree.get(target)??0)-1;
      indegree.set(target,next);
      if(next===0)queue.push(target);
    }
  }
  // A cycle cannot enter from the validated API, but default to a visible
  // free root instead of dropping any data from a corrupt/partial response.
  const ranks=new Map<number,LearningConcept[]>();
  for(const concept of concepts) {
    const rank=depth.get(concept.id)??0;
    const group=ranks.get(rank);
    if(group)group.push(concept);else ranks.set(rank,[concept]);
  }
  const positions=new Map<string,{x:number;y:number}>();
  let x=35;
  for(const rank of [...ranks.keys()].sort((a,b)=>a-b)) {
    const group=ranks.get(rank)!.sort((a,b)=>a.title.localeCompare(b.title));
    const columns=Math.max(1,Math.ceil(group.length/12));
    group.forEach((concept,i)=>positions.set(concept.id,{x:x+Math.floor(i/12)*275,y:35+(i%12)*118}));
    x+=columns*275+95;
  }
  const adjacent=new Set<string>();
  if(selectedId) for(const e of dependencies) {
    if(e.from===selectedId)adjacent.add(e.to);
    if(e.to===selectedId)adjacent.add(e.from);
  }
  const nodes:Node[]=concepts.map((c)=>{
    const active=selectedId===c.id;
    const dim=selectedId!==null&&!active&&!adjacent.has(c.id);
    return {
      id:c.id,
      position:positions.get(c.id)??{x:0,y:0},
      sourcePosition:Position.Right,
      targetPosition:Position.Left,
      data:{label:<div style={{width:201,textAlign:"left",padding:"5px 2px"}}>
        <strong style={{display:"block",fontSize:13,lineHeight:"18px",overflowWrap:"anywhere"}}>{c.title}</strong>
        <small style={{fontSize:10,opacity:.7}}>
          {c.sources.length} lesson{c.sources.length===1?"":"s"} · {c.correctChecks} correct checks
        </small>
      </div>},
      style:{
        width:225,minHeight:74,opacity:dim?.33:1,
        color:"var(--foreground)",background:"var(--card)",
        border:`1px solid ${active?"var(--primary)":"var(--border)"}`,
        borderRadius:12,boxShadow:active?"0 0 0 2px var(--primary)":"0 2px 9px #0000000d",
      },
    };
  });
  const edges:Edge[]=dependencies.filter(e=>byId.has(e.from)&&byId.has(e.to)).map((e,i)=>{
    const highlight=selectedId&&(e.from===selectedId||e.to===selectedId);
    return {id:`e-${i}`,source:e.from,target:e.to,
      type:"default",style:{stroke:"var(--muted-foreground)",strokeWidth:highlight?2:1.2,opacity:selectedId?(highlight?.88:.09):.35},
      markerEnd:{type:MarkerType.ArrowClosed,color:"var(--muted-foreground)",width:10,height:10},
    };
  });
  return {nodes,edges};
}
export function GlobalLearningMap() {
  const [data,setData]=useState<GlobalLearningGraph>(EMPTY);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [session,setSession]=useState("");
  const [showAll,setShowAll]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch("/api/learning-map",{signal:controller.signal,cache:"no-store"})
      .then(async r=>{if(!r.ok)throw new Error(`Learning map request failed (${r.status})`);return r.json() as Promise<GlobalLearningGraph>})
      .then(body=>setData(body))
      .catch(err=>{if(!controller.signal.aborted)setError(String(err))})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return ()=>controller.abort();
  },[]);
  const relevant=useMemo(()=>{
    let list=data.concepts;
    if(session) list=list.filter(c=>c.sources.some(s=>s.chatId===session));
    if(query.trim()) {
      const matching=new Set(list.filter(c=>c.title.toLowerCase().includes(query.trim().toLowerCase()) ||
        c.sources.some(s=>(s.summary??"").toLowerCase().includes(query.trim().toLowerCase()))).map(c=>c.id));
      // Include immediate prerequisites and dependents for local context.
      for(const e of data.dependencies)if(matching.has(e.from)||matching.has(e.to)){
        if(data.concepts.some(c=>c.id===e.from)) matching.add(e.from);
        if(data.concepts.some(c=>c.id===e.to)) matching.add(e.to);
      }
      list=list.filter(c=>matching.has(c.id));
    }
    return list;
  },[data,session,query]);
  const displayed=showAll?relevant:relevant.slice(0,120);
  const ids=useMemo(()=>new Set(displayed.map(c=>c.id)),[displayed]);
  const connections=useMemo(()=>data.dependencies.filter(e=>ids.has(e.from)&&ids.has(e.to)),[data,ids]);
  const graph=useMemo(()=>layout(displayed,connections,selected),[displayed,connections,selected]);
  const focus=data.concepts.find(c=>c.id===selected)??null;
  return <main className="flex h-[calc(100dvh-24px)] min-h-[460px] flex-col gap-3 px-4 pb-4 pt-3 text-foreground">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">← Home</Link>
          <h1 className="text-xl font-semibold tracking-tight">Global learning map</h1>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Shared learning objectives, dependencies and evidence across saved lessons. This is separate from the proposition graph.</p>
      </div>
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>{data.concepts.length} concepts</span><span>{data.dependencies.length} dependencies</span>
        <span>{data.sessions.length} lessons</span>
      </div>
    </header>
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label="Search concepts" placeholder="Search concepts..." value={query} onChange={e=>setQuery(e.target.value)}
        className="min-w-[180px] flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
      <select aria-label="Filter by lesson" value={session} onChange={e=>setSession(e.target.value)}
        className="max-w-[240px] rounded-lg border border-border bg-card px-3 py-2 text-sm">
        <option value="">All lessons</option>
        {data.sessions.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
      <button onClick={()=>setShowAll(v=>!v)}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
        {showAll?"Focus view (120)":"Show all"}
      </button>
    </div>
    {data.conflicts.length>0&&<p className="text-xs text-amber-600">
      {data.conflicts.length} prerequisite link(s) omitted because merging would create a cycle. Local plans remain unchanged.</p>}
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background md:flex-row">
      <div className="relative min-h-[340px] flex-1">
        {loading?<div className="p-5 text-sm text-muted-foreground">Reading your saved lesson plans…</div>:
        error?<div role="alert" className="p-5 text-sm text-red-500">{error}</div>:
        displayed.length===0?<div className="p-5 text-sm text-muted-foreground">No matching saved lesson objectives yet.</div>:
        <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView fitViewOptions={{padding:.18,maxZoom:1}}
          minZoom={.08} maxZoom={2} nodesConnectable={false} nodesDraggable={false}
          onNodeClick={(_event, node:Node)=>setSelected(node.id)}
          onPaneClick={()=>setSelected(null)} proOptions={{hideAttribution:true}}>
          <Background gap={24} size={1} color="var(--border)"/>
          <Controls showInteractive={false}/>
          <MiniMap nodeColor="var(--muted-foreground)" zoomable pannable/>
        </ReactFlow>}
        {!showAll&&relevant.length>120&&<div className="absolute bottom-3 left-3 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-sm">
          Showing 120 of {relevant.length} concepts. Search, filter, or select Show all.
        </div>}
      </div>
      {focus&&<aside className="w-full shrink-0 overflow-y-auto border-t border-border bg-card p-4 md:w-72 md:border-l md:border-t-0">
        <button className="float-right text-sm text-muted-foreground" aria-label="Close concept details" onClick={()=>setSelected(null)}>✕</button>
        <h2 className="pr-6 text-lg font-medium">{focus.title}</h2>
        <p className="mt-3 text-xs text-muted-foreground">Evidence from completed checks (not a mastery score)</p>
        <p className="mt-1 text-sm">{focus.correctChecks} correct · {focus.incorrectChecks} incorrect · {focus.ungradedChecks} ungraded</p>
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appears in</h3>
        <div className="mt-2 space-y-3">
          {focus.sources.map((s,i)=><div key={s.chatId+":"+s.localNodeId+":"+i} className="rounded-lg border border-border p-2 text-sm">
            <Link className="underline underline-offset-2" href={`/chat/${encodeURIComponent(s.chatId)}`}>{s.chatTitle}</Link>
            {s.summary&&<p className="mt-1 text-xs text-muted-foreground">{s.summary}</p>}
          </div>)}
        </div>
        {focus.evidence.length>0&&<>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent questions</h3>
          {focus.evidence.slice(-6).reverse().map(e=><div key={e.chatId+":"+e.toolCallId} className="mt-2 border-b border-border pb-2 text-xs">
            <span className="font-semibold capitalize">{e.outcome}</span> · {e.kind}
            {e.question&&<p className="mt-1 line-clamp-4">{e.question}</p>}
          </div>)}
        </>}
      </aside>}
    </div>
    <p className="text-xs text-muted-foreground">View-only. Generic labels stay session-specific to avoid false merges; free-recall answers are ungraded until reviewed. The original knowledge graph and lesson DAGs are unchanged.</p>
  </main>;
}

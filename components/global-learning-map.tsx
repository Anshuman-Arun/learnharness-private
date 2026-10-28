"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react";
import { PlanDiagram, blockLayout, GRAPH_PAD } from "@/components/plan-block";
import { fitGraphView, fitZoomFor, zoomedGraphView, type Viewport } from "@/components/pan-zoom";
import type { GlobalLearningGraph } from "@/src/core/global-learning.ts";

/** The same Dagre + hand-built SVG skin as the original mini lesson DAGs.
 * Do not replace it with React Flow, circles, or a second diagram engine.
 * Global reasoning/proposition graph remains a separate existing surface. */
const EMPTY:GlobalLearningGraph={concepts:[],dependencies:[],conflicts:[],sessions:[],unlinkedAnswers:0};
const INITIAL_LIMIT=100;
const PAD=GRAPH_PAD+16;
export function GlobalLearningMap() {
  const markerId=useId().replace(/[^a-zA-Z0-9-]/g,"");
  const [data,setData]=useState<GlobalLearningGraph>(EMPTY);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [session,setSession]=useState("");
  const [all,setAll]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);
  const viewportRef=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({w:0,h:0});
  const [view,setView]=useState<Viewport>({x:0,y:0,zoom:1});
  const dragRef=useRef<{x:number;y:number;startX:number;startY:number;moved:boolean}|null>(null);
  const [dragging,setDragging]=useState(false);
  useEffect(()=>{
    const c=new AbortController();
    void fetch("/api/learning-map",{signal:c.signal,cache:"no-store"})
      .then(async r=>{if(!r.ok)throw new Error(`Learning map request failed (${r.status})`);return r.json() as Promise<GlobalLearningGraph>})
      .then(setData).catch(e=>{if(!c.signal.aborted)setError(String(e))})
      .finally(()=>{if(!c.signal.aborted)setLoading(false)});
    return ()=>c.abort();
  },[]);
  useEffect(()=>{
    const el=viewportRef.current;
    if(!el || typeof ResizeObserver==="undefined")return;
    const ro=new ResizeObserver(()=>setSize({w:el.clientWidth,h:el.clientHeight}));
    ro.observe(el);return ()=>ro.disconnect();
  },[]);

  const relevant=useMemo(()=>{
    let items=data.concepts;
    if(session)items=items.filter(c=>c.sources.some(s=>s.chatId===session));
    const term=query.trim().toLocaleLowerCase();
    if(term) {
      const found=new Set(items.filter(c=>c.title.toLocaleLowerCase().includes(term)||
        c.sources.some(s=>(s.summary??"").toLocaleLowerCase().includes(term))).map(c=>c.id));
      // A one-hop neighborhood makes prerequisite context visible without
      // changing the canonical concept set or fabricating dependencies.
      const allowed=new Set(items.map(c=>c.id));
      for(const e of data.dependencies)if(found.has(e.from)||found.has(e.to)){
        if(allowed.has(e.from))found.add(e.from);
        if(allowed.has(e.to))found.add(e.to);
      }
      items=items.filter(c=>found.has(c.id));
    }
    return items;
  },[data,session,query]);
  const shown=useMemo(()=>all?relevant:relevant.slice(0,INITIAL_LIMIT),[relevant,all]);
  const ids=useMemo(()=>new Set(shown.map(c=>c.id)),[shown]);
  const edges=useMemo(()=>data.dependencies.filter(e=>ids.has(e.from)&&ids.has(e.to))
    .map(e=>({from:e.from,to:e.to})),[data,ids]);
  const nodes=useMemo(()=>shown.map(c=>({id:c.id,title:c.title})),[shown]);
  const layout=useMemo(()=>blockLayout(nodes,edges),[nodes,edges]);
  const box=useMemo(()=>({w:layout.width+2*PAD,h:layout.height+2*PAD}),[layout]);
  const floor=useMemo(()=>fitZoomFor(box,size),[box,size]);
  useEffect(()=>{
    if(size.w>0&&size.h>0)setView(fitGraphView(box,size,floor));
  },[box,size,floor]);
  useEffect(()=>{
    const el=viewportRef.current;
    if(!el)return;
    const wheel=(event:WheelEvent)=>{
      event.preventDefault();
      const dy=event.deltaMode===1?event.deltaY*16:event.deltaY;
      const rect=el.getBoundingClientRect();
      const factor=Math.exp(-dy*.0015);
      setView(v=>zoomedGraphView(v,factor,floor,
        {x:event.clientX-rect.left,y:event.clientY-rect.top},box,size));
    };
    el.addEventListener("wheel",wheel,{passive:false});
    return ()=>el.removeEventListener("wheel",wheel);
  },[box,size,floor]);
  const focus=data.concepts.find(c=>c.id===selected)??null;
  const zoom=(factor:number)=>setView(v=>zoomedGraphView(v,factor,floor,
    {x:size.w/2,y:size.h/2},box,size));
  const fit=()=>{if(size.w&&size.h)setView(fitGraphView(box,size,floor));};
  const down=(e:ReactPointerEvent<HTMLDivElement>)=>{
    if(e.button!==0||view.zoom<=floor+1e-9)return;
    dragRef.current={startX:e.clientX,startY:e.clientY,x:view.x,y:view.y,moved:false};
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const move=(e:ReactPointerEvent<HTMLDivElement>)=>{
    const d=dragRef.current;
    if(!d)return;
    if(Math.abs(e.clientX-d.startX)+Math.abs(e.clientY-d.startY)>4)d.moved=true;
    setView(v=>({...v,x:d.x+e.clientX-d.startX,y:d.y+e.clientY-d.startY}));
  };
  const end=(e:ReactPointerEvent<HTMLDivElement>)=>{
    dragRef.current=null;setDragging(false);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return <main className="flex h-[calc(100dvh-24px)] min-h-[460px] flex-col gap-3 px-4 pb-4 pt-3 text-foreground">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-3"><Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">← Home</Link>
          <h1 className="text-xl font-semibold tracking-tight">Global learning map</h1></div>
        <p className="mt-1 text-xs text-muted-foreground">The same diagram used by your lesson plans, now combining their objectives and prerequisites across sessions.</p>
      </div>
      <div className="flex gap-3 text-xs text-muted-foreground"><span>{data.concepts.length} concepts</span>
        <span>{data.dependencies.length} links</span><span>{data.sessions.length} lessons</span></div>
    </header>
    <div className="flex flex-wrap gap-2">
      <input aria-label="Search concepts" placeholder="Search concepts..." value={query}
        onChange={e=>{setQuery(e.target.value);setSelected(null);}}
        className="min-w-[180px] flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm" />
      <select aria-label="Filter by lesson" value={session}
        onChange={e=>{setSession(e.target.value);setSelected(null);}}
        className="max-w-[240px] rounded-lg border border-border bg-card px-3 py-2 text-sm">
        <option value="">All lessons</option>{data.sessions.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
      <button type="button" onClick={()=>setAll(v=>!v)}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
        {all?"Focused view":"Show all"}
      </button>
    </div>
    {data.conflicts.length>0&&<p className="text-xs text-amber-600">
      {data.conflicts.length} candidate prerequisite link(s) skipped because they introduce cycles; original lesson plans are intact.</p>}
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background md:flex-row">
      <div ref={viewportRef}
        className={`relative min-h-[320px] flex-1 overflow-hidden select-none touch-none ${dragging?"cursor-grabbing":"cursor-grab"}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
        onClick={e=>{
          if(dragging||dragRef.current?.moved)return;
          const target=e.target;
          if(!(target instanceof Element))return;
          const group=target.closest<SVGGElement>("[data-testid^='plan-node-']");
          if(group){const id=group.getAttribute("data-testid")!.slice("plan-node-".length);
            if(ids.has(id))setSelected(id);
          }else if(target.closest("svg"))setSelected(null);
        }}
      >
        {loading?<p className="p-5 text-sm text-muted-foreground">Reading your saved lesson plans…</p>:
        error?<p role="alert" className="p-5 text-sm text-red-500">{error}</p>:
        nodes.length===0?<p className="p-5 text-sm text-muted-foreground">No matching saved lesson objectives yet.</p>:
        <div className="absolute top-0 left-0 origin-top-left"
          style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.zoom})`}}>
          <PlanDiagram nodes={nodes} edges={edges}
            markerId={markerId} pad={PAD} naturalSize
            statusOf={id=>!selected||id===selected?"visited":"upcoming"}
            glowId={selected}/>
        </div>}
        {!all&&relevant.length>INITIAL_LIMIT&&<p className="pointer-events-none absolute left-2 top-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs">
          Showing {INITIAL_LIMIT} of {relevant.length}. Search, filter or Show all.
        </p>}
        <div className="pointer-events-none absolute bottom-2 right-2 flex gap-1">
          <button type="button" onClick={()=>zoom(1/1.25)} aria-label="Zoom out"
            className="pointer-events-auto rounded-md border border-border bg-card p-2"><MinusIcon className="size-4"/></button>
          <button type="button" onClick={fit} aria-label="Fit graph"
            className="pointer-events-auto rounded-md border border-border bg-card p-2"><MaximizeIcon className="size-4"/></button>
          <button type="button" onClick={()=>zoom(1.25)} aria-label="Zoom in"
            className="pointer-events-auto rounded-md border border-border bg-card p-2"><PlusIcon className="size-4"/></button>
        </div>
      </div>
      {focus&&<aside className="w-full shrink-0 overflow-y-auto border-t border-border bg-card p-4 md:w-72 md:border-l md:border-t-0">
        <button type="button" onClick={()=>setSelected(null)} aria-label="Close details"
          className="float-right text-sm text-muted-foreground">✕</button>
        <h2 className="pr-6 text-lg font-medium">{focus.title}</h2>
        <p className="mt-3 text-xs text-muted-foreground">Past graded checks (not a mastery score)</p>
        <p className="mt-1 text-sm">{focus.correctChecks} correct · {focus.incorrectChecks} incorrect · {focus.ungradedChecks} ungraded</p>
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lessons</h3>
        <div className="mt-2 space-y-3">{focus.sources.map((s,i)=><div key={s.chatId+":"+s.localNodeId+":"+i}
          className="rounded-lg border border-border p-2 text-sm">
          <Link href={`/chat/${encodeURIComponent(s.chatId)}`} className="underline underline-offset-2">{s.chatTitle}</Link>
          {s.summary&&<p className="mt-1 text-xs text-muted-foreground">{s.summary}</p>}
        </div>)}</div>
        {focus.evidence.length>0&&<><h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Questions</h3>
          {focus.evidence.slice(-6).reverse().map(e=><div key={e.chatId+":"+e.toolCallId}
            className="mt-2 border-b border-border pb-2 text-xs">
            <span className="font-semibold capitalize">{e.outcome}</span> · {e.kind}
            {e.question&&<p className="mt-1">{e.question}</p>}
          </div>)}</>}
      </aside>}
    </div>
    <p className="text-xs text-muted-foreground">The existing mini-DAGs and proposition graph are untouched. Generic objectives remain session-specific to prevent false mergers.</p>
  </main>;
}

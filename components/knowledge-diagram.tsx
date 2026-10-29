"use client";

/** Original mini lesson DAG, applied to the home proposition graph.
 * Same PlanDiagram, Dagre routing, fitted rectangles and curved arrows.
 * This view never writes/rearranges the saved force-layout positions.
 * The physics canvas remains available via Atlas mode for large graphs.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react";
import { PlanDiagram, blockLayout, GRAPH_PAD } from "./plan-block";
import { fitGraphView, fitZoomFor, zoomedGraphView, type Viewport } from "./pan-zoom";

export interface KnowledgeDiagramNode { id:string; title:string }
export interface KnowledgeDiagramEdge { from:string;to:string }
export function KnowledgeDiagram({
  nodes,edges,selectedId,onSelect,onStageClick,hiddenCount=0,
}:{
  nodes:readonly KnowledgeDiagramNode[];
  edges:readonly KnowledgeDiagramEdge[];
  selectedId?:string|null;
  onSelect:(id:string,anchor:{x:number;y:number})=>void;
  onStageClick:()=>void;
  hiddenCount?:number;
}) {
  const markerId=useId().replace(/[^a-zA-Z0-9-]/g,"");
  const viewportRef=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({w:0,h:0});
  const [view,setView]=useState<Viewport>({x:0,y:0,zoom:1});
  const dragRef=useRef<{px:number;py:number;x:number;y:number;moved:boolean}|null>(null);
  const suppressed=useRef(false);
  const [dragging,setDragging]=useState(false);
  const layout=useMemo(()=>blockLayout(nodes,edges),[nodes,edges]);
  const box=useMemo(()=>({w:layout.width+2*(GRAPH_PAD+20),h:layout.height+2*(GRAPH_PAD+20)}),[layout]);
  const floor=useMemo(()=>fitZoomFor(box,size),[box,size]);
  useEffect(()=>{
    const el=viewportRef.current;
    if(!el||typeof ResizeObserver==="undefined")return;
    const ro=new ResizeObserver(()=>setSize({w:el.clientWidth,h:el.clientHeight}));
    ro.observe(el);return ()=>ro.disconnect();
  },[]);
  useEffect(()=>{
    if(size.w&&size.h)setView(fitGraphView(box,size,floor));
  },[box,size,floor]);
  useEffect(()=>{
    const el=viewportRef.current;
    if(!el)return;
    const wheel=(e:WheelEvent)=>{
      e.preventDefault();
      const rect=el.getBoundingClientRect();
      const dy=e.deltaMode===1?e.deltaY*16:e.deltaY;
      setView(v=>zoomedGraphView(v,Math.exp(-dy*.0015),floor,
        {x:e.clientX-rect.left,y:e.clientY-rect.top},box,size));
    };
    el.addEventListener("wheel",wheel,{passive:false});
    return ()=>el.removeEventListener("wheel",wheel);
  },[floor,box,size]);
  const zoom=(factor:number)=>setView(v=>zoomedGraphView(v,factor,floor,{x:size.w/2,y:size.h/2},box,size));
  const fit=()=>{if(size.w&&size.h)setView(fitGraphView(box,size,floor));};
  const down=(e:ReactPointerEvent<HTMLDivElement>)=>{
    if(e.button!==0||view.zoom<=floor+1e-9||(e.target as Element).closest("button"))return;
    suppressed.current=false;
    dragRef.current={px:e.clientX,py:e.clientY,x:view.x,y:view.y,moved:false};
    e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);
  };
  const move=(e:ReactPointerEvent<HTMLDivElement>)=>{
    const d=dragRef.current;if(!d)return;
    if(Math.abs(e.clientX-d.px)+Math.abs(e.clientY-d.py)>4)d.moved=true;
    setView(v=>({...v,x:d.x+e.clientX-d.px,y:d.y+e.clientY-d.py}));
  };
  const end=(e:ReactPointerEvent<HTMLDivElement>)=>{
    suppressed.current=!!dragRef.current?.moved;
    dragRef.current=null;setDragging(false);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return <div ref={viewportRef}
    data-testid="home-knowledge-diagram"
    className={`dark absolute inset-0 overflow-hidden bg-[#211f1e] touch-none select-none ${dragging?"cursor-grabbing":"cursor-grab"}`}
    onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
    onClick={e=>{
      if(suppressed.current){suppressed.current=false;return;}
      const target=e.target;
      if(!(target instanceof Element))return;
      const group=target.closest<SVGGElement>('[data-testid^="plan-node-"]');
      if(group) {
        const id=group.getAttribute("data-testid")!.slice("plan-node-".length);
        if(nodes.some(n=>n.id===id)){
          const rect=e.currentTarget.getBoundingClientRect();
          onSelect(id,{x:e.clientX-rect.left,y:e.clientY-rect.top});
        }
      } else if(target.closest("svg")) onStageClick();
    }}>
    {nodes.length>0&&<div className="absolute left-0 top-0 origin-top-left"
      style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.zoom})`}}>
      <PlanDiagram nodes={nodes} edges={edges} markerId={markerId}
        pad={GRAPH_PAD+20} naturalSize
        statusOf={id=>id===selectedId?"current":"visited"}
        glowId={selectedId??null}/>
    </div>}
    {hiddenCount>0&&<div className="pointer-events-none absolute bottom-3 left-3 max-w-72 rounded-lg border border-white/20 bg-[#282624]/95 p-2 text-xs text-white/75">
      Showing {nodes.length} connected propositions; {hiddenCount} more are available in Atlas mode. Search to narrow the diagram.
    </div>}
    <div className="pointer-events-none absolute bottom-3 right-3 flex gap-1">
      <button type="button" aria-label="Diagram zoom out" onClick={()=>zoom(1/1.25)}
        className="pointer-events-auto rounded-md border border-white/20 bg-[#272525] p-2 text-white"><MinusIcon className="size-4"/></button>
      <button type="button" aria-label="Diagram fit" onClick={fit}
        className="pointer-events-auto rounded-md border border-white/20 bg-[#272525] p-2 text-white"><MaximizeIcon className="size-4"/></button>
      <button type="button" aria-label="Diagram zoom in" onClick={()=>zoom(1.25)}
        className="pointer-events-auto rounded-md border border-white/20 bg-[#272525] p-2 text-white"><PlusIcon className="size-4"/></button>
    </div>
  </div>;
}

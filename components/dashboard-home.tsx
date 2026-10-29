"use client";

/**
 * Study desk — the editorial landing surface. All numbers are read from
 * the existing graph/chat APIs; no demo data or new persistence schema.
 * The original GraphView remains available from Home's Atlas control.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ChatListItem, GraphSnapshot } from "@/src/core";

function StudyPrints() {
  return (
    <div className="lh-study-prints" aria-hidden="true">
      <figure className="lh-study-print">
        <div className="lh-study-print-meta"><span>FIELD NOTE 07</span><span>GRAPH THEORY</span></div>
        <svg viewBox="0 0 165 205" role="presentation">
          <g className="lh-study-print-lines" fill="none" strokeWidth="1">
            <path d="M23 45L49 26L68 49L23 45L37 81L68 49L91 75L37 81L68 49M91 75L119 47L143 72L91 75L124 106L143 72M23 45L19 127L52 149L84 129L37 81L52 149M84 129L124 106L144 147L106 168L84 129L52 149L79 187L106 168L144 147"/>
            <path d="M68 49L84 129M37 81L124 106" strokeDasharray="3 4"/>
          </g>
          <path className="lh-study-print-accent-path" d="M68 49L91 75L124 106L144 147" fill="none" strokeWidth="2.5"/>
          <g className="lh-study-print-dots" strokeWidth="2">
            {([[23,45],[49,26],[68,49],[37,81],[91,75],[119,47],[143,72],[124,106],[19,127],[52,149],[84,129],[144,147],[106,168],[79,187]] as const).map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i===2||i===7?5:4}/>)}
          </g>
        </svg>
        <figcaption>Connected ideas<span>STUDIES IN STRUCTURE</span></figcaption>
      </figure>
      <figure className="lh-study-print lh-study-print-second">
        <div className="lh-study-print-meta"><span>FIELD NOTE 12</span><span>PROBABILITY</span></div>
        <svg viewBox="0 0 165 205" role="presentation">
          <g className="lh-study-print-lines" fill="none" strokeWidth=".8">
            <path d="M17 180V23M17 180H152"/>
            <path d="M17 45H152M17 90H152M17 135H152M55 23V180M96 23V180M135 23V180" strokeDasharray="2 5"/>
          </g>
          <path className="lh-study-print-accent-path" d="M17 143L29 120L40 135L51 78L62 96L73 68L84 92L95 46L106 69L117 38L128 51L141 26L152 41" fill="none" strokeWidth="2"/>
          <g className="lh-study-print-accent-fill"><circle cx="51" cy="78" r="3"/><circle cx="95" cy="46" r="3"/><circle cx="141" cy="26" r="3"/></g>
          <text x="17" y="199" fontSize="8" fontFamily="monospace" fill="#5c5147">t →</text>
        </svg>
        <figcaption>A wandering path<span>STUDIES IN CHANCE</span></figcaption>
      </figure>
    </div>
  );
}

export function DashboardHome({ onOpenAtlas }: { onOpenAtlas: () => void }) {
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [chats, setChats] = useState<ChatListItem[] | null>(null);
  const read = useCallback(async () => {
    const [graphResult, chatResult] = await Promise.allSettled([
      fetch("/api/graph", { cache: "no-store" }).then(async r => {
        if (!r.ok) throw new Error("graph unavailable");
        return r.json() as Promise<GraphSnapshot>;
      }),
      fetch("/api/chats", { cache: "no-store" }).then(async r => {
        if (!r.ok) throw new Error("sessions unavailable");
        return r.json() as Promise<{ chats: ChatListItem[] }>;
      }),
    ]);
    if (graphResult.status === "fulfilled") setSnapshot(graphResult.value);
    if (chatResult.status === "fulfilled") setChats(chatResult.value.chats);
  }, []);

  useEffect(() => {
    // The dashboard is mounted only while visible. Never poll in the background.
    void read();
    const onRevision = () => void read();
    window.addEventListener("lh:graph-revision", onRevision);
    window.addEventListener("lh:chat-renamed", onRevision);
    return () => {
      window.removeEventListener("lh:graph-revision", onRevision);
      window.removeEventListener("lh:chat-renamed", onRevision);
    };
  }, [read]);

  const propositions = snapshot?.propositions.length;
  const chains = snapshot?.chains.length;
  const notes = snapshot ? Object.keys(snapshot.fileSources ?? {}).length : undefined;
  const teaching = chats?.filter(c => (c.kind ?? "teach") === "teach").length;
  const practice = chats?.filter(c => c.kind === "practice").length;
  const counts = [
    { name: "Propositions", value: propositions },
    { name: "Reasoning chains", value: chains },
    { name: "Teaching sessions", value: teaching },
    { name: "Practice sessions", value: practice },
  ];
  return (
    <div className="lh-study-desk" data-testid="dashboard-home">
      <div className="lh-study-inner">
        <div className="lh-study-hero">
          <div className="lh-study-hero-copy">
            <div className="lh-study-kicker">A SPACE FOR DEEPER THINKING</div>
            <h1>Follow your<br/><em>curiosity.</em></h1>
            <p>A living notebook of lessons, connections and open questions. Pick up a thought or begin somewhere new.</p>
          </div>
          <StudyPrints />
        </div>
        <div className="lh-study-section-head">
          <h2>Your learning, at a glance</h2>
          <span>CONNECTED KNOWLEDGE</span>
        </div>
        <div className="lh-study-metrics" aria-label="Your learning totals">
          {counts.map(c => (
            <div className="lh-study-metric" key={c.name}>
              <strong>{c.value === undefined ? "—" : c.value.toLocaleString()}</strong>
              <span>{c.name}</span>
            </div>
          ))}
        </div>
        <div className="lh-study-bottom">
          <section className="lh-study-panel" aria-label="Recent explorations">
            <div className="lh-study-kicker">PICK UP A THREAD</div>
            <h2>Recent explorations</h2>
            <p>Return to a question you were working through.</p>
            {chats === null ? <span className="lh-study-empty">Loading sessions…</span> :
              chats.length === 0 ? <span className="lh-study-empty">No sessions yet. Your first lesson starts below.</span> :
              chats.slice(0, 3).map(c => (
                <Link key={c.id} href={`/chat/${c.id}`} className="lh-study-session">
                  <span>{c.title}</span><span aria-hidden="true">↗</span>
                </Link>
              ))}
          </section>
          <section className="lh-study-panel" aria-label="Knowledge atlas">
            <div className="lh-study-kicker">YOUR KNOWLEDGE ATLAS</div>
            <h2>Make the connections.</h2>
            <p>Move between related ideas in your saved graph. Every new lesson adds another thread.</p>
            <button className="lh-study-link" type="button" onClick={onOpenAtlas}>Explore your graph <span aria-hidden="true">→</span></button>
            <div className="lh-study-notes"><span>Imported notes</span><strong>{notes === undefined ? "—" : notes.toLocaleString()}</strong></div>
          </section>
        </div>
      </div>
    </div>
  );
}

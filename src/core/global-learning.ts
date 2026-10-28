/** Read-only, cross-session lesson map.
 *
 * A session plan is a coarse learning GOAL map, not the graph of true
 * propositions extracted from teacher prose. Do not conflate the two.
 * Existing native transcripts are authoritative for assessment evidence:
 * nothing is inferred from a "visited" plan marker or a teacher assertion.
 *
 * Identity v1 is deliberately CONSERVATIVE: explicit matching of specific
 * normalized labels. Generic lesson labels remain session-local.
 * Suspected cycles are reported, never silently installed in a DAG.
 */
import type { ChatRecord } from "./contracts/chat.ts";

export interface LearningSource {
  chatId: string;
  chatTitle: string;
  localNodeId: string;
  summary: string | null;
}
export interface LearningEvidence {
  chatId: string;
  toolCallId: string;
  localNodeId: string;
  question: string;
  kind: "check" | "predict" | "explain";
  outcome: "correct" | "incorrect" | "ungraded";
  answeredAt: string | null;
}
export interface LearningConcept {
  id: string;
  title: string;
  sources: LearningSource[];
  evidence: LearningEvidence[];
  correctChecks: number;
  incorrectChecks: number;
  ungradedChecks: number;
}
export interface LearningDependency { from: string; to: string; sessions: string[] }
export interface LearningConflict {
  chatId: string; from: string; to: string;
  reason: "self_after_merge" | "would_create_cycle";
}
export interface GlobalLearningGraph {
  concepts: LearningConcept[];
  dependencies: LearningDependency[];
  conflicts: LearningConflict[];
  sessions: Array<{ id: string; title: string; concepts: number }>;
  /** Prober questions and stale/replaced plan nodes lack a safe binding. */
  unlinkedAnswers: number;
}
const GENERIC = new Set([
  "introduction","overview","basics","foundations","prerequisites","motivation",
  "examples","practice","applications","application","methods","methodology",
  "definition","definitions","main result","theorem","proof","summary",
  "review","core ideas","concepts","problem solving","implementation",
  "intuition","conclusion","extensions","background",
]);
const SAFE_SINGLE = new Set([
  "gradient","divergence","curl","jacobian","hessian","eigenvalues",
  "eigenvectors","integrals","derivatives","covariance","variance",
  "expectation","martingales","brownian motion","convexity","duality",
]);
export function normalizeLearningTitle(s: string): string {
  return s.normalize("NFKC").toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
}
/** Session-scoped fallback for ambiguous labels; no silent wrong merge. */
export function learningIdentity(title: string, chatId: string, localId: string): string {
  const normalized=normalizeLearningTitle(title);
  if(!normalized || GENERIC.has(normalized) ||
      (normalized.split(" ").length===1 && !SAFE_SINGLE.has(normalized)) ||
      /^(?:step|chapter|part|lemma|theorem|section|exercise|question)\s+\d+$/.test(normalized))
    return `local:${encodeURIComponent(chatId)}:${encodeURIComponent(localId)}`;
  return "concept:"+encodeURIComponent(normalized);
}
function values(v:unknown):v is Record<string,unknown> {
  return !!v && typeof v==="object" && !Array.isArray(v);
}
function createsCycle(edges:Map<string,Set<string>>,from:string,to:string):boolean {
  if(from===to)return true;
  const stack=[to],visited=new Set<string>();
  while(stack.length){
    const current=stack.pop()!;
    if(current===from)return true;
    if(visited.has(current))continue;
    visited.add(current);
    for(const next of edges.get(current)??[])stack.push(next);
  }
  return false;
}
export function buildGlobalLearningGraph(records: readonly ChatRecord[]): GlobalLearningGraph {
  const concepts=new Map<string,LearningConcept>();
  const dependencies=new Map<string,LearningDependency>();
  const graphAdj=new Map<string,Set<string>>();
  const conflicts:LearningConflict[]=[];
  const sessions:GlobalLearningGraph["sessions"]=[];
  const sorted=[...records].sort((a,b)=>a.id.localeCompare(b.id));
  let unlinkedAnswers=0;
  const pending: Array<{id:string;evidence:LearningEvidence}> = [];
  for(const record of sorted) {
    const bindings=new Map<string,string>();
    for(const node of record.tree?.nodes??[]) {
      if(!node?.id || !node?.title)continue;
      const globalId=learningIdentity(node.title,record.id,node.id);
      bindings.set(node.id,globalId);
      let concept=concepts.get(globalId);
      if(!concept) {
        concept={id:globalId,title:node.title,sources:[],evidence:[],
          correctChecks:0,incorrectChecks:0,ungradedChecks:0};
        concepts.set(globalId,concept);
      }
      concept.sources.push({chatId:record.id,chatTitle:record.title,
        localNodeId:node.id,summary:node.summary??null});
    }
    if(bindings.size) sessions.push({id:record.id,title:record.title,concepts:bindings.size});
    // Tool-call inputs are the plan-node source of truth; tool results
    // are the graded evidence. Probe questions can bind to conceptId.
    const calls=new Map<string,{nodeId:string;conceptId:string;kind:LearningEvidence["kind"];question:string}>();
    for(const message of record.messages??[]) {
      if(message.role!=="assistant" || !Array.isArray(message.content))continue;
      for(const block of message.content) {
        if(block.type!=="toolCall" || !["quiz","explain","probe","recall"].includes(block.name))continue;
        const args:unknown=block.arguments;
        if(!values(args))continue;
        const nodeId=typeof args.nodeId==="string" ? args.nodeId : "";
        const conceptId=typeof args.conceptId==="string" ? args.conceptId : "";
        if(!nodeId && !conceptId)continue;
        const kind=args.type==="predict" ? "predict" :
          (block.name==="explain"||block.name==="recall") ? "explain" : "check";
        calls.set(block.id,{nodeId,conceptId,kind,question:typeof args.question==="string"?args.question:""});
      }
    }
    const seenResults=new Set<string>();
    for(const message of record.messages??[]) {
      if(message.role!=="toolResult" || !["quiz","explain","probe","recall"].includes(message.toolName))continue;
      // A replay or duplicate transport event must not inflate mastery
      // evidence. One call id is one assessment observation per session.
      if(seenResults.has(message.toolCallId))continue;
      seenResults.add(message.toolCallId);
      const answer=message.details;
      if(!values(answer) || answer.dismissed===true)continue;
      const call=calls.get(message.toolCallId);
      if(!call || (!bindings.has(call.nodeId) && !call.conceptId)) {unlinkedAnswers++;continue;}
      const identity=bindings.get(call.nodeId) || call.conceptId;
      const outcome=answer.correct===true ? "correct" :
        answer.correct===false ? "incorrect" : "ungraded";
      const evidence:LearningEvidence={
        chatId:record.id,toolCallId:message.toolCallId,localNodeId:call.nodeId,
        question:call.question,kind:call.kind,outcome,
        answeredAt:typeof answer.answeredAt==="string"?answer.answeredAt:null,
      };
      pending.push({id:identity,evidence});
      // Assessment belongs to a real plan objective or an explicit
      // canonical lookup. Identity resolution waits until every session
      // has been scanned, so source ordering cannot drop early probes.
    }
    for(const edge of record.tree?.edges??[]) {
      const from=bindings.get(edge.from),to=bindings.get(edge.to);
      if(!from||!to)continue;
      if(from===to) {
        conflicts.push({chatId:record.id,from,to,reason:"self_after_merge"});
        continue;
      }
      const key=JSON.stringify([from,to]);
      const existing=dependencies.get(key);
      if(existing) {
        if(!existing.sessions.includes(record.id))existing.sessions.push(record.id);
        continue;
      }
      if(createsCycle(graphAdj,from,to)) {
        conflicts.push({chatId:record.id,from,to,reason:"would_create_cycle"});
        continue;
      }
      dependencies.set(key,{from,to,sessions:[record.id]});
      const outs=graphAdj.get(from);
      if(outs)outs.add(to);else graphAdj.set(from,new Set([to]));
    }
  }
  for(const {id,evidence} of pending) {
    const concept=concepts.get(id);
    if(!concept) { unlinkedAnswers++; continue; }
    concept.evidence.push(evidence);
    if(evidence.kind!=="predict") {
      if(evidence.outcome==="correct")concept.correctChecks++;
      else if(evidence.outcome==="incorrect")concept.incorrectChecks++;
      else concept.ungradedChecks++;
    }
  }
  return {
    concepts:[...concepts.values()].sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id)),
    dependencies:[...dependencies.values()].sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to)),
    conflicts,sessions,unlinkedAnswers,
  };
}

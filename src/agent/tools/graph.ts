import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { serverExecute } from "../tool-execute.ts";
import { getGraph, graphSessionIndex, graphSessionPropositions } from "../../core/graph.ts";
import { buildGlobalLearningGraph } from "../../core/global-learning.ts";
import type { ChatStore, GraphStore } from "../../core/ports.ts";

/**
 * THE PROBER'S GRAPH TOOLS (wave 7, owner-locked 2026-09-23): context
 * injection is dead — zero configuration beyond chat models. The prober
 * reads the learner's persistent knowledge map through two tools instead,
 * replacing the old injected block with on-demand eyes.
 *
 * Names + levels + dating ONLY — no statement text, no session contents
 * (owner ruling: the map's ORGANIZATION is the prober's business, its
 * prose is not). The data comes from Platform's pure core seams
 * (graphSessionIndex / graphSessionPropositions) over the same ports the
 * snapshot reads, so the prober and the learner's graph view can never
 * disagree.
 *
 * Registered on the prober ONLY when the settings gate opens
 * (graphToolsEnabled — the graph master switch AND the agent.graphTools
 * toggle); the composition root decides, the factory just receives the
 * store (absent = the gate is closed, no map tools — tests drive this).
 */

/** What the graph tools close over: the stores the session views read. */
export interface GraphToolContext {
	chatStore: ChatStore;
	graphStore: GraphStore;
}

const listSessionsInput = Type.Object({});

const listPropositionsInput = Type.Object({
	session: Type.String({
		minLength: 1,
		description: "The session's id exactly as list_sessions reported it (a chat id or a notes source id)",
	}),
});

export function proberGraphTools(ctx: GraphToolContext): Record<string, AgentTool<any>> {
	const deps = { chatStore: ctx.chatStore, graphStore: ctx.graphStore };
	return {
		list_learning_concepts: {
			name: "list_learning_concepts",
			label: "list_learning_concepts",
			description:
				"Search canonical cross-session LESSON concepts and previous answer evidence before probing. " +
				"Input a specific concept term (e.g. 'divergence') or omit query for an overview. " +
				"Returns exact concept IDs; if you pose a probe/recall question directly testing one of these concepts, " +
				"set its optional conceptId to the exact listed ID. Never guess an ID and never attach a broad " +
				"question to a narrow node. Historical probe results without concept IDs remain unlinked.",
			parameters: Type.Object({
				query: Type.Optional(Type.String({description:"Optional search term for a canonical learning objective."})),
			}),
			execute: serverExecute("list_learning_concepts", Type.Object({
				query: Type.Optional(Type.String()),
			}),async ({query}) => {
				const records=ctx.chatStore.listChats().map(s=>ctx.chatStore.getChat(s.id)).filter(
					(r):r is NonNullable<typeof r>=>r!==null,
				);
				const graph=buildGlobalLearningGraph(records);
				const term=(query??"").trim().toLocaleLowerCase("en-US");
				const matches=graph.concepts.filter(c=>
					!term||c.title.toLocaleLowerCase("en-US").includes(term)||
					c.sources.some(s=>(s.summary??"").toLocaleLowerCase("en-US").includes(term)));
				if(!matches.length)return "No matching canonical lesson concepts. Probe normally, without conceptId.";
				return matches.slice(0,25).map(c=>
					`${c.id} :: ${c.title} | ${c.correctChecks} correct / ${c.incorrectChecks} incorrect / ${c.ungradedChecks} ungraded check(s) in ${c.sources.length} lesson(s)`
				).join("\\n")+(matches.length>25?"\\nRefine query for more.":"");
			}),
		},
		list_sessions: {
			name: "list_sessions",
			label: "list_sessions",
			description:
				"List the sessions of the learner's persistent knowledge graph — every chat or imported-notes file that ever contributed a proposition, most recent first. The map is organized into birth-session clusters (propositions grouped by the session they were first learned in), and session names are those clusters' labels. " +
				"Each line: the session's name, kind (chat/file), how many propositions were born in it, its dates, and its id — use that id with list_propositions. " +
				"Reading this first shows what he has already covered and when, before you probe anything.",
			parameters: listSessionsInput,
			execute: serverExecute("list_sessions", listSessionsInput, async (): Promise<string> => {
				const sessions = graphSessionIndex(deps);
				if (sessions.length === 0) return "The knowledge graph is empty — no session has contributed propositions yet.";
				const lines = sessions.map((s, i) =>
					`${i + 1}. ${s.name} (${s.kind}, ${s.propositions} proposition${s.propositions === 1 ? "" : "s"}, ` +
					`born ${s.createdAt ?? "unknown date"}${s.updatedAt ? `, last active ${s.updatedAt}` : ""}) — id: ${s.id}`,
				);
				return `${sessions.length} session(s) in the knowledge graph, most recent first:\n${lines.join("\n")}`;
			}),
		},
		list_propositions: {
			name: "list_propositions",
			label: "list_propositions",
			description:
				"List the propositions BORN in one knowledge-graph session — what was covered there. " +
				"Names only — no statement text, no session contents (owner ruling 2026-09-23: the map's ORGANIZATION is your business, its prose is not).",
			parameters: listPropositionsInput,
			execute: serverExecute("list_propositions", listPropositionsInput, async ({ session }): Promise<string> => {
				const propositions = graphSessionPropositions(deps, session);
				if (propositions.length === 0) {
					return `No propositions born in session "${session}". Call list_sessions for the current ids.`;
				}
				const lines = propositions.map((p) => `- ${p.name}`);
				return `${propositions.length} proposition(s) covered in this session:\n${lines.join("\n")}`;
			}),
		},
	};
}

// ─── the auditor's graph tools (2026-09-27 relink) ───────────────────────────

/**
 * THE AUDITOR'S TOOLSET — the extraction auditor explores the graph to
 * place new propositions instead of receiving it injected (owner ruling
 * 2026-09-27: a full-graph dump bloats context as the graph grows; the
 * auditor looks up identity candidates itself). Auditor-specific
 * versions, deliberately different from the prober's:
 *
 *   find              glob over node names + statements + aliases — the
 *                     identity workhorse; returns id + name + statement
 *                     (statement text is ESSENTIAL for identity work,
 *                     unlike the prober's names-only rule).
 *   list_sessions     the birth-session index, no timestamps.
 *   list_propositions full proposition text (same reasoning as find).
 *
 * No timestamps anywhere: identity work needs content, not chronology.
 * Read-only, pure core seams, same ports the snapshot reads.
 */

/** Glob match — `*` spans anything, case-insensitive. `*needle*` is the
 *  expected shape; a bare term gets implicit surrounding stars. */
function globMatch(pattern: string, text: string): boolean {
	const raw = pattern.includes("*") ? pattern : `*${pattern}*`;
	const re = new RegExp(
		`^${raw.replace(/[.*+?^${}()|[\]\\]/g, (ch) => (ch === "*" ? "[\\s\\S]*" : `\\${ch}`))}$`,
		"i",
	);
	return re.test(text);
}

export function auditorGraphTools(ctx: GraphToolContext): Record<string, AgentTool<any>> {
	const deps = { chatStore: ctx.chatStore, graphStore: ctx.graphStore };
	const findInput = Type.Object({
		query: Type.String({
			minLength: 1,
			description: "Glob pattern over node names, statements, and aliases — e.g. *will to power*. A bare term gets implicit surrounding *.",
		}),
	});
	return {
		find: {
			name: "find",
			label: "find",
			description:
				"Search the knowledge graph for existing propositions — glob over names, statements, and aliases. " +
				"Returns each match's id, name, full statement, and the session(s) it was born in (a list_propositions id). " +
				"This is how you decide whether a new proposition IS an existing one: search its key words, its synonyms, its phrasings.",
			parameters: findInput,
			execute: serverExecute("find", findInput, async ({ query }): Promise<string> => {
				const nodes = getGraph(deps.graphStore).nodes;
				const hits = nodes.filter(
					(n) => globMatch(query, n.name) || globMatch(query, n.statement) || n.aliases.some((a) => globMatch(query, a)),
				);
				if (hits.length === 0) return `No existing proposition matches "${query}".`;
				// BORN-IN POINTER (owner, 2026-09-29): a hit names its birth
				// session(s) — find results now compose with list_propositions
				// (read the whole session the hit came from) instead of being
				// dead ends. Legacy no-provenance nodes name none.
				const lines = hits.map((n) => {
					const born = [...new Set(n.provenance.map((pt) => pt.chatId))];
					return (
						`- ${n.id} :: ${n.name}\n  statement: ${n.statement}` +
						(born.length > 0 ? `\n  born in: ${born.join(", ")}` : "")
					);
				});
				return `${hits.length} match(es):\n${lines.join("\n")}`;
			}),
		},
		list_sessions: {
			name: "list_sessions",
			label: "list_sessions",
			description:
				"List the knowledge graph's birth sessions — every chat or imported-notes file that ever contributed a proposition. " +
				"Each line: name, kind, proposition count, id. Use the id with list_propositions to see what a session covered.",
			parameters: Type.Object({}),
			execute: serverExecute("list_sessions", Type.Object({}), async (): Promise<string> => {
				const sessions = graphSessionIndex(deps);
				if (sessions.length === 0) return "The knowledge graph is empty — no session has contributed propositions yet.";
				const lines = sessions.map((s, i) => `${i + 1}. ${s.name} (${s.kind}, ${s.propositions} proposition${s.propositions === 1 ? "" : "s"}) — id: ${s.id}`);
				return `${sessions.length} session(s):\n${lines.join("\n")}`;
			}),
		},
		list_propositions: {
			name: "list_propositions",
			label: "list_propositions",
			description:
				"List the propositions BORN in one session, with FULL statement text — the content-level view for identity work " +
				"(deciding whether a new proposition is really one of these).",
			parameters: listPropositionsInput,
			execute: serverExecute("list_propositions", listPropositionsInput, async ({ session }): Promise<string> => {
				const propositions = graphSessionPropositions(deps, session);
				if (propositions.length === 0) return `No propositions born in session "${session}". Call list_sessions for the current ids.`;
				const nodes = new Map(getGraph(deps.graphStore).nodes.map((n) => [n.id, n]));
				const lines = propositions.map((p) => {
					const node = nodes.get(p.nodeId);
					return `- ${p.nodeId} :: ${p.name}\n  statement: ${node?.statement ?? "(unknown)"}`;
				});
				return `${propositions.length} proposition(s) born in this session:\n${lines.join("\n")}`;
			}),
		},
	};
}

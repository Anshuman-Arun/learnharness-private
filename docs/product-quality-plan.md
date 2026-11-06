# Product quality rebuild

Approved direction: retain LearnHarness's current dark, restrained visual language; minimal labels and appropriate motion; consolidate/remove weak features; build a comprehensive PDF source DAG independently from mastery. This replaces the earlier feature-count target. Existing source/session/training data must remain readable. Nothing merges to main automatically.

## Quality baseline and acceptance

A passing endpoint or screenshot is insufficient. For each workflow, use it at a realistic pace, inspect its screen, exercise keyboard-only and narrow layouts, and test the failure/recovery path. Shared controls must have consistent typography, caret height, spacing, selection, disabled states and subtle keyboard focus. No multicolored dashboard, descriptor paragraphs on every panel, default-looking highlighted boxes, or decorative metrics. Motion is brief and respects reduced motion.

## Product decisions by existing feature

| Existing area | Decision | Finished experience / acceptance |
|---|---|---|
| Training dashboard | Rebuild as one workbench | Resume the actual current task; compact groups for practice, workspace and study. No ten-card menu, duplicated descriptions or invented mastery counts. Clear empty states. |
| Arithmetic | Keep as a dedicated speed tool | Persistent keyboard focus across every answer and network response; automatic correct-answer progression; no network round-trip between mental problems; recover unsaved progress, honest timing/score, clean presets and a useful post-round error/latency review. Validate rapid consecutive input under delayed/failed requests. |
| Estimation | Fold into interview practice | Meaningful approximation/odds/decision cases, justified assumptions, calibrated intervals and inspectable references. Remove rote one-number warmups from the main curriculum. |
| Probability lab | Fold into interview practice | Predict a real conditional-probability/occupancy problem; visualize the exact model and experimental outcomes; inspect denominators and uncertainty. A simulation should test a hypothesis, not just animate random trials. |
| Optimal stopping | Keep inside interview practice | A complete decision exercise with a clear payoff/cost/horizon, decision replay and intelligible backward induction. Policy comparison belongs after an attempt, not in a setup-form wall. |
| Timed OA | A mode of interview practice | Curated transferable problems, sensible sections, useful navigation and flags, drafts, a firm deadline, delayed solutions, reasoning debrief and direct gap capture. No repetitive template set posing as an interview benchmark. |
| Mistake notebook + spaced retrieval | Consolidate as Review | One due queue and contextual correction flow. Preserve the source attempt, require recall before answers, support original/variant retry, and expose scheduling rationale on demand. No huge candidate list or manual-entry form by default. |
| Study sprints | Rebuild as study plans | Keep worthwhile bounded topics, but replace shallow exit items with derivation, counterexample, transfer and implementation tasks. Connect a milestone to an actual teaching/practice session and its source concepts. Time/checkmarks never imply mastery. |
| C++ editor + runner + judge | One code workspace | Full-height coherent editor/problem/test/output layout; restrained Monaco theme/caret/selections; predictable files/drafts/save; clickable diagnostics and source-bound test results. Retain actual container isolation and cancellation. Replace trivial challenge content with substantial quant-coding tasks and edge cases. |
| Scratchpad + iPad | One scratch workspace | Match the surrounding theme, preserve question context and editable pages, put pairing/setup out of the way until needed, show saving/offline state concisely, and send a deliberate snapshot with reasoning/code. Retain reconnect/sequence/revocation protections. |
| Teaching + multimodal evidence | Keep integrated | Guided/Explain remains reversible. Evidence includes sketches, code and dictated text in the real agent loop. Improve the attempt-first learning flow and verify question quality rather than rewarding an answer-only reveal. |
| PDF / chapter ingestion | Build source-first study workflow | Real PDF decoding, complete selected-page accounting, durable/resumable processing, page-backed nodes and validated dependencies, direct source inspection, explicit gaps and separate learning evidence. Never pass PDF bytes through File.text(). |

## PDF → source DAG contract

- Save the original PDF with content identity and a page inventory. Allow a whole paper or a selected chapter/page range. Keep text, headings, mathematical content and page boundaries; render/inspect pages with missing or unreliable text instead of silently treating them as empty.
- Extract definitions, concepts, results, assumptions, proof steps, worked examples and exercises with source citations. Cover every selected page and show unprocessed/ambiguous material. “Complete” means the processing/coverage checks finished, not a promise that a model cannot miss information.
- Validate schema, page references, citation evidence, node identities and acyclic prerequisite relations. Keep dependency, entailment and section organization distinct. Preserve assumptions in result statements. Flag conflicting or unsupported output rather than inventing links.
- Persist progress per chunk/page and source fingerprint. Pause/retry/restart must not discard finished work or silently duplicate it. Changed files get a new source identity; source failures remain visible.
- Provide a source library, readable outline, focused DAG, search and a node inspector with page-backed evidence. Selecting a node can launch study/practice. A source map is not a claim about learner knowledge; mastery/review evidence stays separate.
- Retain the existing reasoning-chain graph semantics. Imported source prerequisites must not be mistaken for logical entailment or proof of mastery.

## Upstream review

Inspect/adapt small licensed changes rather than blindly merging a newer application into this fork. Relevant upstream PRs: #353 (PDF line breaks), #527 (resumable imports), #544 (type/size validation), #369 (course planning/DAG validation), #449 (worksheets), #442 (question quality gate), #360 (keep a question visible while reading), #505 (answer-length cues). Assess #487 (inline side questions) and #486 (scheduled practice) as recommendations after the core workflows are sound. Record exact provenance for code reused.

## Implementation order

1. Shared UI/control foundation and arithmetic interaction repair; audit screenshots and sustained keyboard use.
2. Source/PDF ingestion and citation-backed DAG, with a real document fixture and resume/failure checks.
3. Consolidated dashboard, interview practice and review; remove weak content rather than restyling it.
4. Code/scratch workspace polish and substantial study plans; connect these to source-backed learning.
5. Complete visual, keyboard, touch, accessibility, runtime and regression pass. Open a reviewable PR with honest remaining live-model/physical-iPad limitations; keep main unchanged.

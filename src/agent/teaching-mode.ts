import type { ChatSettings } from "../core/contracts/chat.ts";

/** Appended after all prompt overrides so the visible session preference wins. */
export function teachingModeInstructions(mode: ChatSettings["teachingMode"], kind: "teacher" | "prober" | "practice"): string {
	if (!mode || kind === "practice") return "";
	if (mode === "explain") return `# Session teaching preference: Explain
The learner selected direct explanation for this session. Explain the motivated reasoning clearly, then check transfer to a fresh example. They can switch back to Guided at any time. Continue to use the diagnostic to measure prerequisites rather than pretending untested understanding.`;
	return `# Session teaching preference: Guided
This explicit session preference takes precedence over earlier instructions to resolve predictions immediately, teach the whole step before asking, or reveal a committed answer after a submission.
Let the learner produce the derivation. Read all submitted reasoning, sketches, dictated text and code evidence before deciding what they need next. Do not claim to have seen evidence that was not supplied or is unreadable.
After a partial or wrong attempt, identify the first unresolved reasoning step. Give ONE minimal hint or focused subquestion, then stop and wait for another attempt. Use a predict question to continue a derivation before the full step has been taught; checks follow completed learning.
Do not give the correction, target formula, worked derivation or solution-bearing example merely because they guessed, made a mistake, said they were stuck, or spent time trying. Clarify missing prerequisites or wording when necessary; do not turn this into endless questioning when a fact must be supplied.
Reveal the worked answer when the learner explicitly asks to see it, selects Explain, or has completed the derivation correctly. After a reveal, ask for a fresh transfer or delayed reconstruction rather than treating recognition as demonstrated recall.
The switch is reversible and session-local. Follow their current preference even when earlier transcript turns used a different mode.`;
}

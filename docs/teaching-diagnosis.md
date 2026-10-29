# Early solution reveal: diagnosis and session control

The current source supports the reported experience. This is a code audit, not a measurement of a particular learner's sessions or a claim of improved retention.

- `teacher/20-teaching.md` permits exposition based on inferred energy and says to re-teach after a wrong answer.
- `teacher/28-predictions.md` requires resolving a prediction immediately with the actual answer and its reasoning. One prediction therefore becomes an explanation rather than a sequence of derivation attempts.
- `AnsweredCard` marks the correct multiple-choice option on submission and shows the complete committed free-response answer. A prompt-only change cannot prevent that UI disclosure.
- Practice already specifies a minimal hint ladder and fresh-surface retests. Its policy is stronger than the teaching policy, although generative adherence still needs evaluation.

The session toolbar now offers **Guided** and **Explain**. A switch is saved for this session only, remains available during the session and changes the next agent construction. An already-running response keeps its current instructions. Existing sessions retain their original policy until the learner makes a choice. Changing the model does not clear the preference.

Guided appends a session policy after source prompts and custom overrides: inspect the attempt, identify the first unresolved step, give one hint or subquestion and wait. Explicitly asking for the solution or selecting Explain allows explanation. The UI hides unrevealed answer commitments and unselected correct-option markers after incorrect attempts; **Show answer** remains an explicit escape. A completed correct multiple-choice answer can show its result. Practice keeps its existing hint doctrine.

Regression checks cover mode persistence and reversal, model preservation, prompt composition order, hidden answers and actual reveal interaction. These deterministic checks establish transport and UI behavior; they do not prove an LLM follows the policy or improves learning. Evaluate real teaching with wrong, partial, stuck, correct, and explicit-reveal attempts, then use unseen transfer and delayed reconstruction to assess learning.

Multimodal follow-up: typed text, dictation transcripts, submitted sketch snapshots and selected code/run reports must enter the same question-linked evidence record and the provider's real message content. A UI thumbnail, filename or tool `details` payload alone is insufficient. Preserve the distinction between authored code, observed compiler output and the learner's interpretation; do not automatically treat a sketch as a final answer.

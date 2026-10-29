# Quant training

Open **Quant training** in the sidebar, then **Mental arithmetic**. No provider key is needed for a round. Select operations, operand ranges and a duration, then answer with Enter. A wrong attempt stays on the current question. End a round explicitly or let its original deadline expire; reloading resumes the same seeded question and deadline.

Rounds and every attempt are saved under `LH_DATA_DIR/training/arithmetic/`. Results show correct answers, accuracy across submissions, correct answers per minute and median successful solve times by operation. A successful solve's latency includes time spent on earlier wrong attempts for that question. Scores are local practice evidence, not a public anti-cheat ranking or a claim of interview readiness.

The API computes questions and verdicts from persisted settings and a seed. Stale submissions cannot count the same completed question twice. Future-version records are refused rather than overwritten. Storage uses atomic file replacement and the app's single-process store model.

Question generation is adapted from [YYZ-CR/zetamac-trainer](https://github.com/YYZ-CR/zetamac-trainer), revision `e81041507c69a8b3154be3cb3f85c0ac3fd7ae34`, `js/game.js`, under MIT. The copyright and permission notice is retained in `third-party/zetamac-trainer-LICENSE`. This fork reuses inverse subtraction and exact division with a small divisor, and adds deterministic per-question seeds and LearnHarness-local persistence. No upstream authentication, analytics service or database is required.

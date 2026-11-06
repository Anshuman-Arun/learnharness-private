# Product quality overhaul

This replaces the earlier feature-count target with the approved consolidation and source-first study workflow. The original 15 feature PRs and validation PR remain the base stack; nothing is merged to main.

## What changed

- A restrained workbench replaces the long card menu. Interview practice combines timed questions, calibration, probability experiments and stopping decisions. Review combines recall and the notebook. Existing deep links and records remain readable.
- Arithmetic advances locally on a correct answer without disabling or remounting the field. Ordered, idempotent batches retain keyboard timestamps; delayed requests cannot steal focus. Recovery retries, local export and an explicit continue-without-saving action prevent an irrecoverable draft from locking practice.
- Calibration now emphasizes fleet failure risk, posterior odds, occupancy, birthdays and Fermi modelling. Rote multiplication/root/log exercises leave its menu. New timed exams use a versioned reasoning bank; historical attempts keep their original generator. Exact distributions have a visual comparison, and stopping debriefs have an interactive Bellman inspector.
- Twelve bounded study plans add substantial derivation, counterexample, transfer and implementation assessments. Scalar checks are explicitly supporting checks, not a mastery assessment. The topics include indicators, exponential races, absorbing chains, stopping, Beta-Binomial prediction, concentration, variance reduction, Gaussian conditioning, replication, streaming C++ and calibration/value of information.
- The code workspace places the problem beside Monaco and separates run/test, challenge and discussion tools. Keyboard run/save, file tools, diagnostic navigation and frozen run evidence remain coherent. New rolling-median and maximum-drawdown challenges include adversarial edge cases.
- Scratch uses the dark canvas theme, hides pairing detail until needed, and preserves explicit snapshot handoff. Existing scoped pairing, offline scene recovery, generation/sequence isolation and Windows helpers remain in place.
- Shared fields, focus indicators, caret styling, typography, selections and motion are subdued. Small browser screens use overlay navigation instead of squeezing content beside a desktop sidebar.

## PDF → source DAG

`/sources` accepts actual PDFs and preserves their original bytes under a content identity. Select a paper or chapter, inspect rendered pages, then build the map using configured strong/vision models. Existing Extract files routes PDFs into Sources instead of calling `File.text()` on PDF bytes.

Processing accounts for each selected page and text block. A native image is supplied for scanned/visual/math-heavy pages. A second model pass audits coverage. Schema validation, exact text citations, page membership, node identity, coverage accounting and cycle checks gate each durable chunk. Pause, interruption, retry and additional page selection retain completed work. Unresolved blocks remain explicit and can be retried. Page coverage and reading warnings are inspectable.

The source view includes a searchable outline, focused DAG, original page and cited inspector. Study stages the precise concept, prerequisites, quotes and visual page where needed into a reversible Guided session. Source prerequisites do not enter the existing reasoning-chain graph or imply learner mastery. Concepts remain “Not assessed” until learning is assessed separately.

“Map ready” means processing and coverage checks completed. It is not a proof of semantic completeness. Text verification checks a quote's presence, not the truth of every claim; visual transcriptions are labelled unverified. No model can guarantee that every concept was extracted.

## Verification

- Full repository regression: **1,989 passed**. Typecheck, ESLint and production build passed.
- Native decoding/rendering of an original four-page mathematical PDF, wrong-page/invented citation rejection, missing-block and cycle rejection, two-pass native-image delivery, failed-chunk resume without duplicates, abort without commit and targeted gap retry.
- Independent enumeration checks for conditional sample spaces and stopping values; legacy exam stability.
- Real Docker-isolated C++ solutions for all five challenges, incorrect-example hardcoding rejection and hidden-output redaction.
- Standalone production browser suite: **15 passed**, covering teaching-mode reversal, rapid arithmetic input under a two-second delayed request, PDF/chapter reload and native rendering, deterministic fixture DAG navigation/study handoff, commit-before-reveal, drafts, notebook/recall scheduling, code execution/judging and tablet touch recovery.
- Desktop and 390px browser screenshots inspected; narrow-layout overflow checked for dashboard, interview, code, review, sources and scratch. The mobile audit found and fixed the desktop-sidebar overflow.

The deterministic DAG fixture verifies pipeline/UI contracts, not model intelligence. This cloud environment has no configured provider key/model slots, so live-model semantic coverage on a new paper remains unverified. Configure strong/vision in Settings and evaluate a representative chapter before treating extraction quality as established.

Tablet verification uses touch/pressure emulation against the real HTTPS companion, including offline reload, stale acknowledgments after re-pairing, isolation between pads, text, PC reclaim and snapshot handoff. A physical Windows PC/iPad/Apple Pencil check is still needed for certificate installation, Safari-specific pen behavior and end-to-end latency. See the existing [iPad guide](ipad-companion.md).

## Upstream

See [the upstream review](upstream-quality-review.md) for exact reviewed heads, adapted code and recommendations. Semantic question verification and a persistent teaching worksheet are recommended follow-ups, not falsely listed as shipped ports.

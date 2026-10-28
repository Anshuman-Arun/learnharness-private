# Pre-merge validation

The 15 feature PRs are open as drafts (#8–#22). [Validation PR #23](https://github.com/Anshuman-Arun/learnharness-private/pull/23) is stacked on the final feature branch. Main remains unchanged. Keep the reconnect/Windows fixes with the feature stack before approving a merge.

## Issues found and fixed

1. **Old tablet frames could survive a pairing change.** A failed frame remained in memory after disconnect; a delayed response could also change the sequence counter of a later pairing. The client now clears scheduled/pending state, aborts the previous request and checks a pairing generation before accepting responses. Resume requests use the same guard. The production-browser regression fails against the original client and passes with the fix.
2. **Two PC tabs could create concurrent writers.** Both requests could pass the active-lease check before the HTTPS create request completed. A per-pad in-flight reservation now permits one pairing; a real concurrent HTTPS test verifies one success and one rejection.
3. **Windows font fallback matching missed native backslashes.** The esbuild plugin's path matcher only handled POSIX separators. The shared matcher now accepts both separators, with a regression testing actual Windows and POSIX package paths and rejecting unrelated packages.

## Local evidence

- `npm test`: **1,977 passed**, no failures/skips.
- `npm run typecheck` and `npm run lint`: passed.
- Optimized production build: passed after font access was enabled.
- `scripts/build-server.mjs` plus `scripts/smoke-server.mjs`: the supported standalone bundle boots and serves root/settings/models/graph successfully, with its existing payload checks.
- Seven real Docker runner tests passed: multifile compilation/stdin/cases, compile failures, filesystem/privilege isolation, infinite loops/output limits, sanitizers, cancellation/authentication and cleanup.
- Certificate-verified HTTPS tests passed, including two simultaneous pairing requests, scope enforcement, replay/reconnect, revocation and static-path boundaries.
- The complete production-browser suite passed **11 scenarios plus its parent test (12 reported tests), with no skips**. A subsequent targeted portrait/landscape tablet run passed; its other ten scenarios were explicitly skipped for that targeted run.

| Feature(s) | Additional browser/API checks |
|---|---|
| Teaching toggle | Guided → reload → Explain, persisted session setting |
| Arithmetic | Wrong then correct attempt, stale-index rejection, stopped-round reload |
| Estimation | Invalid interval rejection, hidden pre-commit reference, persisted review |
| Probability | Pause at a batch boundary; reload preserves exact completed count |
| Stopping | Forced final acceptance, delayed debrief, policy comparison |
| Timed OA | Unsaved answer/flag reload, navigation save, post-finish write rejection |
| Notebook | Saved correction → successful retry → demonstrated proof; original answer retained |
| Retrieval | Incorrect committed answer overrides an Easy rating |
| Sprints | Unsaved notes survive timer changes; exit drafts survive reload; delayed rubrics |
| C++ workspace/runner/judge | Revision conflict, frozen source/stdout, real hidden-check failure/redaction, tutor evidence handoff |
| Scratchpad/iPad/evidence | Pressure-bearing touch strokes, portrait/landscape fit, offline reload/replay, cross-pad isolation, delayed acknowledgment after re-pair, PC reclaim with helper down, math-text/font export, PNG capture staged in session |

The default suite also exercises native image/code/dictation-transcript transport through an injected agent provider, answer-reveal behavior, exact probability/Bellman math, calibration, scheduler boundaries, retry variants and source provenance.

## Reproduce

Use Node 26, Docker with the pinned GCC image, OpenSSL, and Chromium. `LH_CHROMIUM_PATH` can select another installed Chromium/Chrome executable. Run:

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run test:cpp-runner
npm run test:tablet
npm run test:premerge
```

`test:premerge` builds and prepares the standalone bundle, then starts isolated production data/auth, a local compiler service, and a dedicated HTTPS companion with an explicitly trusted temporary test CA. Browser requests use a loopback adapter whose HTTPS upstream still verifies that CA. It makes no paid model calls and does not use the user's session records. The production test app uses loopback port 3107. Failed runs retain a private temporary artifact directory for diagnosis; passing runs clean up. The complete test must run without `LH_BROWSER_CASE`; that optional substring only selects a targeted debugging scenario.

## Limits

Chromium touch/pressure emulation verifies the pointer and transport paths, not physical Apple Pencil palm rejection, iPad Safari behavior or Windows certificate installation. GitHub's standalone matrix provides Windows/macOS/Linux build/startup checks, not hardware validation. Follow `docs/ipad-companion.md` for the physical-device check. Live paid-model vision interpretation, hint-policy adherence and retention gains remain unmeasured. No feature has been merged to main.

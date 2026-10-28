# Reviewed feature-stack validation

**Review snapshot, 2026-10-28:** PRs #8–18 are merged. The remaining feature PRs #19–22 and validation PR #23 remain open. #19 targets main; merge the remaining stack in order and retarget the next PR after its parent lands. Tablet reconnect, pairing-concurrency, and Windows asset fixes are already present from #14.

## Findings fixed in their feature PRs

- **#19, notebook:** recognize exams completed by their deadline without another exam-page visit; classify extreme finite estimates using stable log error; hide reference-derived retry tolerance until commitment; bind demonstrated corrections to the retry's correction revision; prevent text entered during pending mutations from disappearing.
- **#20, retrieval:** reject unsupported review modes without consuming the due card; protect pending recall inputs; preserve server-result-based ratings, stale-write checks, bounded snooze, and duplicate-rating idempotence.
- **#21, sprints:** retain Guided/practice handoff options alongside lossless bounded evidence; clear acknowledged draft values without deleting newer unsaved text; use server-based clocks and the same eight-hour segment calculation for display/persistence; avoid double-counting a backward clock adjustment.
- **#22, judge:** preserve earlier passed cases when a later case exceeds its output limit; keep hidden output redacted; reject invalid sanitizer flags before contacting a runner; exercise the published size/integer boundaries with general solutions.

The cross-stack nullable-score and sprint-handoff compatibility failures introduced during the earlier propagation were corrected and are covered by the exact-layer checks.

## Evidence

- Default suite: **1,997 tests passed**, zero failures/skips.
- Combined production browsers: **27 tests passed**, zero failures/skips. This includes the original workflows and new pending-save, draft-recovery, Guided/practice, and clock-skew regressions.
- Production HTTP checks: **58 requests passed** across notebook, retrieval, sprints, and judge validation. They cover malformed input, immutable answers, stale revisions, source preservation, and concurrent duplicate ratings.
- Real Docker runner: **8 tests passed**, including isolation, diagnostics, time/output limits, cancellation, authentication, cleanup, and partial-case preservation.
- Real Docker judge: **2 workflow tests passed**, covering general collision/top-k/variance solutions, hardcoded/echoing/flooding programs, hidden-output redaction, frozen source, and cancellation without report publication.
- Certificate-verified HTTPS pairing checks passed, including concurrency, scope, replay/reconnect, revocation, and notice assets.
- TypeScript, architectural ESLint, optimized build, supported standalone packaging, and startup smoke checks passed. The existing four dynamic-filesystem tracing warnings remain; the packaged server serves root, models, graph, and settings successfully.
- Exact PR-layer typechecks and feature regressions are required before readiness is reported. Current CI results are linked on each PR.

PR CI is **Windows-only**. It retains full typecheck/test/lint quality checks, native Electron renderer tests, optimized builds, standalone packaging, and native startup. Tests were corrected for Windows file URLs, schema paths, and NTFS permission semantics rather than skipped. Release publishing workflows are separate.

## Reproduce

Use Node 26, Docker with the digest-pinned GCC image, OpenSSL, and Chromium/Chrome. Set `LH_CHROMIUM_PATH` to the browser executable when it is not `/usr/bin/chromium`.

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run test:cpp-runner
npm run test:tablet
npm run test:premerge
```

For the real challenge workflow, start `npm run cpp:runner` in another terminal and run `npm run test:cpp-challenges` with the same runner-token configuration. That test uses temporary training records.

`test:premerge` builds/packages the app and runs all three production-browser suites. Each suite uses disposable data/auth, ephemeral compiler and HTTPS helpers, and a test CA explicitly verified by the HTTPS adapter. The main browser apps use ports 3107 and 3117; the scratchpad-draft suite uses 3108. No paid provider request is made. Passing runs remove their temporary data; failed runs retain artifacts. Run final validation without `LH_BROWSER_CASE`, which is only a targeted debugging filter.

## Limits

Chromium touch/pressure emulation verifies pointer/transport behavior; physical Apple Pencil palm rejection, iPad Safari storage, Windows certificate installation, and live model adherence require separate device/provider testing. Local challenge sources remain inspectable; finite hidden checks do not prove asymptotic complexity or form an anti-cheating boundary. Activity timers and one successful retry do not establish mastery.

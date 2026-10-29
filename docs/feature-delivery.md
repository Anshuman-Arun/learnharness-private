# Feature delivery and review map

All 15 features are implemented on separate pushed branches. They form a stack so each intended PR uses the preceding branch as its base; main has not been changed or merged. The final branch includes the full implementation. **No PRs have been created:** GitHub's API (`api.github.com/graphql`) returns proxy Forbidden in this cloud environment, although Git HTTPS pushes work. PR descriptions and base/head pairs are prepared in [feature-prs.json](feature-prs.json).

| Feature | Head branch | Intended base |
|---|---|---|
| Reversible session Guided / Explain control and answer reveal | `feat/session-teaching-mode` | `main` |
| Question-linked sketch, dictation and code evidence | `feat/multimodal-learning-evidence` | `feat/session-teaching-mode` |
| Zetamac-style arithmetic arena | `feat/quant-arithmetic-arena` | `feat/multimodal-learning-evidence` |
| Persistent multi-file C++ / Monaco workspace | `feat/cpp-workspace` | `feat/quant-arithmetic-arena` |
| Isolated C++20 compiler, runs, cases and sanitizers | `feat/isolated-cpp-runner` | `feat/cpp-workspace` |
| Persistent vector scratchpad and question capture | `feat/session-scratchpad` | `feat/isolated-cpp-runner` |
| Scoped HTTPS Windows/iPad drawing companion | `feat/ipad-companion` | `feat/session-scratchpad` |
| Estimation and confidence calibration | `feat/estimation-confidence` | `feat/ipad-companion` |
| Predict-first probability experiment lab | `feat/probability-experiment-lab` | `feat/estimation-confidence` |
| Finite-horizon optimal stopping and policy comparison | `feat/optimal-stopping-lab` | `feat/probability-experiment-lab` |
| Timed sectioned quant OA simulator | `feat/timed-quant-oa` | `feat/optimal-stopping-lab` |
| Source-linked mistake notebook and targeted retries | `feat/mistake-notebook` | `feat/timed-quant-oa` |
| Spaced retrieval, snooze and explainable intervals | `feat/spaced-retrieval` | `feat/mistake-notebook` |
| Twelve 4.5-hour quant curricula and exit checks | `feat/quant-study-sprints` | `feat/spaced-retrieval` |
| Server-owned C++ challenges and hidden checks | `feat/cpp-challenge-judge` | `feat/quant-study-sprints` |

The original twelve-feature proposal is covered. Teaching control and multimodal evidence address the subsequent feedback; the challenge judge completes the hidden-check portion of the runner scope. No PDF feature was added. More than ten features remain even excluding evidence and drawing work.

## Entry points

Use the sidebar's Quant training entry. `/training` links the arithmetic, estimation, probability, stopping, OA, notebook, retrieval, sprint, C++ and scratchpad workspaces. A session's Scratch work control associates a drawing with that session/current question. Scratch/code/results are staged for review and explicitly submitted with typed or dictated reasoning.

The teaching diagnosis and reversible control are described in [teaching-diagnosis.md](teaching-diagnosis.md). The issue was both prompt policy (immediate prediction resolution/re-teaching) and UI disclosure of committed answers. Guided adds a hint-and-wait policy after overrides and controls answer reveal; Explain and explicit Show answer remain available. Existing sessions keep their prior policy until switched. Already-running replies keep their original instructions.

Quant topics, sequencing and readiness criteria are in [quant-study-sprints.md](quant-study-sprints.md). Windows/iPad trusted HTTPS setup and device limits are in [ipad-companion.md](ipad-companion.md). C++ worker setup is in [cpp-runner.md](cpp-runner.md), with challenge details in [cpp-challenge-judge.md](cpp-challenge-judge.md). Sources and licenses are recorded in [reuse-provenance.md](reuse-provenance.md).

## Verification

- Frozen-lockfile `npm ci` passed and rebuilt local Monaco, Excalidraw and companion assets.
- All **1,976** default tests passed; typecheck and architectural lint passed.
- Seven real Docker runner tests passed for compilation/cases, diagnostics, isolation, timeout/output limits, sanitizers, cancellation/authentication and cleanup.
- The additional real judge integration compiled three general solutions and two deliberately wrong/echoing programs, checking hidden-output redaction and persisted source snapshots.
- Certificate-verified HTTPS integration passed for pairing, page scope, replay/reconnect, notice assets and revocation. Deterministic tests cover expiry, rate limits and offline merging.
- Chromium checks exercised each visible feature, including two-browser drawing sync, code/report and sprint teaching/practice handoffs, reload recovery, delayed references and correction/review workflows.
- Native image/code provider transport was tested through an injected provider. Paid live model behavior and improved retention were not measured. Physical iPad/Pencil pressure/palm rejection and Windows certificate setup require device validation.
- Development HTTP pages work. Production build remains blocked on Google Fonts downloads under the current network policy; it has not passed. Electron packaging was not validated.

## Remaining external action

The saved cloud draft includes the Node/install/start instructions, C++/tablet service instructions, and custom network additions `api.github.com`, `fonts.googleapis.com`, `fonts.gstatic.com`. Review and save the changes in environment settings, then publish the environment. Saving a draft does not apply runtime policy or publish a snapshot.

After that policy is active, verify GitHub API access, create one PR per row with the recorded base/head and prepared description, and attach every created PR to the task. Do not merge automatically. Re-run the font-dependent production build after font access is available. No new GitHub token is required merely because the current proxy denies API traffic.

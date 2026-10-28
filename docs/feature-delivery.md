# Feature delivery and review map

All 15 features are implemented on separate pushed branches and are open as **draft PRs #8–#22**. They form a stack, with each PR based on the preceding feature branch. Main has not been changed or merged. The additional [validation PR #23](https://github.com/Anshuman-Arun/learnharness-private/pull/23), `fix/pre-merge-validation`, carries the tablet reconnect/concurrency/Windows fixes and expanded production regression suite. See [pre-merge-validation.md](pre-merge-validation.md).

Descriptions and base/head pairs are in [feature-prs.json](feature-prs.json).

| Feature | Head branch | Base | PR |
|---|---|---|---|
| Reversible session Guided / Explain control and answer reveal | `feat/session-teaching-mode` | `main` | [#8](https://github.com/Anshuman-Arun/learnharness-private/pull/8) |
| Question-linked sketch, dictation and code evidence | `feat/multimodal-learning-evidence` | `feat/session-teaching-mode` | [#9](https://github.com/Anshuman-Arun/learnharness-private/pull/9) |
| Zetamac-style arithmetic arena | `feat/quant-arithmetic-arena` | `feat/multimodal-learning-evidence` | [#10](https://github.com/Anshuman-Arun/learnharness-private/pull/10) |
| Persistent multi-file C++ / Monaco workspace | `feat/cpp-workspace` | `feat/quant-arithmetic-arena` | [#11](https://github.com/Anshuman-Arun/learnharness-private/pull/11) |
| Isolated C++20 compiler, runs, cases and sanitizers | `feat/isolated-cpp-runner` | `feat/cpp-workspace` | [#12](https://github.com/Anshuman-Arun/learnharness-private/pull/12) |
| Persistent vector scratchpad and question capture | `feat/session-scratchpad` | `feat/isolated-cpp-runner` | [#13](https://github.com/Anshuman-Arun/learnharness-private/pull/13) |
| Scoped HTTPS Windows/iPad drawing companion | `feat/ipad-companion` | `feat/session-scratchpad` | [#14](https://github.com/Anshuman-Arun/learnharness-private/pull/14) |
| Estimation and confidence calibration | `feat/estimation-confidence` | `feat/ipad-companion` | [#15](https://github.com/Anshuman-Arun/learnharness-private/pull/15) |
| Predict-first probability experiment lab | `feat/probability-experiment-lab` | `feat/estimation-confidence` | [#16](https://github.com/Anshuman-Arun/learnharness-private/pull/16) |
| Finite-horizon optimal stopping and policy comparison | `feat/optimal-stopping-lab` | `feat/probability-experiment-lab` | [#17](https://github.com/Anshuman-Arun/learnharness-private/pull/17) |
| Timed sectioned quant OA simulator | `feat/timed-quant-oa` | `feat/optimal-stopping-lab` | [#18](https://github.com/Anshuman-Arun/learnharness-private/pull/18) |
| Source-linked mistake notebook and targeted retries | `feat/mistake-notebook` | `feat/timed-quant-oa` | [#19](https://github.com/Anshuman-Arun/learnharness-private/pull/19) |
| Spaced retrieval, snooze and explainable intervals | `feat/spaced-retrieval` | `feat/mistake-notebook` | [#20](https://github.com/Anshuman-Arun/learnharness-private/pull/20) |
| Twelve 4.5-hour quant curricula and exit checks | `feat/quant-study-sprints` | `feat/spaced-retrieval` | [#21](https://github.com/Anshuman-Arun/learnharness-private/pull/21) |
| Server-owned C++ challenges and hidden checks | `feat/cpp-challenge-judge` | `feat/quant-study-sprints` | [#22](https://github.com/Anshuman-Arun/learnharness-private/pull/22) |

The original twelve-feature proposal is covered. Teaching control and multimodal evidence address the subsequent feedback; the challenge judge completes the hidden-check portion of the runner scope. No PDF feature was added. More than ten features remain even excluding evidence and drawing work.

## Entry points

Use the sidebar's Quant training entry. `/training` links the arithmetic, estimation, probability, stopping, OA, notebook, retrieval, sprint, C++ and scratchpad workspaces. A session's Scratch work control associates a drawing with that session/current question. Scratch/code/results are staged for review and explicitly submitted with typed or dictated reasoning.

The teaching diagnosis and reversible control are described in [teaching-diagnosis.md](teaching-diagnosis.md). The issue was both prompt policy (immediate prediction resolution/re-teaching) and UI disclosure of committed answers. Guided adds a hint-and-wait policy after overrides and controls answer reveal; Explain and explicit Show answer remain available. Existing sessions keep their prior policy until switched. Already-running replies keep their original instructions.

Quant topics, sequencing and readiness criteria are in [quant-study-sprints.md](quant-study-sprints.md). Windows/iPad trusted HTTPS setup and device limits are in [ipad-companion.md](ipad-companion.md). C++ worker setup is in [cpp-runner.md](cpp-runner.md), with challenge details in [cpp-challenge-judge.md](cpp-challenge-judge.md). Sources and licenses are recorded in [reuse-provenance.md](reuse-provenance.md).

## Verification

- Frozen-lockfile `npm ci` passed and rebuilt local Monaco, Excalidraw and companion assets.
- All **1,977** default tests passed; typecheck and architectural lint passed.
- Seven real Docker runner tests passed for compilation/cases, diagnostics, isolation, timeout/output limits, sanitizers, cancellation/authentication and cleanup.
- The additional real judge integration compiled three general solutions and two deliberately wrong/echoing programs, checking hidden-output redaction and persisted source snapshots.
- Certificate-verified HTTPS integration passed for pairing, page scope, replay/reconnect, notice assets and revocation. Deterministic tests cover expiry, rate limits and offline merging.
- Chromium checks exercised each visible feature, including two-browser drawing sync, code/report and sprint teaching/practice handoffs, reload recovery, delayed references and correction/review workflows.
- Native image/code provider transport was tested through an injected provider. Paid live model behavior and improved retention were not measured. Physical iPad/Pencil pressure/palm rejection and Windows certificate setup require device validation.
- The optimized production build and supported standalone bundle startup now pass. Electron installer packaging and physical device behavior remain separate checks.

## Review status

GitHub API and Google Fonts access now work. All 15 feature PRs and validation PR #23 were created and attached to the task. The iPad PR's typecheck/tests/lint and standalone Linux, macOS and Windows checks passed; remaining PR check results are available on GitHub. Every PR remains a draft and nothing has been merged. Review the expanded validation/fixes together with the feature stack before merging. Physical iPad/Safari/Pencil validation still requires the user's device.

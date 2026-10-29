# Source reuse

This fork is AGPL-3.0-only. Preserve the licenses and copyright notices of reused code.

## Submitted learning evidence

Image transport and canonical base64/signature validation are adapted from Dreamsigner's [LearnHarness PR #263](https://github.com/amosblomqvist/learnharness/pull/263), commit `890e5693946410c6d9f17bb4a598bfb74c38d3d7` (AGPL-3.0). This adaptation excludes the PDF path and extends transport to question tool results and practice thinking, with code snapshots and image-model capability checks.

Typed or dictated reasoning, selected images and code snapshots are submitted together. Images are native model content, not filenames or UI-only metadata. Inputs are bounded and validated before write-ahead persistence. A model that cannot read images refuses the submission before the record changes. Source code and client-reported output remain learner evidence, not a trusted grading result. Work stays private while it is edited; only an explicit submission sends it to the selected provider.

Images and code persist with the local session. Dictation supplies text, not a retained audio recording. Context compaction still summarizes old turns; this does not promise that every old image stays in every future request. Reopen the session's evidence or resubmit the relevant work when exact old details are needed.

## Implemented reuse

- [Upstream PR #241](https://github.com/amosblomqvist/learnharness/pull/241), head `0255467010ccc53bcec0c13d8504a52a32ac13c1`, informed the source/output evidence and execution-report vocabulary (AGPL-3.0). This implementation uses a separate digest-pinned, non-root Docker compiler service; it does not import the upstream root/systemd deployment.
- The persistent editor uses locked `monaco-editor@0.57.0` and `@monaco-editor/react@4.7.0` packages (MIT), after inspecting Monaco revision `dbf1945df2ff7e46512d2f548cc5c0977a3eadd8`. Monaco code, workers, LICENSE and ThirdPartyNotices are self-hosted by the asset-preparation script. The React wrapper notice is in `third-party/monaco-react-LICENSE`.
- Scratch work and the HTTPS companion use locked `@excalidraw/excalidraw@0.18.1` (MIT), with its editable vector scenes, pen/eraser/history/viewport and PNG export. Assets are local; the companion build points the package font fallback at local assets too. Software and actual bundled-font notices are in `third-party/` and served by the companion. The scoped pairing/sync protocol is original integration; physical iPad input remains unverified.
- Arithmetic question generation adapts [YYZ-CR/zetamac-trainer](https://github.com/YYZ-CR/zetamac-trainer) `e81041507c69a8b3154be3cb3f85c0ac3fd7ae34` (MIT), with its notice in `third-party/zetamac-trainer-LICENSE`. Timing, server state, persistence and analysis were implemented here.
- Several public Zetamac clones inspected had no explicit license. Do not copy those sources. GitHub's license-filtered search can identify candidates, but verify each actual license and whether it implements training rather than only score tracking before adopting it.

The quant curricula, mathematical experiments, stopping/exam/retrieval logic and challenge integration are original code. No complete upstream PR was merged blindly and no unlicensed Zetamac clone was copied.

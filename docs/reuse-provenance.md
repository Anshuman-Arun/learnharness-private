# Source reuse

This fork is AGPL-3.0-only. Preserve the licenses and copyright notices of reused code.

## Submitted learning evidence

Image transport and canonical base64/signature validation are adapted from Dreamsigner's [LearnHarness PR #263](https://github.com/amosblomqvist/learnharness/pull/263), commit `890e5693946410c6d9f17bb4a598bfb74c38d3d7` (AGPL-3.0). This adaptation excludes the PDF path and extends transport to question tool results and practice thinking, with code snapshots and image-model capability checks.

Typed or dictated reasoning, selected images and code snapshots are submitted together. Images are native model content, not filenames or UI-only metadata. Inputs are bounded and validated before write-ahead persistence. A model that cannot read images refuses the submission before the record changes. Source code and client-reported output remain learner evidence, not a trusted grading result. Work stays private while it is edited; only an explicit submission sends it to the selected provider.

Images and code persist with the local session. Dictation supplies text, not a retained audio recording. Context compaction still summarizes old turns; this does not promise that every old image stays in every future request. Reopen the session's evidence or resubmit the relevant work when exact old details are needed.

## Reviewed candidates for the remaining feature PRs

- [Upstream PR #241](https://github.com/amosblomqvist/learnharness/pull/241), head `0255467010ccc53bcec0c13d8504a52a32ac13c1`, provides runnable/editable code cards, predictions, attempts and source/output reports (AGPL-3.0). Its root/systemd runner needs adaptation to this environment; it is not a working C++ service merely because the card renders.
- [Monaco](https://github.com/microsoft/monaco-editor), revision `dbf1945df2ff7e46512d2f548cc5c0977a3eadd8`, has an MIT license in `LICENSE.txt`. Candidate for the persistent editor.
- [Excalidraw](https://github.com/excalidraw/excalidraw) has an MIT license. Candidate for the drawing surface; pair the saved scene with a rendered image snapshot for the tutor. Collaboration hosting and iPad input still need integration and device validation.
- Several public Zetamac clones inspected had no explicit license. Do not copy those sources. GitHub's license-filtered search can identify candidates, but verify each actual license and whether it implements training rather than only score tracking before adopting it.

Sources are candidates unless a section explicitly says their code is adapted here. No complete upstream PR has been merged blindly.

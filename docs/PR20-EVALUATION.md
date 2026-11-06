# PR #20 independent evaluation

Source: https://github.com/amosblomqvist/learnharness/pull/20
PR source snapshot: `aksalatdev/learnharness@5e5978857085240d71d0821f1c9349829debec40`
Base: LearnHarness v0.3.4 `6cba9c8`.

The first commit on this branch copies **all 16 upstream PR changed files
verbatim** on top of the original main. The evaluation changes AFTER that
commit only isolate Windows app data/identity, disable update checks, add
a Windows test runner, and add GitHub CI including a portable build.
These extra changes are NOT part of upstream PR #20.

## Why a separate app
- Product: `LearnHarness PR20 Test`, distinct appId and userData.
- Old LearnHarness and LearnHarness Private data are untouched.
- No updater/publisher/feed.
- Portable archive bypasses the slow one-click Windows installer.

## CI acceptance gates
- `npm ci`, complete TS tests, lint, typecheck, Next standalone and smoke build.
- Windows packaging and asar check that OAuth runtime and jose are included.
- Linux regression test suite.

## Not verifiable from CI
The test runner has **NO ChatGPT account credentials**. It cannot prove:
- ChatGPT authorization or allowed token-sharing scopes with this OAuth client,
- a particular model's eligibility under a Plus subscription,
- API Responses inference authorized by a shared ChatGPT token,
- agent function calling, diagnostic question → continuation, or saved
  session replay during live inference.

Do NOT merge to main, or share credentials/tokens. Do not use a real
account until the implementation has been independently security reviewed.

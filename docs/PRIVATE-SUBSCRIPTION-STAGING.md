# ChatGPT subscription integration — staged source

**Status: source-only staging; not enabled in LearnHarness.**

The standalone development work is checked in under `private-devkit/`.
It contains request codecs, an Electron-main broker, a noncommercial
DevKit extension patcher, and dependency-free tests. The main app's
original `pi-ai` registry, chat runtime, UI, and Deepgram setup have
**not** been modified by this commit.

## Verification

- Local Node 22: 63/63 adapter tests pass.
- CI: `.github/workflows/private-overlay-tests.yml` tests the
  staged adapter on a Windows runner with Node 26.
- These are not live OAuth or application integration tests.

## Integration gate

1. Wait for green Windows baseline CI on the parent branch.
2. Review and apply the provider changes without replacing the agent loop.
3. Run typecheck, all existing tests, lint, and production build.
4. Build the official Sign in with ChatGPT DevKit subject to its
   noncommercial license and secure credential storage.
5. Test authenticated tool-streaming and history continuation.
6. Verify dictation and build a Windows installer.

Never point the private app updater at the public upstream release feed.

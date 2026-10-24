# Native ChatGPT provider — verified integration preview

The source-only `private-devkit/` overlay is checked in and preserved.
The `scripts/private-preview-integration.mjs` command assembles the
adapter into an ephemeral checkout, preserving the real LearnHarness
agent runtime instead of substituting another agent architecture.

## Verified on GitHub Actions

- **Successful integration preview:** https://github.com/Anshuman-Arun/learnharness-private/actions/runs/40058131533
- Provider assembly from staged source: PASS
- TypeScript typecheck: PASS
- 63 standalone subscription adapter tests: PASS
- Full upstream LearnHarness test suite: PASS
- ESLint: PASS
- Production Next.js build: PASS
- Original private Windows baseline smoke build: PASS
  https://github.com/Anshuman-Arun/learnharness-private/actions/runs/40057423845

The preview branch keeps permanent application source untouched; CI
performs generation in a disposable checkout. These checks are **not**
evidence that OAuth, live tool calling, Deepgram dictation, or installer
runtime has been exercised using a real Windows account.

## Security and release constraints

- The OAuth SDK must operate in trusted Electron main and protect tokens
  using OS-backed encryption. Never expose them to the renderer or Next.
- Only official user-authorized ChatGPT plan sharing is permitted.
- The upstream author’s GitHub update feed remains disabled in the
  derivative app; `main` has not been changed.
- Official DevKit source is noncommercial-licensed. Keep it isolated.
- The dependency install currently reports 15 npm audit advisories,
  including 4 marked critical. Their relevance and remediation must be
  reviewed before handling production OAuth credentials. Do not apply
  broad breaking upgrades without regression testing.

## Remaining checkpoints

1. Commit reviewed generated source to a dedicated application branch.
2. Build and package the licensed DevKit locally.
3. Establish official OAuth sign-in and live subscription model discovery.
4. Verify streamed quiz tool call, answer, saved history, and continuation.
5. Verify Windows microphone input/Deepgram authentication.
6. Test signed-out and quota-exhausted behavior, installer upgrade, data
   persistence and backups.

No live ChatGPT Plus authentication or paid API call has occurred.

# Private Windows implementation status

Baseline source: LearnHarness v0.3.4, originally published by Amos Blomqvist.
Branch: `feature/private-windows-baseline`.

## What this commit actually does

- Distinguishes the app's Windows identity and data directory from the public distribution.
- Disables its existing automatic updater and removes the upstream GitHub release feed.
- Adds a Windows development launcher and a Windows build command.
- Preserves upstream LearnHarness UI, learning agents, Deepgram, and data formats.

## Not implemented in this commit

The earlier 63-tested, independently developed subscription-inference overlay
has **not yet been copied into this repository**. Do not confuse the overlay
tests with integration tests of the real app. OAuth login, authenticated
tool calling, reasoning settings, and actual Plus-account inference are NOT
working in the repository at this stage.

## Quality gates

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run lint`
5. `npm run build`
6. Windows: `npm run desktop:dev:win` and `npm run desktop:dist:win`

No secrets or paid API key should be committed. The existing Deepgram API
key remains user-supplied and optional.

## Next step

Integrate the authenticated Responses provider into the existing
`pi-ai`/agent stack and prove actual streamed quiz → tool result →
continuation with a connected, eligible subscription. Keep unverified
components off `main`. The official DevKit's noncommercial license must
be honored if its source is used.

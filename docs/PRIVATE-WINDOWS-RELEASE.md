# Private Windows release acceptance (PR #5)

## Release identity and updater
- Windows executable is **LearnHarness Private.exe**, appId `org.learnharness.private.windows`, Electron runtime name **LearnHarness Private**.
- The original LearnHarness and historical **LearnHarness PR20 Test** keep distinct Electron userData directories.
- Upstream auto-update is disabled in the checked-in source. `electron-builder.yml` has no publisher.
- The old local "swap in a newer server" fast path is disabled: the embedded Electron OAuth code and server must be built together.

## Mandatory before merging or distributing
1. Run Linux full `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
2. On Windows Node 26 run `scripts/build-private-windows.ps1` and inspect the complete portable app.
3. Check both a signed-out launch **with OPENAI_API_KEY set** and a signed-in launch with a live authorized ChatGPT account. No subscription request may fall back to paid API billing.
4. Test sign-in, cancel, reconnect, disconnect, expired/rotated tokens, and the model catalog.
5. Exercise diagnostic -> tool execution -> teaching continuation, persistence after restart, long LaTeX/matrices, microphone selection, short speech startup.
6. Verify `resources/app.asar` contains `electron/chatgpt-oauth.cjs` and `jose`, and `resources/server/standalone/.next/BUILD_ID` exists in the downloaded ZIP.
7. Verify no auth.json, .env, .env.local, token, or client secret is published, and no updater reaches the upstream release feed.

## Saved learning data: never silently migrate
Changing app identity intentionally changes Electron `userData`. Existing sessions/DAGs are **not deleted**, but they do not automatically appear in the new app. Back up the previous `%APPDATA%\\LearnHarness PR20 Test\\data` or `%APPDATA%\\LearnHarness Private\\data` while both apps are closed. To preserve progress from PR20 Test, first make a complete backup of both data directories; copy only the old `data` directory into an empty new Private profile, then test that sessions/DAGs open. Do not overwrite a populated target; do not move `chatgpt-oauth.enc.json`, `auth.json`, `logs`, or any key material automatically. Reconnect ChatGPT under the new app identity.
 
## Limits
CI with dummy credentials cannot prove real ChatGPT authorization, entitlement, streaming/function tools, Windows OS keychain behavior, earbuds audio latency, or actual data migration. Production remains blocked until manual account and Windows smoke tests succeed.

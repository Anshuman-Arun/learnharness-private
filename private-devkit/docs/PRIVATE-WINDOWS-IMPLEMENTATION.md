# LearnHarness Private Windows — engineering handoff (phase 1 + tested protocol/codec building blocks)

**Status:** This package is an **overlay**, not a fork or finished installer. The second-stage patch is written to register `chatgpt-plan` in LearnHarness's existing `pi-ai` engine and bootstrap the Electron broker, but the patch has not been run against a complete upstream checkout or authenticated against OpenAI. A private GitHub repository is not created by this package.

## Work completed

- Independent app identity: `LearnHarness Private`, separate Electron `userData` directory and instance lock, distinct `appId`.
- Upstream release feed removed from `electron-builder.yml`. Updater disabled at function entry. No upstream update can silently replace this private build.
- Windows-capable runner scripts for tests, desktop dev, and unsigned private Windows installer (`--publish never`).
- Independent, dependency-free Responses protocol proof module with request validation, SSE consumption, function-result serialization and error/usage-limit handling. **Not a production adapter**.
- Tested conversion of LearnHarness's pi-ai native message records into subscription-compatible HTTP history, preserving system instructions, learner text and images, tool calls and results. This codec must consume `toLlmMessages` output; unsupported content fails visibly. Plaintext reasoning is not a substitute for encrypted reasoning continuation.
- Tested pi-ai-shaped streaming adapter handling local tool declarations, function calls, usage, errors and interruption, with simulated provider events. A second-stage integration patch is now written to register this adapter in the upstream provider catalog; it is not compiled or end-to-end tested against the full upstream tree.
- Windows Electron `safeStorage` credential-encryption facade (main-process only), with fail-closed behavior.
- Tested account-scoped model discovery (`GET /v1/models` with user OAuth token), keeping only models the user can select.
- Tested injectable global concurrency gate, role disable switches, and request caps per background task. These are not yet connected to all model call sites.
- Mocked whole-history `quiz → answer → resume` test with no HTTP `previous_response_id`. Tests do not prove real model compatibility.
- Automated tests (offline; no real tokens, no service calls).

## Scope of the remaining engineering work (M2–M5)

### M2. Official OAuth sign-in and proof of inference

Read `docs/DEVKIT-INTEGRATION-DECISIONS.md` first; the DevKit SDK does not expose general-purpose function streaming via its public facade. Follow OpenAI's Sign in with ChatGPT DevKit, particularly `packages/local` and the Paste Perfect Electron example. The example itself is macOS-only; the library has abstractions for app-controlled credential encryption. When porting to Windows, use Electron `safeStorage` in the **main** process or Windows DPAPI; enforce encryption availability and fail closed. Do not put OAuth tokens in LearnHarness's plaintext `auth.json` or expose them to React/renderer. The Next server runs in a distinct child process, so design a narrow authenticated local capability boundary or keep sign-in and token refresh in the Electron process. Do not inject refresh credentials into arguments, URL query strings, logs, or browser localStorage. Validate scopes include `chatgpt.tokens.use.direct`.

Prove a streamed request via `https://api.openai.com/v1/responses` with `store:false`, `stream:true`; use official model discovery (`GET /v1/models`) and confirm the selected model/effort belongs to the signed-in account. Never substitute cookies, browser automation, or private ChatGPT `backend-api` routes.

### M3. LearnHarness pi-ai adapter (blocking)

The main application uses `@earendil-works/pi-ai` `StreamFunction` and `pi-agent-core`. Implement an adapter that maps every model event to the exact expected `AssistantMessageEventStream` (text, reasoning, function tool calls, usage/errors). Do not replace LearnHarness's agent runner. Convert its system prompts to the Responses `instructions` field (explicit `role:system` input items are rejected), preserve full persisted history on each turn (no HTTP `previous_response_id`), and handle local tool namespaces, tool-call outputs, image items, aborts, mid-stream errors, and accounting. Continue `quiz` -> user reply -> teacher across process restarts before adding background roles. Inspect existing `src/agent/models.ts`, `src/server/chat-handler.ts`, `src/server/pi/ui-stream.ts`, `src/server/pi/record-adapter.ts`, and all agent tests before integration.

Do not display fake monetary charges or fake 5-hour quota percentages. A request stream is successful only after `response.completed`.

### M4. Model selection and usage safety

Keep the application's strong/cheap/vision slot model and role overrides. Add live OAuth-backed model discovery instead of hardcoding Luna/Sol availability. Add explicit global concurrency control, per-background-job budget, per-role enable/disable, cancellation, and non-destructive handling of allowance exhaustion. Tests must measure number of actual underlying requests per teaching interaction.

### M5. Deepgram and Windows distribution

Do **not** rewrite `components/dictation.tsx`. It already streams Nova-3, buffers finals and handles reconnect. Set up the official Deepgram API key with member permission to mint short-lived tokens, then verify Windows microphone permissions and all question input surfaces. Local unsigned installer target is NSIS, x64. `--publish never` is intentionally mandatory.

## Build and test after applying the overlay

```powershell
npm ci
npm test
npm run lint
npm run typecheck
npm run desktop:dev:win
# Only after app builds and smokes on Windows:
npm run desktop:dist:win
```

Production **integration patches** are written but not applied to a complete upstream source checkout. OAuth tool streaming still requires an authenticated extension to the official DevKit. Local simulated tests do not demonstrate a live ChatGPT request. Nothing has been authenticated against a real ChatGPT account or packaged for Windows. Deepgram uses an API key (free trial credit is not unlimited). The source is licensed AGPL-3.0; keep attribution and verify OpenAI DevKit license before copying SDK source into a redistributable repo.

## References

- https://github.com/amosblomqvist/learnharness
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://github.com/openai/sign-in-with-chatgpt-devkit
- https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/docs/security.md

## Local sandbox limitation

This archive is a code overlay because the build sandbox cannot perform a Git network clone of the upstream repository. The original LearnHarness source was inspected through the connected GitHub reader. To run upstream TypeScript tests, compile the whole application, and verify Windows packaging, first apply the overlay to a real upstream clone on a Windows machine or in an appropriate CI runner. This limitation is distinct from the application architecture.

### Later increment: tested parent-child process boundary

A working simulated transport is now implemented in `src/subscription/loopback-broker.cjs`, `loopback-client.mjs`, and `electron-subscription-service.cjs`. The first module listens only on IPv4 loopback and enforces a per-launch bearer capability, exact Host, no Origin, bounded requests, bounded concurrency, and cancellation propagation. The second is the **server-only** model event consumer. The third adapts public DevKit account methods and deliberately refuses tool inference unless an authenticated tool-capable SDK extension has been supplied.

`tests/agent-broker-roundtrip-private.test.mjs` uses a real Node HTTP listener and client with simulated Responses events to exercise the LearnHarness tool call + answer + continuation sequence. This does not prove that the hosted subscription backend accepts the namespace schema or reasoning settings. It also does not test Electron main/child startup, the original TypeScript package, or Windows deployment; those remain milestones to complete after obtaining the canonical source tree and a user-authorized live login.

### 2026-10-24 status: native provider and Windows boot patches

The additional `scripts/apply-private-provider.mjs` performs source-anchored edits to register a dynamic `chatgpt-plan` provider inside the existing `piModels()` collection and refresh it before `/api/models` returns. It updates the existing authentication-presence gate rather than building a second settings screen. Electron bootstrap code now starts the protected loopback broker when a built compatible `@siwc/local` package is installed. A native **Connect ChatGPT…** menu item is available only when the account SDK loads. Electron also owns the Next dev child on Windows, so the child can inherit the private per-launch broker capability.

The official `@siwc/local` package is not present in this overlay. Its current public streaming API is text-only; because LearnHarness requires function calls, `service.infer()` refuses inference without a reviewed authenticated streaming SDK extension. **No live inference, full upstream compilation, Windows installation, or real account login has yet succeeded.** The model catalog temporarily supplies conservative numeric context limits because the account-facing SDK only returns slug/display name; these must be reconciled against real model metadata before accuracy-sensitive usage.

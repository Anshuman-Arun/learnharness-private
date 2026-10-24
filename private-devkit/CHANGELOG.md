# Local development changelog

## 2026-10-23 — second implementation increment

- Wrote an adapter that emits pi-ai's `AssistantMessageEventStream`-shaped
  `start`, `text_*`, `toolcall_*`, `done`, and `error` events from simulated
  subscription-backed Responses streams.
- Implemented pi system-transcript tool declarations and namespace-grouped
  function schemas. This prevents silent loss of LearnHarness diagnostic and
  teaching tools when moving away from the original provider.
- Added preservation of function call namespaces when replaying recorded
  conversations after an app restart.
- Implemented Electron-main `safeStorage` credential encryption interface,
  refusing unprotected credential storage.
- Hardened inference transport against HTTP redirects and non-SSE responses.
- Confirmed the official `@siwc/local` DevKit facade supports only text
  inference via its public methods. The full tool-capable trusted-side
  authentication adapter remains an integration blocker, documented in
  `docs/DEVKIT-INTEGRATION-DECISIONS.md`. The DevKit's noncommercial license
  also matters if distributing a combined application.
- Automated offline regression coverage: 30 passing tests. No live account
  was authenticated; original LearnHarness has not been compiled with this
  overlay and no installer has been built.

## 2026-10-23 — trusted desktop broker and DevKit service adapter

- Implemented `loopback-broker.cjs`: Electron-owned, IPv4-loopback-only authenticated local capability service for session state, dynamic model listing, and event streaming. Per-launch random secret, strict Host and Origin checks, POST-only routes, request size caps, controlled concurrency/queue depth, cancellation, streaming backpressure, and generic error responses.
- Implemented `loopback-client.mjs`: server-side child client that exchanges *only* the per-launch capability with Electron; OAuth tokens remain in the trusted Electron side. Validates completed Responses streams and refuses incomplete output.
- Added `electron-subscription-service.cjs` with official `createChatGPT` DevKit account methods (login, disconnect, list models, session) and fail-closed requirement for a reviewed SDK tool-stream extension. Uses main's existing `safeStorage` abstraction.
- Made the pi stream adapter accept injected local-broker event streams instead of requiring bearer tokens in the child process.
- Added an actual loopback HTTP round-trip test of mock LearnHarness `quiz → answer → resume` through the broker and pi stream adapter.
- New automated regression tests: unauthorized requests, spoofed Host and browser Origin, missing capability, SSE truncation, cancellation, account privilege checks, safe credential projection, and unavailable tool-stream extension.
- All tests use mocked credentials and model streams; no live OAuth or production LearnHarness integration has occurred.

## 2026-10-24 — native model-registry and Electron bootstrap wiring

- Added `src/subscription/pi-provider.mjs`, a dynamic `chatgpt-plan` provider exposing the *actual account-scoped model list* through the existing `pi-ai` collection. There is no second agent runtime; the stream uses `createPiSubscriptionStream` and the Electron-owned capability broker.
- Added `scripts/apply-private-provider.mjs`, a separate fail-closed overlay step that patches upstream `src/agent/models.ts`, `src/server/model-catalog.ts`, `src/server/keys.ts`, `app/api/models/route.ts`, and `electron/main.cjs` only when exact verified source anchors match. This integrates the model picker and request path without editing the LearnHarness UI components.
- Added trusted Electron subscription bootstrap, copied into `electron/private-subscription/` so electron-builder's `electron/**/*` file whitelist includes our broker code. Electron creates a short-lived per-run broker capability, passes it *only* to its Next child, and exposes **Connect ChatGPT…** in the native application menu when the official SDK is present.
- Reworked `desktop:dev:win`: Electron now owns the Next dev process, so local development also inherits the broker credentials privately (the previous separate Next process could not see them).
- Fixed `run-tests-private.mjs` to discover **all** private `.test.mjs` tests, not only names ending `-private.test.mjs`.
- Added account-list fail-closed and Electron bootstrap tests. **50 offline automated tests passing.** This remains a source overlay; no live OAuth sign-in, official tool-stream SDK, upstream compilation, or Windows GUI smoke test was possible here.
- **Outstanding highest-risk gap:** official DevKit's public client interface has no authenticated *tool-stream* method. The Electron broker deliberately rejects inference until a reviewed/compatible DevKit extension exists; a successful mocked stream does not establish real subscription-backed inference.

## 2026-10-24 — tool-enabled official SDK patch and Windows runtime staging

- Added `patch-siwc-devkit.mjs`: fail-closed source transformation of the
  separately checked-out official SDK to expose `streamStructuredEvents`
  through its existing authenticated/refresh-protected closure.
- Added `siwc-structured-extension.ts`: structured Responses streaming with
  local namespace tools, full history, required `stream:true` and
  `store:false`, and sanitized error behavior. No credentials leave Electron.
- Wired the production Electron service to the new SDK method through an
  async callback-to-event iterator with bounded buffering and cancellation.
- Added a private SDK tarball staging script for Windows packaging; packaged
  Electron now imports only the bundled SDK rather than a global package.
- Added noncommercial license/notice preservation, and a Git-ignore rule for
  locally staged runtime dependencies. The build fails if the SDK is absent.
- Added regression coverage for source patching, drift refusal, packaged
  source parity, cancellation, bounded buffering, and mocked
  SDK → broker → pi agent → quiz → continuation.
- Still no full upstream checkout, no Windows build, and no live OAuth
  smoke test in this container.

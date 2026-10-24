# ChatGPT DevKit integration — decisions validated on 2026-10-23

The official Sign in with ChatGPT DevKit is hosted at
https://github.com/openai/sign-in-with-chatgpt-devkit.

**Important newly verified blocker:** The DevKit's `@siwc/local` package is a
**private workspace package**, not a published `npm install @siwc/local`
dependency. Its public `ChatGPTClient` interface supports `signIn`,
`listModels`, `disconnect`, and `streamResponse`, but **its `streamResponse`
currently accepts text-only messages and returns text**. The public interface
does not expose the refreshed access token or arbitrary Responses API tools.
LearnHarness needs local function calling, which is outside that facade.

For a production build, either:

1. Vendor a pinned, reviewed source snapshot of the DevKit's local package
   into a private-only workspace **with its original license notices** and
   extend the trusted-side authenticated request callback to support local
   function namespaces, or
2. Implement a separate standards-compliant OAuth PKCE/refresh manager after
   reviewing the official implementation and authorization requirements.

We prefer (1) for a **noncommercial, private personal copy**. The official
DevKit's license is **Sign-in with ChatGPT DevKit Noncommercial License**,
NOT MIT. It restricts commercial use. Combining this code with an AGPL-3.0
application has potential distribution/license compatibility implications;
**do not publish an assembled combined source or binary** without proper
license review. Independently written adapter files here do not include
DevKit source. Keep the upstream AGPL license and attribution.

Security boundary:

- The official SDK runs in Electron **main**, never in React or Next's child
  process. It persists state using `CredentialEncryption` backed by main's
  `safeStorage`, with no plaintext fallback.
- Next's process needs a narrow authenticated loopback RPC/IPC for model
  inference and model-listing operations. Prefer forwarding requests to the
  *main process* rather than putting access/refresh tokens into Next.js
  environment variables or a `auth.json` file. The main process owns
  refresh, account selection, and the network request.
- The child-to-main protocol needs per-launch authorization, strict
  loopback binding, payload size limits, timeouts, cancellation, and SSE
  backpressure. The renderer must not access credentials.
- Keep `store:false`, `stream:true`, full `input` history, `instructions`
  rather than system-role message items, and namespace-grouped **local**
  functions. These rules apply even if the official DevKit changes.
- A private Windows-only test should confirm `safeStorage.isEncryptionAvailable()`
  after `app.whenReady()`, across an installer upgrade/restart.

The `src/subscription/pi-stream-bridge.mjs` in this overlay is an early
pi-ai `StreamFunction`-shaped implementation with dependency-injected
stream construction and authentication. It is tested against pi-ai event
contracts and simulated Responses events; it is **not yet registered**
with `src/agent/models.ts`, nor is it connected to official live credentials.

Sources inspected:

- https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/packages/local/src/types.ts
- https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/packages/local/src/index.ts
- https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/packages/local/src/responses.ts
- https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/docs/security.md
- https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/LICENSE
- https://github.com/earendil-works/pi/blob/main/packages/ai/src/types.ts
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations

## Trusted IPC prototype — follow-up code

This overlay now has a tested *HTTP capability broker*, not just a design. The parent (`loopback-broker.cjs`) is intended to run in Electron main, while the child (`loopback-client.mjs`) is intended to be imported **only by the Next.js server**. The secret shared over the child environment is ephemeral, generated at launch, and is **not** an OpenAI credential. A bearer capability sent to a loopback listener is still sensitive: do not expose it to the renderer or include it in logs/telemetry.

The Electron `createElectronSubscriptionService` adapter can invoke the official DevKit's account methods via `createChatGPT` after `app.whenReady()`, but its `infer` method **requires** a reviewer-approved `streamEventsExtension`. At the current official DevKit commit, this extension does not exist. It must be implemented *inside the trusted DevKit auth callback*, following its token-rotation/identity-verification semantics. Do not add an unsafe `client.getAccessToken()` method and give it to the Next child. Do not use the text-only `streamResponse` as an unadvertised replacement: that would break diagnostic quiz tools.

Integration work still needed: vendor the official DevKit in accordance with its noncommercial license; implement its tool-enabled trusted stream method; instantiate the service after Electron initialization; call `startSubscriptionBroker()` and pass `{port,secret}` to the child server's environment at spawn; map the renderer sign-in command through validated IPC; extend the pi provider registry and dynamically refresh the account-specific model list. None of those steps is yet executed by the upstream app.

## 2026-10-24: reviewed tool-streaming extension and separate runtime staging

The official `@siwc/local` exposes `streamResponse` for text-only requests.
The first-party `authenticated()` closure already owns connection selection,
refresh-token rotation, abort signaling, and session state. To avoid asking for
raw access tokens or bypassing that closure, the private edition now supplies
an **opt-in source patch** for a separate checkout of the official DevKit:

- `scripts/patch-siwc-devkit.mjs` adds `streamStructuredEvents` within the
  DevKit's existing `authenticated()` wrapper. It is fail-closed if source
  anchors change, and never modifies any upstream GitHub repository.
- `scripts/siwc-structured-extension.ts` issues `store:false`, `stream:true`
  Responses requests with complete conversation context, local namespaced
  function tools, event streaming, and abort/terminal validation.
- `src/subscription/devkit-event-stream.cjs` converts its callback into a
  bounded async iterable, keeping tokens entirely within the trusted DevKit
  process. The Electron-owned broker forwards only structured events.
- `scripts/stage-siwc-runtime.mjs` builds a self-contained, **non-symlink**
  copy of the patched SDK with its runtime dependencies and license notices.
  The private Windows builder copies it through `extraResources`, rather
  than depending on a globally installed ChatGPT client.

### Preparing the official SDK (on Windows, for personal noncommercial use)

In a sibling directory, separately clone
[openai/sign-in-with-chatgpt-devkit](https://github.com/openai/sign-in-with-chatgpt-devkit).
From the private LearnHarness checkout, apply the source extension to that
DevKit checkout (review the patcher output first), then build it:

```powershell
node scripts/patch-siwc-devkit.mjs C:\path\to\sign-in-with-chatgpt-devkit --dry-run
node scripts/patch-siwc-devkit.mjs C:\path\to\sign-in-with-chatgpt-devkit
cd C:\path\to\sign-in-with-chatgpt-devkit
npm ci
npm run build -w @siwc/local
cd C:\path\to\learnharness-private
node scripts/stage-siwc-runtime.mjs C:\path\to\sign-in-with-chatgpt-devkit
```

The DevKit's noncommercial license requires personal noncommercial use for
this integration. Its built code and third-party notice files must remain
included in any installable binary; a separate legal review is needed before
any redistribution or commercial use of the combined AGPL/DevKit product.
The staged `vendor/siwc-runtime/` directory is Git-ignored. It is not an
OAuth account profile and must never contain actual user credentials.

These additions are **not evidence of a live subscription login**. The
streaming code needs `npm run typecheck` and a real Windows/account test
with an eligible Plus subscription. Offline tests exercise the SDK method
contract, isolated staging/patcher safety, and a full mocked inference path.

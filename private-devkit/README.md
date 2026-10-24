# LearnHarness Private Windows — local development overlay (2026-10-23)

**What this is:** tested code modifications to apply to the original
[LearnHarness](https://github.com/amosblomqvist/learnharness). This package is
**not the upstream source tree**, a complete desktop app, a working ChatGPT
login, or a finished pi-ai integration. It does not contain tokens or keys.

**Implemented in this overlay (incremental code through 2026-10-24):**

- A trusted **Electron main ↔ Next child** loopback capability broker, now wired into the Electron startup through a fail-closed integration patch. A per-launch secret is inherited only by the Next child, not stored in settings. Its runtime integration has NOT yet been tested on Windows.
- An Electron-main DevKit adapter supporting account state, sign-in, sign-out, and model discovery through the official SDK factory, while refusing tool inference until the SDK exposes a reviewed authenticated streaming extension. The optional SDK is not installed by this overlay. Sign-in is mock-tested only.
- A guarded, non-destructive transformation for an independent private
  LearnHarness checkout: separate Electron app/data identity, disable
  upstream auto-updates, add Windows dev/build/test scripts.
- A `pi-ai` event-stream-shaped Responses adapter, including streamed text,
  namespaced local tool calls, reasoning configuration, usage accounting,
  cancellation and failure events. It is dependency-injected and unconnected
  to production auth.
- Subscription Responses request construction and SSE handling with
  mocked tool continuation, `store: false`, `stream: true`, and correct
  terminal-response verification.
- Native LearnHarness/pi-ai transcript conversion to Responses history,
  including function calls/results and text/image input (unreplayable
  reasoning is deliberately flagged, not forged).
- Account-scoped model discovery integrated into the existing `pi-ai` model registry and GET `/api/models` route via `chatgpt-plan`. No assumption that Luna/Sol are present; model context sizes and advanced reasoning capability remain *provisional* until verified against live account data.
- Trusted Electron-main credential-encryption adapter using `safeStorage`;
  no plaintext fallback. The full OAuth login is **not** installed yet.
- Global inference concurrency controls, a per-background-job request cap,
  and individual role-disable switches (implemented as an injectable guard,
  **not yet hooked up to LearnHarness's agents**).
- Automated, network-free tests for the above.

## GitHub: CREATE AN EMPTY PRIVATE REPOSITORY

Do **not** use GitHub's Fork button for this project; a fork of the public
repository cannot be made private independently. Create a new, empty private
repository (`learnharness-private`) in your own account. Do **not** initialize
it with a README, `.gitignore`, or license. Then on **your Windows PC** (Git
for Windows + Node 22+ installed), run in PowerShell:

```powershell
git clone https://github.com/amosblomqvist/learnharness.git learnharness-private
cd learnharness-private
git remote rename origin upstream
git remote add origin https://github.com/Anshuman-Arun/learnharness-private.git
git push -u origin main
```

The public project's existing LICENSE and history remain preserved, and
`upstream` remains available for selective updates. GitHub will ask you to
log in for pushes if Git credentials are not already configured.

## Apply the locally developed changes AFTER the private repo exists

Extract this ZIP **outside** the cloned repository. In the cloned repo,
run (substitute your extracted overlay directory):

```powershell
node C:\path\to\learnharness-private-starter\scripts\apply-private-foundation.mjs . --dry-run
node C:\path\to\learnharness-private-starter\scripts\apply-private-foundation.mjs .
git diff
git status
npm ci
npm test
npm run lint
npm run typecheck
npm run desktop:dev:win
```

The transformation refuses to modify the original author's checkout,
refuses to overwrite an existing path, and refuses a dirty Git worktree.
Only after reviewing/testing locally should you commit/push your changes.

```powershell
git add package.json electron-builder.yml electron/main.cjs scripts src/subscription tests docs/PRIVATE-WINDOWS-IMPLEMENTATION.md
git commit -m "Add private Windows foundation and SIWC protocol adapters"
git push origin main
```

**Note:** The new `src/subscription/` modules are a building block, not a
selected model provider yet. The server-only child broker and trusted Electron runtime still need production startup wiring. The original UI works as designed when set up
with an existing supported key provider; it **does not** use ChatGPT Plus
until the official OAuth manager and native pi-ai StreamFunction adapter are
wired up and verified on Windows.

## Additional native provider integration step

After the foundation overlay has been applied, apply the second stage:

```powershell
node C:\path\to\learnharness-private-starter\scripts\apply-private-provider.mjs . --dry-run
node C:\path\to\learnharness-private-starter\scripts\apply-private-provider.mjs .
```

The second step registers `chatgpt-plan` inside the **existing** `pi-ai` model collection, refreshes the account's actual model list in `/api/models`, starts a trusted Electron main-process broker and adds **Connect ChatGPT…** to the native app menu. It is deliberately additive and rejects changed source anchors; it will not silently patch a newer upstream version.

**Critical dependency:** OpenAI's `@siwc/local` is currently source-distributed as part of [the DevKit](https://github.com/openai/sign-in-with-chatgpt-devkit), not installed in this overlay. Even when it is built and installed, its existing public `streamResponse` only supports text; LearnHarness function calling requires a properly reviewed tool-streaming SDK extension. The broker **fails closed** in its absence. This is not a working ChatGPT Plus tutor yet.

### Windows dev-mode correction

`npm run desktop:dev:win` now launches Electron first; Electron owns the Next development child, so any broker capability is inherited privately. Do not start a separate `next dev` first, or the port may already be occupied.

## Test this overlay without upstream dependencies

```powershell
node --test
```

For security decisions, integration milestones, and acceptance tests, read
`docs/PRIVATE-WINDOWS-IMPLEMENTATION.md` and
`docs/DEVKIT-INTEGRATION-DECISIONS.md`.

**Newly confirmed DevKit limitation:** the official `@siwc/local` SDK is
private/nonpublished and its exposed `streamResponse` currently handles
text-only requests, not LearnHarness tool calls. A properly licensed, audited
trusted-side SDK integration is required before live sign-in can be claimed.
No DevKit source has been copied into this overlay; installing and extending that noncommercial-licensed SDK remains a required step before full functionality.

**Transport regression:** the tests include real local HTTP traffic (no internet) to exercise session status, model discovery, and one simulated `quiz → tool result → continue` interaction across the protected main/child boundary. OAuth tokens are never passed over this boundary.

## Optional official DevKit tool-stream integration (new)

The built-in `@siwc/local` client has no general tool-stream method. The
private edition now includes a **separately installed, fail-closed extension**
using the original SDK's authenticated/refresh-protected internal callback.
The extension does not request a token from the UI or access browser cookies.
See `docs/DEVKIT-INTEGRATION-DECISIONS.md` for Windows PowerShell installation
commands and noncommercial license caveats. The Windows packaging stage now
expects `vendor/siwc-runtime/` to contain that patched and built SDK.

**Development is still incomplete:** no live account authentication, complete
LearnHarness build, or native Windows installer has been tested. The offline
suite exercises structural compatibility and trusted IPC, not account access.

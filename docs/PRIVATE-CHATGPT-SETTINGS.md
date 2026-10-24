# Windows ChatGPT account control — acceptance tests

The original Windows title bar is hidden, so the Electron application menu is
not a reliable account connection surface. Sign-in is available instead via
**Settings → Keys → Model providers → Connect ChatGPT**.

The browser-based LearnHarness UI shows no desktop-specific account row.
On Windows, the row shows the desktop SDK's credential-free connection status.
If the official SDK is missing or fails to initialize, it explicitly reports
that sign-in is unavailable rather than asking for a paid OpenAI API key.

All `lh:chatgpt:*` IPC handlers verify the requesting renderer's origin and
host application window. Electron's preload exposes only three specific
actions: session, connect, and disconnect. OAuth tokens remain with the
main-process DevKit; the response is a strictly projected account state.

### Verification needed before release
- Windows package smoke build, typecheck, upstream/UI tests and adapter suite.
- Physical Windows app opens and Settings → Keys displays sign-in.
- Account consent, models, tool-enabled teaching, logout and restart are
  still human acceptance tests. No model-specific entitlement is guaranteed.

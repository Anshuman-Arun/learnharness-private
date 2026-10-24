# Windows installer packaging verification

This CI-only branch verifies that the **unchanged LearnHarness learning
system** with the private Windows identity actually builds into an unsigned
x64 NSIS installer. It does NOT include ChatGPT OAuth integration. Any
installer artifact is for smoke testing only, not an authenticated release.

Workflow: .github/workflows/private-installer.yml
App auto-updates: disabled
Private app identity/data: isolated from the original installation

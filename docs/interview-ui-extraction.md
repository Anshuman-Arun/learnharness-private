# Interview-App editorial v10 → LearnHarness UI extraction

## Source of truth
- UI source: [Interview-App PR #125](https://github.com/Anshuman-Arun/Interview-App/pull/125), `ui/editorial-v10-port`, head `bf7ef65ae44f13b34063b5c409eb658c04cd1447` (not the older `main` branch).
- Target: `Anshuman-Arun/learnharness-private` (Next.js 16, React 19, Electron).
- Approach: visual system only. Never transplant Interview-App's Vite bootstrap, interview session state machine, tldraw, provider runtime, or persistence.

## Extracted UI source inventory

| Interview-App source files (under `apps/web/src`) | Visual elements | LearnHarness destination |
| --- | --- | --- |
| `styles/theme.css`, `styles/editorial-v10.css` | Warm charcoal and paper palettes, rust accent, typography, fine rules, density, states, compact radii | `app/editorial.css`; token aliases in `globals.css` |
| `components/ProductFrame.tsx`, `ProductFrame.css`, `BrandMark.tsx` | Product rail, wordmark, active navigation, new-action button, status | Existing sidebar, branded home link and session rows |
| `pages/HomePage.tsx`, `pages/HomePage.css` | Editorial hero typography, folio, marginalia and whitespace | Existing home graph and optional knowledge summary |
| `pages/NewInterviewPage.tsx`, `pages/NewInterviewPage.css` | Form grid, field labels, selection states, CTAs | Existing teach/practice drafts and setup dialog |
| `App.tsx`, `styles/app.css` | Live workspace proportions, top bar, panel shells | Existing chat, TopBar and graph workspace |
| `components/TranscriptFeed.tsx`, `TranscriptFeed.css` | Reading hierarchy, message separation, update affordances | Existing Streamdown transcript, message cards |
| `components/StudentInputArea.tsx`, `StudentInputArea.css`, `VoiceControls.css` | Composer and microphone control presentation | Existing composer and dictation handlers |
| `pages/SessionsPage.tsx`, `SessionsPage.css` | Session history list and metadata | Existing sidebar history and search |
| `pages/ReviewPageShell.tsx`, `ReviewReadPanel.tsx`, `ReviewPageShell.css` | Evaluation reading surfaces | Existing practice cards/learning feedback |
| `pages/SettingsPage.tsx`, `SettingsPage.css`, `components/AppearanceDock.css` | Settings panels, input and appearance styling | Existing settings and modal surfaces |
| `quant/QuantTradingWorkspace.tsx`, `quant/QuantResearchWorkspace.tsx`, `styles/quant.css` | Interview-only quant screens | Not ported: no equivalent LearnHarness runtime |

## Design tokens captured from the approved editorial dark palette
- Application background: `#2a2825`
- Raised panels: `#34312d`, `#3a3732`, hover `#403c37`
- Primary ink: `#f3eee5`, subdued ink: `#cbc3b8` and `#a9a095`
- Borders: `rgba(243,238,229,.12)`, strong edge `#585148`
- Action: rust `#d47760`, hover `#e28a73`
- Typography: Newsreader/serif display, IBM Plex Sans/Source Sans UI, existing readable prose and mono fallback.
- Other: restrained shadows, 2–8px corner scale, thin rules, no dashboard-like over-decoration.

## Light mode and the complete appearance-settings audit
The approved source has **both themes**, not dark-only:
- **Light/cream**: background `#f2eddf`, panel `#fbf8ef`, raised `#f5f0e4`, ink `#1a1815`, vermilion primary `#a74733`, edge `#cec5b3`.
- **Dark**: background `#2a2825`, panel `#34312d`, primary `#d47760`, ink `#f3eee5`.
- **System / Light / Dark**: the existing LearnHarness mode schema and persisted settings provider now control the Tailwind dark class and follow OS preference when selected. Default remains Dark for existing installations.
- **Accent**: seven source options (Ink, Indigo, Teal, Amber, Vermilion, Violet, Rose) with a persisted intensity (8–28).
- **Zoom**: 25–500% (browser/Electron Chromium CSS zoom, default 100%), plus reset.
- **Corners**: Square / Soft / Round / Generous; **borders**: Quiet / Regular / Strong / Contrast.
- All new fields live in the existing versioned LearnHarness appearance delta record. No second storage scheme, provider, or migration is introduced.

### Existing LearnHarness settings protected
- **Appearance**: custom background hex, installed reading-font picker, reading font size, serif session-title toggle, Markdown heading weight, bold color, italic color.
- **Graph**: extraction, graph rendering, extraction chunk budget; separate render controls remain owned by the graph.
- **Agent/models**: model tiers, tools and prompt controls, search engine, compaction.
- **General / keys / keyboard**: updater preference, credentials, keyboard shortcuts.
- **Interface behavior**: sidebar collapse, session history, search/filter, dictation and chat controls are unchanged.

The app's default stylesheet preserves the new editorial palettes. Explicitly saved background colors still override them using mode-aware surface derivation. Existing custom font and Markdown overrides remain live. Exact typeface appearance depends on local font availability; no CDN dependencies or new font files were introduced. Screenshot-level verification is still necessary.

## Functional preservation
- The original sidebar search/filter, session creation, keyboard shortcuts and settings actions remain.
- The graph canvas, nodes, pan/zoom, extraction, practice selection, notes import and dialogs remain.
- The composer retains send/stop/steer, microphone control, draft input and enter behavior.
- React component owners and existing server/data state are unchanged; no new session state machine.

## Verification to do before merging
- Automated: run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- Manual visual: Home graph ON/OFF, new chat, teach/practice, active chat + long transcript + math, sidebar expanded/collapsed, session search/filter, settings, graph context menus, text overflow, keyboard focus and dictation.
- Screen/zoom matrix: 1366x768, 1920x1080, 2560x1440, ultrawide; Windows at 100%/125%.
- Verify saved user background/font settings, accent changes, light/dark/system switching, 25–500% zoom, desktop titlebar dragging, foreground contrast and graph readability in both palettes.
- Compare actual Electron screenshots with PR #125. Passing static tests or checking the diff does not constitute screenshot-level verification.

## Quality pass (October 28, 2026)

### Real LearnHarness logo and typography
- Source mark: `components/lh-mark.tsx`; retains the original LearnHarness SVG paths, with the spiral tinted `--primary` and ring tinted `--foreground`. No Interview-App logo/assets.
- `IBM_Plex_Sans` and `Newsreader` installed at build time with Next `next/font/google` so the Electron release contains its own font assets. Teaching body remains Source Sans 3 and math/mono remains JetBrains Mono.
- Main reading prose retains 16px default; editorial chrome avoids less than 11–12px labels, with button labels generally 12–13px. User reading font/size settings remain authoritative.
- Light/dark foreground tokens and all seven accent/foreground pairs receive WCAG-inspired static contrast tests. Mode changes suppress color transitions for one frame to avoid illegible intermediate blends.

### Graph canvas and themes
- The original Canvas 2D renderer, persisted camera, position ledger, force model, drag, layout and picking remain. No static SVG/mock graph replaces them.
- `GraphCanvasRenderer.setAppearance` changes the node, edge, label and background-derived colors without calling `setData` or perturbing simulation/camera. The root MutationObserver updates after live theme/accent/System OS changes; `document.fonts.ready` and `loadingdone` refresh cached text widths.
- Cluster region captions use lightness 78 on charcoal and 29 on cream; no pale-on-paper labels. All seven primary highlight choices affect graph nodes/links via existing CSS tokens.
- A zoom-aware coordinate conversion maps client DOMRects back to logical local canvas pixels; effective pixel density accounts for CSS interface zoom. Pure tests cover 75, 100, 125, 150, 200 percent.
- Existing graph rendering settings, graph node search/filter, cluster/physics options, and graph data files are unchanged.

### Voice/microphone integration from PR #5
- PR #5's microphone picker and the `selectedMicrophone` strict-ID/unique-label remapping algorithm were ported to this branch **without** its separate ChatGPT OAuth/runtime changes.
- `GeneralSettings`, default/sanitizer, effective resolver, strict server settings PUT parser and dialog onChange now persist the chosen microphone ID/label, while keeping auto-update and other general options.
- Missing selected device never silently records from a different input; fallback label matching requires a unique device, with explicit errors for unplugged/permissions-denied devices. Device-track `ended` cleans up and warns immediately.
- Status reflects actual phases: Requesting microphone, Mic on · connecting, Connected · listening, Finishing transcription, then Microphone off. The accent waveform is active only when the Deepgram socket has opened.
- Deepgram audio worklet, pre-open audio buffering, warm token cache, transcript flush/keyboard controls and dictation question-target routing are preserved.
- Pure tests cover device selection, selectors/errors, status state, UI rendering, startup and fallback contracts. Physical Bluetooth/USB headset switching must still be tested on a Windows installation.

### Browser visual QA and CI
- New `editorial-visual` GitHub job builds the real standalone Next app, starts the packaged server on a loopback test port, intercepts only test graph and appearance data, and runs headless Chromium with real React components.
- Captures dark/light screenshots of synthetic six-node graph at 1366×768 and 1920×1080, checks canvas dimensions, foreground/background divergence, and browser page errors, and uploads the screenshots as Actions artifacts.
- Each viewport starts without a saved graph camera so screenshots measure correct initial fit; the separate persistence/zoom tests cover retained camera and zoom behavior.
- Manual acceptance still needed for Windows Electron titlebar, actual microphone hardware, long graph/large cluster datasets, and ultrawide/125% high-DPI screenshots. The renderer QA is a browser smoke test, not proof of physical hardware fidelity.
- PR remains draft and unmerged until the latest HEAD's quality, screenshot and all desktop-platform jobs are green, plus manual Windows acceptance.

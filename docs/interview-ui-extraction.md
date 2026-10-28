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

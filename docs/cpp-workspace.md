# C++ workspace

Open Quant training → C++ workspace. Create up to eight source/header files, keep a problem statement and standard input, and save the workspace explicitly. Unsaved edits have tab-local recovery; a visible status distinguishes them from a saved server record. Concurrent-tab saves are refused when their revision is stale. **Save as new copy** preserves a draft as a new workspace.

Monaco provides the editor. Its locked assets are copied to the ignored `public/vendor/monaco` directory by `npm ci`'s postinstall hook and served from this app. The editor does not load from an external CDN. A plain editor remains available. Installation can refresh assets with `node scripts/prepare-monaco.mjs`.

Choose the files to bring into an existing or new teaching session. This saves the workspace and stages frozen source snapshots in that session's active answer/composer. Add your typed or dictated explanation and submit there. Selecting code does not automatically send it to an LLM or interrupt an unanswered question. Problem notes and unselected files remain in the workspace.

Workspaces live in `LH_DATA_DIR/training/cpp-workspace`. Source files are JSON content, not writes into the host filesystem. Filenames and record IDs are validated; the later compiler service must retain that boundary.

Reuse: `@monaco-editor/react` 4.7.0 and `monaco-editor` 0.57.0 are MIT-licensed dependencies. Their notices are retained in the installed packages; Monaco's license and third-party notices are also copied beside the distributed local editor assets. The code-evidence shape is adapted from upstream LearnHarness PR #241 (AGPL-3.0). This workspace PR does not claim that a compiler is running; execution is a separate feature PR.

# Session scratch work

Open **Scratch work** from a session toolbar to keep the drawing associated with that session and pending question/problem, or open it from Quant training for standalone work. The embedded MIT-licensed Excalidraw 0.18.1 surface supplies freehand pen input, shapes/text, erasing, undo/redo and pan/zoom. Each pad has independent pages. Local drawing assets are prepared by postinstall and served from this app.

Vector pages autosave after a pause. Status and errors remain visible. A tab-local recovery draft protects work across reloads, and revision checks refuse stale-device overwrites. **Save now** forces persistence; **Make a new copy** preserves work when another device has moved the saved version forward. Pages and their pressure/point data are stored under `LH_DATA_DIR/training/scratchpad`.

**Use this page in session** captures a bounded PNG snapshot, saves the editable vectors and stages the image in the chosen session. The learner then adds typed or dictated reasoning and explicitly submits. The actual image and its source pad/page/question references reach the agent through the same evidence path as an answer. Editing the pad afterward does not change a submitted snapshot. No drawing is sent to a model merely because it was autosaved.

The implementation embeds Excalidraw rather than replacing its input engine. Its MIT notice is retained in `third-party/excalidraw-LICENSE`; font assets are copied unchanged from the locked package, with their embedded copyright/license descriptions and URLs reproduced in `third-party/excalidraw-font-notices.txt` and served beside the assets. Fonts retain their individual terms. This feature is not a general PDF/image-import workspace; the drawing surface disables image/embedded-content tools.

Browser testing can establish drawing, persistence, undo/redo and snapshot transport. Apple Pencil pressure, palm rejection and latency on a physical iPad require testing on the user's device. Windows/iPad pairing is a separate feature; a cloud localhost URL is not an iPad connection URL.

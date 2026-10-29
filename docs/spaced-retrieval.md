# Spaced retrieval queue

Enroll a mistake-notebook entry, then review when it is due. Original recall is always available; generated entries can use fresh parameter variants. A committed answer and explanation precede references and difficulty ratings. Reload resumes an active attempt, including the feedback if an answer was already committed.

The scheduler is a transparent heuristic, not a calibrated memory model. Good begins with one day, then three days; later successful recall scales the larger of the prior interval and elapsed time by the ease factor. Easy applies an additional factor of 1.3 with at least four days. Hard uses 1.2 times the previous interval with at least one day. Again returns in ten minutes. Incorrect answers force Again regardless of selected rating. Ease remains between 1.3 and 3; intervals cap at 365 days. Each event records the formula explanation, prior due date, result, rating and elapsed time.

Exact due boundaries are inclusive and ties sort by ID. Duplicate rating submissions do not schedule twice. Snooze moves the due date by 1–7 days without recording successful recall or changing the learned interval. The UI offers a one-day snooze. Daily counts use UTC and are labelled accordingly. Nothing writes a mastery score into the knowledge graph.

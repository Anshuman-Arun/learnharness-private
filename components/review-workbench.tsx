"use client";
import { useState } from "react";
import { RetrievalQueue } from "./retrieval-queue";
import { MistakeNotebook } from "./mistake-notebook";
export function ReviewWorkbench() {
	const [view, setView] = useState("due");
	return (
		<div>
			<nav className="study-tabs" aria-label="Review">
				<button aria-pressed={view === "due"} onClick={() => setView("due")}>
					Due for recall
				</button>
				<button aria-pressed={view === "notebook"} onClick={() => setView("notebook")}>
					Notebook
				</button>
			</nav>
			<div className="study-tab-content">{view === "due" ? <RetrievalQueue /> : <MistakeNotebook />}</div>
		</div>
	);
}

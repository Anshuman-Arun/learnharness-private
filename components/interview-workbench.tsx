"use client";
import { useState } from "react";
import { EstimationTrainer } from "./estimation-trainer";
import { ProbabilityLab } from "./probability-lab";
import { StoppingLab } from "./stopping-lab";
import { QuantExamView } from "./quant-exam";
const modes = [
	{ id: "timed", label: "Timed practice" },
	{ id: "estimate", label: "Calibration" },
	{ id: "probability", label: "Probability" },
	{ id: "stopping", label: "Decisions" },
] as const;
export type InterviewMode = (typeof modes)[number]["id"];
export function InterviewWorkbench({ initialMode = "estimate" }: { initialMode?: InterviewMode }) {
	const [mode, setMode] = useState<InterviewMode>(initialMode);
	const [visited, setVisited] = useState<InterviewMode[]>([initialMode]);
	return (
		<div>
			<nav className="study-tabs" aria-label="Interview practice">
				{modes.map((m) => (
					<button
						key={m.id}
						aria-pressed={mode === m.id}
						onClick={() => {
							setMode(m.id);
							setVisited((previous) => (previous.includes(m.id) ? previous : [...previous, m.id]));
							history.replaceState(null, "", `?mode=${m.id}`);
						}}
					>
						{m.label}
					</button>
				))}
			</nav>
			{visited.map((id) => (
				<div key={id} hidden={mode !== id} className="study-tab-content">
					{id === "timed" ? (
						<QuantExamView />
					) : id === "estimate" ? (
						<EstimationTrainer />
					) : id === "probability" ? (
						<ProbabilityLab />
					) : (
						<StoppingLab />
					)}
				</div>
			))}
		</div>
	);
}

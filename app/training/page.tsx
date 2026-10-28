import Link from "next/link";
import { TrainingShell } from "@/components/training-shell";

export default function TrainingPage() {
	return <TrainingShell title="Quant training" description="Practice skills, inspect your reasoning, and take the gaps back to your learning sessions.">
		<Link href="/training/sprints" className="block rounded-xl border p-5 hover:bg-accent"><h2 className="font-semibold">4.5-hour quant sprints</h2><p>Twelve deep, bounded modules with derivations, coding, progress and unseen exit checks.</p></Link>
		<Link href="/training/retrieval" className="block rounded-xl border p-5 hover:bg-accent"><h2 className="font-semibold">Spaced retrieval</h2><p>A due queue with fresh recall, explicit difficulty, snoozes and explainable intervals.</p></Link>
		<Link href="/training/mistakes" className="block rounded-xl border p-5 hover:bg-accent"><h2 className="font-semibold">Mistake notebook</h2><p>Classify errors, preserve reasoning and demonstrate corrections on targeted retries.</p></Link>
		<Link href="/training/exam" className="block rounded-xl border p-5 hover:bg-accent"><h2 className="font-semibold">Timed quant OA</h2><p>Sectioned exams with flags, reload recovery, a firm deadline and delayed debrief.</p></Link>
		<Link href="/training/stopping" className="block rounded-xl border p-5 hover:bg-accent"><h2 className="font-semibold">Optimal stopping</h2><p>Make decisions, replay regret and derive horizon-dependent thresholds.</p></Link>
		<Link href="/training/probability" className="block rounded-xl border p-5 hover:bg-accent"><h2 className="font-semibold">Probability experiments</h2><p>Predict, simulate, pause and compare with exact distributions.</p></Link>
		<Link href="/training/estimation" className="block rounded-xl border p-5 hover:bg-accent"><h2 className="font-semibold">Estimation and confidence</h2><p>Commit estimates and uncertainty ranges; inspect reference values and calibration.</p></Link>
		<Link href="/training/scratchpad" className="block rounded-xl border p-5 hover:bg-accent"><h2 className="font-semibold">Scratch work</h2><p className="text-sm text-muted-foreground">A persistent drawing surface with pen, eraser, pages and snapshots for your tutor.</p></Link>
		<Link href="/training/cpp" className="block rounded-xl border p-5 hover:bg-accent"><h2 className="font-semibold">C++ workspace</h2><p className="text-sm text-muted-foreground">Persistent source files, a local code editor and a selective handoff to your tutor.</p></Link>
		<Link href="/training/arithmetic" className="block rounded-xl border p-5 hover:bg-accent">
			<h2 className="font-semibold">Mental arithmetic</h2><p className="text-sm text-muted-foreground">Timed keyboard rounds, configurable operations and a saved performance breakdown.</p>
		</Link>
	</TrainingShell>;
}

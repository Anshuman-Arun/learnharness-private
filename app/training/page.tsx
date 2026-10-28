import Link from "next/link";
import { TrainingShell } from "@/components/training-shell";

export default function TrainingPage() {
	return <TrainingShell title="Quant training" description="Practice skills, inspect your reasoning, and take the gaps back to your learning sessions.">
		<Link href="/training/cpp" className="block rounded-xl border p-5 hover:bg-accent"><h2 className="font-semibold">C++ workspace</h2><p className="text-sm text-muted-foreground">Persistent source files, a local code editor and a selective handoff to your tutor.</p></Link>
		<Link href="/training/arithmetic" className="block rounded-xl border p-5 hover:bg-accent">
			<h2 className="font-semibold">Mental arithmetic</h2><p className="text-sm text-muted-foreground">Timed keyboard rounds, configurable operations and a saved performance breakdown.</p>
		</Link>
	</TrainingShell>;
}

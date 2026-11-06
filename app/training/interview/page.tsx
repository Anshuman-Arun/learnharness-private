import { TrainingShell } from "@/components/training-shell";
import { InterviewWorkbench, type InterviewMode } from "@/components/interview-workbench";
export default async function Page({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
	const { mode } = await searchParams;
	const initialMode: InterviewMode =
		mode && ["timed", "estimate", "probability", "stopping"].includes(mode)
			? (mode as InterviewMode)
			: "estimate";
	return (
		<TrainingShell title="Interview practice">
			<InterviewWorkbench initialMode={initialMode} />
		</TrainingShell>
	);
}

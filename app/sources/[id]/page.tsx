import { SourceWorkspace } from "@/components/source-workspace";
import { TrainingShell } from "@/components/training-shell";
export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return (
		<TrainingShell title="Source map">
			<SourceWorkspace key={id} id={id} />
		</TrainingShell>
	);
}

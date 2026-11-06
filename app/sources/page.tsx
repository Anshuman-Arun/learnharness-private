import { SourceLibrary } from "@/components/source-library";
import { TrainingShell } from "@/components/training-shell";
export default function SourcesPage() {
	return (
		<TrainingShell title="Sources">
			<SourceLibrary />
		</TrainingShell>
	);
}

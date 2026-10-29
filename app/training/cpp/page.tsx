import { CppWorkspaceView } from "@/components/cpp-workspace";
import { TrainingShell } from "@/components/training-shell";
export default function CppPage() {
	return <TrainingShell title="C++ workspace" description="Keep code, problem notes and input together. Choose which files to bring into a learning session."><CppWorkspaceView /></TrainingShell>;
}

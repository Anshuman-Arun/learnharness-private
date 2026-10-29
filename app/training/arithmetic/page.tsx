import { ArithmeticArena } from "@/components/arithmetic-arena";
import { TrainingShell } from "@/components/training-shell";
export default function ArithmeticPage() {
	return <TrainingShell title="Mental arithmetic" description="Answer with Enter. Wrong attempts stay on the same question. Your deadline continues across reloads."><ArithmeticArena /></TrainingShell>;
}

import { ScratchpadView } from "@/components/scratchpad";
import { TrainingShell } from "@/components/training-shell";
export default async function ScratchpadPage({ searchParams }: { searchParams: Promise<{ chatId?: string; questionId?: string }> }) {
	const { chatId, questionId } = await searchParams;
	return <TrainingShell title="Scratch work" description="Draw, revise and save your reasoning. Attach a snapshot to a session when you want the tutor to inspect it."><ScratchpadView sessionId={chatId} questionId={questionId} /></TrainingShell>;
}

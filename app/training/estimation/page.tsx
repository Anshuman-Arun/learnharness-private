import { TrainingShell } from "@/components/training-shell";
import { EstimationTrainer } from "@/components/estimation-trainer";
export default function Page(){return <TrainingShell title="Estimation and confidence" description="Commit an estimate, an 80% interval and your reasoning before seeing the reference. Assess your uncertainty as well as your answer."><EstimationTrainer/></TrainingShell>;}

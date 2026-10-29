import { ESTIMATION_KINDS, estimateQuestion, estimateScore, parseEstimateAnswer, type EstimateAttempt, type EstimationKind } from "../core/estimation.ts";
import { stores } from "./stores.ts";
export function listEstimates(): EstimateAttempt[] { return stores.trainingStore.list<EstimateAttempt>("estimate").sort((a,b)=>b.startedAt-a.startedAt); }
export function estimateView(attempt: EstimateAttempt) {
 const question=estimateQuestion(attempt.kind,attempt.seed);
 const {reference: _reference,explanation: _explanation,...publicQuestion}=question;
 return {...attempt,question:attempt.answer?question:publicQuestion,...(attempt.answer?{score:estimateScore(question,attempt.answer)}:{})};
}
export function changeEstimate(raw: unknown, now=Date.now()) {
 const input=raw as Record<string,unknown>;
 if(!input||typeof input!=="object")throw new Error("Invalid estimate action");
 if(input.action==="start"){
  if(!ESTIMATION_KINDS.includes(input.kind as EstimationKind))throw new Error("Select an estimation topic");
  const attempt:EstimateAttempt={version:1,id:crypto.randomUUID(),seed:crypto.getRandomValues(new Uint32Array(1))[0]!,kind:input.kind as EstimationKind,startedAt:now};
  stores.trainingStore.write("estimate",attempt);return estimateView(attempt);
 }
 if(input.action!=="answer"||typeof input.id!=="string")throw new Error("Invalid estimate action");
 const current=stores.trainingStore.read<EstimateAttempt>("estimate",input.id);if(!current)throw new Error("Estimate not found");
 if(current.answer)throw new Error("This estimate was already committed");
 const answer=parseEstimateAnswer(input.answer),q=estimateQuestion(current.kind,current.seed);
 if(q.kind==="probability"&&answer.high>1)throw new Error("Probability bounds cannot exceed 1");
 const next={...current,answer,submittedAt:now};stores.trainingStore.write("estimate",next);return estimateView(next);
}

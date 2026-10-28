import{quantQuestion,quantCorrect,type QuantQuestion,type QuantSection}from'./quant-questions.ts';import{arithmeticQuestion,type ArithmeticConfig}from'./arithmetic.ts';import{estimateQuestion,type EstimationKind}from'./estimation.ts';import{stoppingTable,type StoppingConfig}from'./stopping.ts';
export const ERROR_CATEGORIES=['unknown','concept','conditioning','algebra','arithmetic','time','implementation','reading']as const;
export type MistakeSource={kind:'arithmetic'|'exam'|'estimate'|'stopping'|'manual';id:string;index:number};
export type RetryRecipe={kind:'quant';section:QuantSection;family:string}|{kind:'arithmetic';config:ArithmeticConfig}|{kind:'estimate';topic:EstimationKind}|{kind:'stopping';config:StoppingConfig;remaining:number}|{kind:'manual'};
export interface MistakeCandidate{source:MistakeSource;question:QuantQuestion;answer:string;reasoning:string;recipe:RetryRecipe;trigger:string}
export interface MistakeEntry extends MistakeCandidate{version:1;id:string;revision:number;category:typeof ERROR_CATEGORIES[number];correction:string;createdAt:number;updatedAt:number;demonstratedBy?:string}
export interface MistakeRetry{version:1;id:string;entryId:string;mode:'original'|'variant';entryRevision?:number;question:QuantQuestion;createdAt:number;submittedAt?:number;answer?:string;reasoning?:string;correct?:boolean}
export function retryQuestion(entry:MistakeEntry,seed:number,variant:boolean):QuantQuestion{
 if(!variant)return structuredClone(entry.question);const r=entry.recipe;
 for(let offset=0;offset<1000;offset++){
  const s=(seed+offset)>>>0;let q:QuantQuestion;
  if(r.kind==='quant'){q=quantQuestion(r.section,s,0);if(q.family!==r.family)continue;}
  else if(r.kind==='arithmetic'){const a=arithmeticQuestion(r.config,s,0);q={section:'arithmetic',prompt:a.display,expected:a.answer,explanation:`Check the inverse operation. Reference: ${a.answer}.`,tolerance:0,family:a.operation};}
  else if(r.kind==='estimate'){const a=estimateQuestion(r.topic,s);q={section:'reasoning',prompt:a.prompt+' Retry target: within 1% of the reference.',expected:a.reference,explanation:a.explanation,tolerance:Math.abs(a.reference)*.01,family:'estimate-'+a.kind};}
  else if(r.kind==='stopping'){const config={...r.config,sides:2+s%19},remaining=1+(s>>>8)%Math.max(1,config.horizon-1);const expected=stoppingTable(config)[remaining]!.value-config.cost;q={section:'reasoning',prompt:`Fair ${config.sides}-sided die, reroll cost ${config.cost}, ${remaining} further draws. What is the continuation value of rejecting the current offer?`,expected,explanation:'Before rejecting, subtract the next reroll cost from V(remaining). Costs already paid are sunk.',tolerance:1e-6,family:'stopping-value'};}
  else throw Error('Variants are available for generated problems; use original retry for a manual entry');
  if(q.prompt!==entry.question.prompt)return q;
 }
 throw Error('This fixed configuration has no distinct variant; use an original retry');
}
export function correctMistakeRetry(retry:MistakeRetry,answer:string){return quantCorrect(retry.question,answer);}
export function mistakeRetryView(retry:MistakeRetry):Omit<MistakeRetry,"question">&{question:Omit<QuantQuestion,"expected"|"explanation"|"tolerance">&Partial<Pick<QuantQuestion,"expected"|"explanation"|"tolerance">>}{const{expected:_e,explanation:_x,tolerance:_t,...publicQuestion}=retry.question;return{...retry,question:retry.submittedAt!==undefined?retry.question:publicQuestion};}

export function canDemonstrateCorrection(entry:MistakeEntry,retry:Pick<MistakeRetry,'entryId'|'correct'|'submittedAt'|'entryRevision'|'createdAt'>|null|undefined):boolean {
 return !!entry.correction.trim() && retry?.correct===true && retry.entryId===entry.id && retry.submittedAt!==undefined && (retry.entryRevision===undefined ? retry.createdAt>entry.updatedAt : retry.entryRevision===entry.revision);
}

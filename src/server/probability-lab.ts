import {advanceExperiment,exactExperiment,parseExperiment,type ProbabilityExperiment} from '../core/probability-lab.ts';
import {stores} from './stores.ts';
export function probabilityExperiments(){return stores.trainingStore.list<ProbabilityExperiment>('experiment').sort((a,b)=>b.createdAt-a.createdAt);}
export function experimentView(e:ProbabilityExperiment){return{...e,...(e.completed?{exact:exactExperiment(e.config)}:{})};}
export function changeExperiment(raw:unknown,now=Date.now()){
 const a=raw as Record<string,unknown>;if(!a||typeof a!=='object')throw Error('Invalid experiment action');
 if(a.action==='start'){
  const config=parseExperiment(a.config);if(typeof a.prediction!=='number'||!Number.isFinite(a.prediction)||a.prediction<0||a.prediction>1)throw Error('Predict a probability between 0 and 1');
  if(typeof a.reasoning!=='string'||!a.reasoning.trim()||a.reasoning.length>8000)throw Error('Explain your prediction');
  if(typeof a.targetTrials!=='number'||!Number.isInteger(a.targetTrials)||a.targetTrials<100||a.targetTrials>100000)throw Error('Use 100–100000 trials');
  const e:ProbabilityExperiment={version:1,id:crypto.randomUUID(),seed:crypto.getRandomValues(new Uint32Array(1))[0]!,config,prediction:a.prediction,reasoning:a.reasoning.trim(),targetTrials:a.targetTrials,completed:0,eligible:0,successes:0,histogram:{},createdAt:now};stores.trainingStore.write('experiment',e);return experimentView(e);
 }
 if(a.action!=='advance'||typeof a.id!=='string')throw Error('Invalid experiment action');const e=stores.trainingStore.read<ProbabilityExperiment>('experiment',a.id);if(!e)throw Error('Experiment not found');const next=advanceExperiment(e,a.offset,a.batch);stores.trainingStore.write('experiment',next);return experimentView(next);
}

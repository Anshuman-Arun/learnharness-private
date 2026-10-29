export type ExperimentConfig = {kind:"dice";dice:number;sides:number;threshold:number}|{kind:"urn";red:number;blue:number;draws:number;threshold:number}|{kind:"diagnostic";prevalence:number;sensitivity:number;specificity:number};
export interface ProbabilityExperiment {version:1;id:string;config:ExperimentConfig;seed:number;prediction:number;reasoning:string;targetTrials:number;completed:number;eligible:number;successes:number;histogram:Record<string,number>;createdAt:number}
export function parseExperiment(raw:unknown):ExperimentConfig{
 const c=raw as ExperimentConfig;if(!c||typeof c!=="object")throw Error("Experiment settings are required");
 const integer=(v:number,min:number,max:number)=>Number.isInteger(v)&&v>=min&&v<=max;
 if(c.kind==="dice"&&integer(c.dice,1,6)&&integer(c.sides,2,20)&&integer(c.threshold,c.dice,c.dice*c.sides))return{kind:c.kind,dice:c.dice,sides:c.sides,threshold:c.threshold};
 if(c.kind==="urn"&&integer(c.red,0,100)&&integer(c.blue,0,100)&&c.red+c.blue>=1&&c.red+c.blue<=100&&integer(c.draws,1,Math.min(20,c.red+c.blue))&&integer(c.threshold,0,c.draws))return{kind:c.kind,red:c.red,blue:c.blue,draws:c.draws,threshold:c.threshold};
 if(c.kind==="diagnostic"&&[c.prevalence,c.sensitivity,c.specificity].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)&&c.prevalence*c.sensitivity+(1-c.prevalence)*(1-c.specificity)>0)return{kind:c.kind,prevalence:c.prevalence,sensitivity:c.sensitivity,specificity:c.specificity};
 throw Error("Invalid experiment bounds or impossible conditioning event");
}
export function exactExperiment(config:ExperimentConfig){
 const c=parseExperiment(config);let distribution:Record<string,number>={};let probability:number;let explanation:string;
 if(c.kind==="dice"){
  distribution={0:1};for(let d=0;d<c.dice;d++){const next:Record<string,number>={};for(const [sum,p]of Object.entries(distribution))for(let face=1;face<=c.sides;face++)next[Number(sum)+face]=(next[Number(sum)+face]??0)+p/c.sides;distribution=next;}
  probability=Object.entries(distribution).reduce((sum,[value,p])=>sum+(Number(value)>=c.threshold?p:0),0);explanation="Convolve the uniform die distribution once per die, then sum the mass at or above the threshold.";
 }else if(c.kind==="urn"){
  distribution={0:1};for(let drawn=0;drawn<c.draws;drawn++){const next:Record<string,number>={};for(const [key,p]of Object.entries(distribution)){const red=Number(key),remaining=c.red+c.blue-drawn,pr=(c.red-red)/remaining;if(pr>0)next[red+1]=(next[red+1]??0)+p*pr;if(pr<1)next[red]=(next[red]??0)+p*(1-pr);}distribution=next;}
  probability=Object.entries(distribution).reduce((sum,[red,p])=>sum+(Number(red)>=c.threshold?p:0),0);explanation="Track the number of red draws. Each transition uses the remaining red and blue counts, so draws are dependent (sampling without replacement).";
 }else{
  const tp=c.prevalence*c.sensitivity,fp=(1-c.prevalence)*(1-c.specificity);probability=tp/(tp+fp);distribution={"true positive":tp,"false positive":fp,"true negative":(1-c.prevalence)*c.specificity,"false negative":c.prevalence*(1-c.sensitivity)};explanation="Among positive tests, the fraction with the condition is prevalence × sensitivity divided by [prevalence × sensitivity + (1 − prevalence) × (1 − specificity)]. The denominator is positive tests, not all people.";
 }
 return{probability:Math.max(0,Math.min(1,probability)),distribution,explanation};
}
export function trialRandom(seed:number,index:number){let state=(seed^Math.imul(index+1,0x9e3779b9))>>>0;return()=>{state=(state+0x6d2b79f5)>>>0;let t=Math.imul(state^state>>>15,state|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function advanceExperiment(experiment:ProbabilityExperiment,offset:unknown,batch:unknown):ProbabilityExperiment{
 if(offset!==experiment.completed)throw Error("Trial batch is stale; reload this experiment");
 if(typeof batch!=="number"||!Number.isInteger(batch)||batch<1||batch>2000)throw Error("Use batches of 1–2000 trials");
 const next={...experiment,histogram:{...experiment.histogram}},c=experiment.config,end=Math.min(experiment.targetTrials,experiment.completed+batch);
 for(let i=experiment.completed;i<end;i++){
  const rng=trialRandom(experiment.seed,i);let key:string,success=false,eligible=true;
  if(c.kind==="dice"){let sum=0;for(let d=0;d<c.dice;d++)sum+=1+Math.floor(rng()*c.sides);key=String(sum);success=sum>=c.threshold;}
  else if(c.kind==="urn"){let red=0;for(let d=0;d<c.draws;d++)if(rng()<(c.red-red)/(c.red+c.blue-d))red++;key=String(red);success=red>=c.threshold;}
  else{const condition=rng()<c.prevalence,positive=rng()<(condition?c.sensitivity:1-c.specificity);eligible=positive;success=condition&&positive;key=condition?(positive?"true positive":"false negative"):(positive?"false positive":"true negative");}
  next.completed++;if(eligible)next.eligible++;if(success)next.successes++;next.histogram[key]=(next.histogram[key]??0)+1;
 }
 return next;
}
export function wilsonInterval(successes:number,total:number):[number,number]|null{
 if(!total)return null;const z=1.959963984540054,p=successes/total,z2=z*z,denom=1+z2/total,centre=(p+z2/(2*total))/denom,half=z*Math.sqrt(p*(1-p)/total+z2/(4*total*total))/denom;return[successes===0?0:Math.max(0,centre-half),successes===total?1:Math.min(1,centre+half)];
}

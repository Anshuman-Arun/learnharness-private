import{trialRandom}from'./probability-lab.ts';
export const QUANT_SECTIONS=['arithmetic','probability','reasoning']as const;
export type QuantSection=typeof QUANT_SECTIONS[number];
export interface QuantQuestion{section:QuantSection;prompt:string;expected:number;explanation:string;tolerance:number;family:string}
export function quantQuestion(section:QuantSection,seed:number,index:number):QuantQuestion{
 const rng=trialRandom(seed,index),integer=(a:number,b:number)=>a+Math.floor(rng()*(b-a+1));
 if(section==='arithmetic'){const a=integer(12,99),b=integer(3,24),op=integer(0,2);return{section,prompt:op===0?`${a} × ${b}`:op===1?`${a*b} ÷ ${b}`:`${a}² − ${a-1}²`,expected:op===0?a*b:op===1?a:2*a-1,explanation:op===0?`Distribute across convenient factors: ${a} × ${b} = ${a*b}.`:op===1?`Invert multiplication: ${a} × ${b} = ${a*b}.`:`Use x² − y² = (x−y)(x+y), giving ${2*a-1}.`,tolerance:0,family:op===0?'product':op===1?'division':'square-difference'};}
 const family=integer(0,2);
 if(section==='probability'){
  if(family===0){const red=integer(2,8),blue=integer(2,8),n=red+blue;return{section,prompt:`An urn has ${red} red and ${blue} blue balls. Two are drawn without replacement. What is the probability both are red?`,expected:red*(red-1)/(n*(n-1)),explanation:`Multiply P(first red) × P(second red | first red): ${red}/${n} × ${red-1}/${n-1}.`,tolerance:1e-6,family:'urn'};}
  if(family===1){const base=integer(1,8)/100,sensitivity=.9,specificity=.95,p=base*sensitivity/(base*sensitivity+(1-base)*(1-specificity));return{section,prompt:`A condition affects ${(base*100).toFixed(0)}% of people. A test has 90% sensitivity and 95% specificity. Given a positive result, what is the probability of the condition?`,expected:p,explanation:`Bayes: (${base} × .9) / (${base} × .9 + ${1-base} × .05). Normalize over all positive tests.`,tolerance:1e-6,family:'bayes'};}
  const sides=integer(4,12),threshold=integer(2,sides);return{section,prompt:`Roll two independent fair ${sides}-sided dice labelled 1 through ${sides}. What is P(maximum ≤ ${threshold})?`,expected:(threshold/sides)**2,explanation:`Both dice must be ≤ ${threshold}. Independence gives (${threshold}/${sides})².`,tolerance:1e-6,family:'max-dice'};
 }
 if(family===0){const n=integer(5,20),days=integer(20,100);return{section,prompt:`${n} independent samples are uniformly assigned to ${days} buckets. What is the expected number of unordered colliding pairs?`,expected:n*(n-1)/(2*days),explanation:`Use one indicator per unordered pair. There are n(n−1)/2 pairs, each collides with probability 1/${days}; linearity needs no pairwise independence.`,tolerance:1e-6,family:'collision-indicators'};}
 if(family===1){const n=integer(3,12);return{section,prompt:`Take ${n} independent Uniform(0,1) samples. What is the expected minimum?`,expected:1/(n+1),explanation:`P(min > t) = (1−t)^${n}. Integrate from 0 to 1 to obtain 1/(${n}+1).`,tolerance:1e-6,family:'uniform-min'};}
 const n=integer(4,20);return{section,prompt:`A uniformly random permutation has ${n} distinct elements. What is its expected number of inversions?`,expected:n*(n-1)/4,explanation:`Each of n(n−1)/2 index pairs is inverted with probability 1/2. Sum the indicators' expectations.`,tolerance:1e-6,family:'inversion-indicators'};
}
export function numericAnswer(text:string):number|null{const s=text.trim();if(!s)return null;const fraction=s.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\/\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);const n=fraction?Number(fraction[1])/Number(fraction[2]):/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s)?Number(s):NaN;return Number.isFinite(n)?n:null;}
export function quantCorrect(q:QuantQuestion,text:string){const value=numericAnswer(text);return value!==null&&Math.abs(value-q.expected)<=q.tolerance;}

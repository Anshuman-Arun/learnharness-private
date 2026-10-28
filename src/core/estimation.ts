export const ESTIMATION_KINDS = ["product", "root", "log", "probability", "fermi"] as const;
export type EstimationKind = typeof ESTIMATION_KINDS[number];
export interface EstimateQuestion { kind: EstimationKind; prompt: string; reference: number; explanation: string; assumptionDependent: boolean }
export interface EstimateAnswer { estimate: number; low: number; high: number; reasoning: string }
export interface EstimateAttempt { version: 1; id: string; seed: number; kind: EstimationKind; startedAt: number; submittedAt?: number; answer?: EstimateAnswer }
export function estimateQuestion(kind: EstimationKind, seed: number): EstimateQuestion {
 const n = seed >>> 0, a = 12 + n % 78, b = 13 + (n >>> 8) % 77;
 if (kind === "product") return { kind, prompt: `Estimate ${a} × ${b} mentally.`, reference: a*b, explanation: `Split the product: ${a} × (${Math.floor(b/10)*10} + ${b%10}) = ${a*Math.floor(b/10)*10} + ${a*(b%10)} = ${a*b}.`, assumptionDependent: false };
 if (kind === "root") { const value = 101 + n%9800; return { kind, prompt: `Estimate √${value}.`, reference: Math.sqrt(value), explanation: `Bracket between adjacent integer squares, then interpolate. Check by squaring your estimate. Exact reference: √${value}.`, assumptionDependent: false }; }
 if (kind === "log") { const value = 2 + n%999; return { kind, prompt: `Estimate the natural logarithm ln(${value}).`, reference: Math.log(value), explanation: `Factor into familiar values (ln 2 ≈ .693, ln 10 ≈ 2.303), then adjust. Reference is the natural logarithm, not log base 10.`, assumptionDependent: false }; }
 if (kind === "probability") { const people=5+n%46;let distinct=1;for(let i=0;i<people;i++)distinct*=1-i/365;return { kind, prompt:`In a group of ${people}, estimate the probability of at least one shared birthday. Assume independent, uniformly distributed birthdays on 365 days. Use a probability between 0 and 1.`,reference:1-distinct,explanation:`Use the complement: 1 − ∏(1 − i/365), for i = 0,…,${people-1}. The Poisson shortcut is 1 − exp(−n(n−1)/730).`,assumptionDependent:false }; }
 const city=1+n%9, trips=2+(n>>>8)%4, occupancy=1.2+((n>>>16)%5)/10;
 return {kind,prompt:`Estimate annual car-kilometres in a city of ${city} million people. Choose your assumptions and explain the decomposition. Give an 80% plausible range.`,reference:city*1e6*trips*8*365/occupancy,explanation:`One reference scenario assumes ${trips} person-trips per resident per day, all by car, 8 km per trip, ${occupancy.toFixed(1)} occupants per car: population × trips × distance × 365 ÷ occupancy. Your transport share, distances and occupancy may differ; evaluate assumptions rather than treating this scenario as truth.`,assumptionDependent:true};
}
export function parseEstimateAnswer(raw: unknown): EstimateAnswer {
 const a=raw as EstimateAnswer;
 if(!a||![a.estimate,a.low,a.high].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=1e18)||a.low>a.estimate||a.estimate>a.high)throw new Error("Use positive numbers with lower bound ≤ estimate ≤ upper bound");
 if(typeof a.reasoning!=="string"||!a.reasoning.trim()||a.reasoning.length>8000)throw new Error("Explain your assumptions or approximation (up to 8000 characters)");
 return {estimate:a.estimate,low:a.low,high:a.high,reasoning:a.reasoning.trim()};
}
export function estimateScore(question: EstimateQuestion, answer: EstimateAnswer) {
 const {reference:y}=question, {low,high,estimate}=answer;
 const covered=low<=y&&y<=high, logError=Math.abs(Math.log(estimate)-Math.log(y));
 // Central 80% interval score in natural-log units; narrower intervals are rewarded only when calibrated.
 const l=Math.log(low),u=Math.log(high),target=Math.log(y);
 const intervalScore=u-l+10*Math.max(l-target,0)+10*Math.max(target-u,0);
 const factor=Math.exp(logError);
 return {factorError:Number.isFinite(factor)?factor:null,logError,covered,intervalScore,assumptionDependent:question.assumptionDependent};
}
export function estimationCalibration(attempts: EstimateAttempt[]) {
 const exact=attempts.filter(a=>a.answer&&a.submittedAt!==undefined&&a.kind!=="fermi");
 const scores=exact.map(a=>estimateScore(estimateQuestion(a.kind,a.seed),a.answer!));
 return {count:scores.length,coverage:scores.length?scores.filter(s=>s.covered).length/scores.length:null,meanLogError:scores.length?scores.reduce((s,x)=>s+x.logError,0)/scores.length:null,meanIntervalScore:scores.length?scores.reduce((s,x)=>s+x.intervalScore,0)/scores.length:null};
}

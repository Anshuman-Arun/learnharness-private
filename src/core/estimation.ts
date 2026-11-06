export const ESTIMATION_KINDS = ["product", "root", "log", "probability", "fermi", "tail-risk", "evidence", "occupancy"] as const;
export type EstimationKind = typeof ESTIMATION_KINDS[number];
export interface EstimateQuestion { kind: EstimationKind; prompt: string; reference: number; explanation: string; assumptionDependent: boolean }
export interface EstimateAnswer { estimate: number; low: number; high: number; reasoning: string }
export interface EstimateAttempt { version: 1; id: string; seed: number; kind: EstimationKind; startedAt: number; submittedAt?: number; answer?: EstimateAnswer }
export function estimateQuestion(kind: EstimationKind, seed: number): EstimateQuestion {
 const n = seed >>> 0, a = 12 + n % 78, b = 13 + (n >>> 8) % 77;
 if (kind === "tail-risk") { const servers = 1000 + n % 9000, chance = (1 + (n >>> 8) % 8) / 100000; return { kind, prompt: `A fleet of ${servers} independent workers each fails during a batch with probability ${chance}. Estimate the probability at least one fails, and give an 80% uncertainty interval for your approximation. Explain when replacing the exact calculation by a first-order sum becomes unsafe.`, reference: -Math.expm1(servers * Math.log1p(-chance)), explanation: `The complement is (1−p)^N, so the exact reference is 1−(1−p)^N. The Poisson approximation is 1−exp(−Np). Np is only a first-order approximation when Np is small. A shared outage invalidates the independence model; marginal failure rates alone cannot determine the fleet risk.`, assumptionDependent: false }; }
 if (kind === "evidence") { const prior = 1 / (100 + n % 900), lr = 5 + (n >>> 8) % 45; return { kind, prompt: `An anomaly has prior probability 1/${Math.round(1/prior)}. A signal is ${lr} times as likely with the anomaly as without it. Estimate the posterior probability. State the odds update and whether two repeated copies of this signal justify squaring the likelihood ratio.`, reference: prior * lr / (1 - prior + prior * lr), explanation: `Prior odds p/(1−p), multiplied by LR=${lr}, then converted back by o/(1+o). Repeated copies of the same observation do not provide independent evidence. Two different signals require conditional independence under both hypotheses before their likelihood ratios multiply.`, assumptionDependent: false }; }
 if (kind === "occupancy") { const buckets=100+n%900, draws=100+(n>>>8)%1900; return {kind,prompt:`${draws} requests independently choose one of ${buckets} servers uniformly. Estimate the number of servers receiving at least one request. Explain why expected colliding pairs is a different quantity, and what changes for unequal server probabilities.`,reference:buckets*(-Math.expm1(draws*Math.log1p(-1/buckets))),explanation:`Sum one occupied indicator per server: B[1−(1−1/B)^N]. The exponential approximation is B(1−exp(−N/B)). Expected colliding pairs is N(N−1)/(2B), which can exceed B. With unequal p_i, use sum_i [1−(1−p_i)^N].`,assumptionDependent:false}; }
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

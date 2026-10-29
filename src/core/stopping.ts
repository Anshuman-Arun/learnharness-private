import {trialRandom} from './probability-lab.ts';
export interface StoppingConfig {sides:number;horizon:number;cost:number}
export interface StopDecision {index:number;offer:number;remaining:number;choice:'stop'|'continue';regret:number;stopValue:number;continueValue:number|null}
export interface StoppingGame {version:1;id:string;seed:number;config:StoppingConfig;predictedValue:number;reasoning:string;createdAt:number;decisions:StopDecision[];finished:boolean;payoff?:number}
export function parseStopping(raw:unknown):StoppingConfig{const c=raw as StoppingConfig;if(!c||!Number.isInteger(c.sides)||c.sides<2||c.sides>100||!Number.isInteger(c.horizon)||c.horizon<1||c.horizon>20||typeof c.cost!=='number'||!Number.isFinite(c.cost)||c.cost<0||c.cost>100)throw Error('Use 2–100 faces, 1–20 draws and a reroll cost of 0–100');return{sides:c.sides,horizon:c.horizon,cost:c.cost};}
/** V[n] is the value before observing a draw, with n draws available. */
export function stoppingTable(config:StoppingConfig){const c=parseStopping(config),values=[0];for(let n=1;n<=c.horizon;n++){let total=0;for(let face=1;face<=c.sides;face++)total+=n===1?face:Math.max(face,values[n-1]!-c.cost);values.push(total/c.sides);}return values.map((value,draws)=>({draws,value,continuation:draws>1?values[draws-1]!-c.cost:null}));}
export function stoppingOffer(game:StoppingGame,index=game.decisions.length){return 1+Math.floor(trialRandom(game.seed,index)()*game.config.sides);}
export function decideStopping(game:StoppingGame,rawChoice:unknown,index:unknown):StoppingGame{
 if(game.finished)throw Error('This game is finished');if(index!==game.decisions.length)throw Error('Decision is stale');if(rawChoice!=='stop'&&rawChoice!=='continue')throw Error('Choose stop or continue');
 const offer=stoppingOffer(game),remaining=game.config.horizon-game.decisions.length-1;
 if(!remaining&&rawChoice==='continue')throw Error('The final draw must be accepted');
 const continuation=remaining?stoppingTable(game.config)[remaining]!.value-game.config.cost:null,best=continuation===null?offer:Math.max(offer,continuation),chosen=rawChoice==='stop'?offer:continuation!;
 const decision:StopDecision={index:game.decisions.length,offer,remaining,choice:rawChoice,regret:Math.max(0,best-chosen),stopValue:offer,continueValue:continuation};
 const finished=rawChoice==='stop';return{...game,decisions:[...game.decisions,decision],finished,...(finished?{payoff:offer-game.decisions.length*game.config.cost}:{})};
}
export function staticThresholdValue(config:StoppingConfig,threshold:number){let value=(config.sides+1)/2;for(let n=2;n<=config.horizon;n++){let sum=0;for(let x=1;x<=config.sides;x++)sum+=x>=threshold?x:value-config.cost;value=sum/config.sides;}return value;}
export function compareStoppingPolicies(config:StoppingConfig,threshold:number,seed:number,trials=5000){
 if(!Number.isFinite(threshold)||threshold<1||threshold>config.sides+1)throw Error('Threshold must be between 1 and faces + 1');
 const table=stoppingTable(config);let optimal=0,heuristic=0;
 for(let run=0;run<trials;run++){let optimalPayoff:number|undefined,staticPayoff:number|undefined;for(let i=0;i<config.horizon;i++){const offer=1+Math.floor(trialRandom((seed^Math.imul(run+1,0x85ebca6b))>>>0,i)()*config.sides),remaining=config.horizon-i-1;if(optimalPayoff===undefined&&(!remaining||offer>=table[remaining]!.value-config.cost))optimalPayoff=offer-i*config.cost;if(staticPayoff===undefined&&(!remaining||offer>=threshold))staticPayoff=offer-i*config.cost;}optimal+=optimalPayoff!;heuristic+=staticPayoff!;}
 return{trials,optimalExact:table[config.horizon]!.value,staticExact:staticThresholdValue(config,threshold),optimalMean:optimal/trials,staticMean:heuristic/trials};
}

import assert from'node:assert/strict';import{after,describe,it}from'node:test';import fs from'node:fs';import os from'node:os';import path from'node:path';
import{stoppingTable,stoppingOffer,decideStopping,staticThresholdValue,compareStoppingPolicies,type StoppingGame}from'../src/core/stopping.ts';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lh-stopping-'));process.env.LH_DATA_DIR=dir;const{changeStopping,stoppingGames}=await import('../src/server/stopping.ts');after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const game:StoppingGame={version:1,id:'game',seed:1,config:{sides:6,horizon:3,cost:0},predictedValue:4,reasoning:'derive',createdAt:0,decisions:[],finished:false};
describe('finite-horizon stopping',()=>{
 it('matches hand-computed backward induction and sunk reroll costs',()=>{const t=stoppingTable(game.config);assert.equal(t[1]?.value,3.5);assert.equal(t[2]?.value,4.25);assert.ok(Math.abs(t[3]!.value-14/3)<1e-12);assert.equal(stoppingTable({...game.config,cost:100})[3]?.value,3.5);assert.ok(Math.abs(stoppingTable({...game.config,cost:1})[2]!.value-23/6)<1e-12);});
 it('forces terminal acceptance, locks decisions and accounts for paid costs',()=>{let g={...game,config:{...game.config,horizon:2,cost:1}};g=decideStopping(g,'continue',0);assert.throws(()=>decideStopping(g,'continue',1),/final draw/);const done=decideStopping(g,'stop',1);assert.equal(done.payoff,done.decisions[1]!.offer-1);assert.equal(done.decisions[1]!.regret,0);assert.throws(()=>decideStopping(done,'stop',2),/finished/);assert.throws(()=>decideStopping(game,'stop',2),/stale/);});
 it('measures conditional action regret rather than realized payoff shortfall',()=>{let g=game;for(let seed=0;seed<100;seed++)if(stoppingOffer({...game,seed})===6){g={...game,seed};break;}const next=decideStopping(g,'continue',0);assert.equal(next.decisions[0]?.regret,1.75);assert.equal(decideStopping(g,'stop',0).decisions[0]?.regret,0);});
 it('dominates all static thresholds in expectation and compares using repeatable shared offers',()=>{for(let threshold=1;threshold<=7;threshold+=.5)assert.ok(staticThresholdValue(game.config,threshold)<=stoppingTable(game.config)[3]!.value+1e-12);const a=compareStoppingPolicies(game.config,4,42);assert.deepEqual(a,compareStoppingPolicies(game.config,4,42));assert.ok(Math.abs(a.optimalMean-a.optimalExact)<.1);assert.ok(Math.abs(a.staticMean-a.staticExact)<.1);});
 it('hides future seeds and decision values until finished and restores persisted games',()=>{let g=changeStopping({action:'start',config:{sides:6,horizon:2,cost:0},predictedValue:4,reasoning:'Compare current offer with remaining value'});assert.equal('seed'in g,false);assert.equal('table'in g,false);g=changeStopping({action:'decide',id:g.id,index:0,choice:'continue'});assert.equal('regret'in g.decisions[0]!,false);const done=changeStopping({action:'decide',id:g.id,index:1,choice:'stop'});assert.ok("table" in done && done.table);assert.ok('regret'in done.decisions[0]!);assert.equal(stoppingGames().find(x=>x.id===g.id)?.finished,true);});
});

it('agrees with an exhaustive offer-tree oracle at horizon and cost boundaries',()=>{
 function value(sides:number,draws:number,cost:number):number{
  let total=0;
  for(let offer=1;offer<=sides;offer++)total+=draws===1?offer:Math.max(offer,value(sides,draws-1,cost)-cost);
  return total/sides;
 }
 for(const sides of [2,3,6])for(const horizon of [1,2,4])for(const cost of [0,.25,1,100]){
  const config={sides,horizon,cost};
  assert.ok(Math.abs(stoppingTable(config)[horizon]!.value-value(sides,horizon,cost))<1e-12);
 }
});

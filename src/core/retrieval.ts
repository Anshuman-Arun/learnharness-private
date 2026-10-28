export const REVIEW_RATINGS=['again','hard','good','easy']as const;export type ReviewRating=typeof REVIEW_RATINGS[number];
export interface ReviewEvent{retryId:string;reviewedAt:number;rating:ReviewRating;correct:boolean;elapsedDays:number;previousDueAt:number;dueAt:number;intervalDays:number;explanation:string}
export interface ReviewCard{version:1;id:string;entryId:string;revision:number;createdAt:number;dueAt:number;intervalDays:number;ease:number;repetitions:number;lapses:number;lastReviewedAt?:number;activeRetryId?:string;history:ReviewEvent[]}
export const REVIEW_DAY=86400000;
export function scheduleReview(card:ReviewCard,rating:ReviewRating,correct:boolean,retryId:string,now:number):ReviewCard{
 if(!REVIEW_RATINGS.includes(rating))throw Error('Choose again, hard, good or easy');if(!Number.isFinite(now)||now<(card.lastReviewedAt??card.createdAt))throw Error('Review time cannot move backwards');
 const effective=correct?rating:'again',elapsedDays=card.lastReviewedAt===undefined?0:(now-card.lastReviewedAt)/REVIEW_DAY,base=Math.max(card.intervalDays,elapsedDays),ease=Math.max(1.3,Math.min(3,card.ease+(effective==='easy'?.15:effective==='hard'?-.15:effective==='again'?-.2:0)));
 const intervalDays=effective==='again'?10/1440:effective==='hard'?Math.max(1,card.intervalDays*1.2):effective==='good'?(card.repetitions===0?1:card.repetitions===1?3:Math.max(1,base*ease)):Math.max(4,base*ease*1.3);
 const bounded=Math.min(365,intervalDays),dueAt=now+Math.round(bounded*REVIEW_DAY),explanation=effective==='again'?`${correct?'Rated again':'Incorrect answer overrides the rating'}: revisit in 10 minutes.`:effective==='hard'?`Hard: previous interval × 1.2, at least one day (${bounded.toFixed(2)} days).`:`${effective==='easy'?'Easy':'Good'}: ${card.repetitions<2&&effective==='good'?'introductory step':`interval or elapsed time × ease ${ease.toFixed(2)}${effective==='easy'?' × 1.3':''}`} (${bounded.toFixed(2)} days, capped at 365).`;
 const event:ReviewEvent={retryId,reviewedAt:now,rating,correct,elapsedDays,previousDueAt:card.dueAt,dueAt,intervalDays:bounded,explanation};
 const{activeRetryId:_active,...previous}=card;
 return{...previous,revision:card.revision+1,dueAt,intervalDays:bounded,ease,repetitions:effective==='again'?0:card.repetitions+1,lapses:card.lapses+(!correct?1:0),lastReviewedAt:now,history:[...card.history,event].slice(-365)};
}
export function dueReviews(cards:ReviewCard[],now:number){return cards.filter(c=>c.dueAt<=now).sort((a,b)=>a.dueAt-b.dueAt||a.id.localeCompare(b.id));}

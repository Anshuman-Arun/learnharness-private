import{stores}from'./stores.ts';import{changeMistake}from'./mistakes.ts';import{mistakeRetryView,type MistakeEntry,type MistakeRetry}from'../core/mistakes.ts';import{REVIEW_DAY,REVIEW_RATINGS,scheduleReview,dueReviews,type ReviewCard,type ReviewRating}from'../core/retrieval.ts';
export function reviewQueue(now=Date.now()){
 const cards=stores.trainingStore.list<ReviewCard>('review'),entries=stores.trainingStore.list<MistakeEntry>('mistake');return{serverNow:now,cards:cards.sort((a,b)=>a.dueAt-b.dueAt||a.id.localeCompare(b.id)),dueIds:dueReviews(cards,now).map(c=>c.id),entries:entries.map(e=>({id:e.id,prompt:e.question.prompt,family:e.question.family,category:e.category,variant:e.recipe.kind!=='manual'})),activeRetries:cards.flatMap(c=>{const r=c.activeRetryId?stores.trainingStore.read<MistakeRetry>('mistake-retry',c.activeRetryId):null;return r?[mistakeRetryView(r)]:[]}),reviewedToday:cards.reduce((sum,c)=>sum+c.history.filter(e=>new Date(e.reviewedAt).toISOString().slice(0,10)===new Date(now).toISOString().slice(0,10)).length,0)};
}
export function changeReview(raw:unknown,now=Date.now()){
 const a=raw as Record<string,unknown>;if(!a||typeof a!=='object'||typeof a.id!=='string')throw Error('Review id and action required');
 if(a.action==='enroll'){const entry=stores.trainingStore.read<MistakeEntry>('mistake',a.id);if(!entry)throw Error('Notebook entry not found');const current=stores.trainingStore.read<ReviewCard>('review',a.id);if(current)return{card:current};const card:ReviewCard={version:1,id:entry.id,entryId:entry.id,revision:0,createdAt:now,dueAt:now,intervalDays:0,ease:2.5,repetitions:0,lapses:0,history:[]};stores.trainingStore.write('review',card);return{card};}
 const card=stores.trainingStore.read<ReviewCard>('review',a.id);if(!card)throw Error('Review card not found');
 if(a.action==='rate'&&typeof a.retryId==='string'&&card.history.some(e=>e.retryId===a.retryId))return{card};
 if(a.revision!==card.revision)throw Error('Review changed in another tab; reload first');
 if(a.action==='snooze'){if(typeof a.days!=='number'||!Number.isInteger(a.days)||a.days<1||a.days>7)throw Error('Snooze for 1–7 days');const next={...card,dueAt:Math.max(now,card.dueAt)+a.days*REVIEW_DAY,revision:card.revision+1,activeRetryId:undefined};stores.trainingStore.write('review',next);return{card:next};}
 if(a.action==='start'){
  if(card.activeRetryId){const retry=stores.trainingStore.read<MistakeRetry>('mistake-retry',card.activeRetryId);if(retry)return{card,retry:mistakeRetryView(retry)};}
  if(card.dueAt>now)throw Error('This card is not due yet');const result=changeMistake({action:'retry',id:card.entryId,mode:a.mode==='variant'?'variant':'original'},now);if(!('retry'in result)||!result.retry)throw Error('Could not start review');const next={...card,activeRetryId:result.retry.id,revision:card.revision+1};stores.trainingStore.write('review',next);return{card:next,retry:result.retry};
 }
 const retry=card.activeRetryId?stores.trainingStore.read<MistakeRetry>('mistake-retry',card.activeRetryId):null;
 if(!retry||a.retryId!==retry.id)throw Error('Start or resume the current review first');
 if(a.action==='answer'){const result=changeMistake({action:'answer-retry',id:retry.id,answer:a.answer,reasoning:a.reasoning},now);return{card,...result};}
 if(a.action==='rate'){if(retry.submittedAt===undefined||typeof retry.correct!=='boolean'||!REVIEW_RATINGS.includes(a.rating as ReviewRating))throw Error('Commit a review answer before rating difficulty');const next=scheduleReview(card,a.rating as ReviewRating,retry.correct,retry.id,now);stores.trainingStore.write('review',next);return{card:next};}
 throw Error('Unknown review action');
}

import{parseExamConfig,examQuestions,examView,type QuantExam}from'../core/quant-exam.ts';import{numericAnswer}from'../core/quant-questions.ts';import{stores}from'./stores.ts';
function expire(exam:QuantExam,now:number){if(exam.endedAt===undefined&&now>=exam.deadline){exam={...exam,endedAt:exam.deadline,revision:exam.revision+1};stores.trainingStore.write('exam',exam);}return exam;}
export function quantExams(now=Date.now()){return stores.trainingStore.list<QuantExam>('exam').sort((a,b)=>b.startedAt-a.startedAt).slice(0,100).map(e=>expire(e,now));}
export function changeExam(raw:unknown,now=Date.now()){
 const a=raw as Record<string,unknown>;if(!a||typeof a!=='object')throw Error('Invalid exam action');
 if(a.action==='start'){if(quantExams(now).some(e=>e.endedAt===undefined))throw Error('Finish the active exam before starting another');const config=parseExamConfig(a.config),e:QuantExam={version:1,id:crypto.randomUUID(),seed:crypto.getRandomValues(new Uint32Array(1))[0]!,config,revision:0,startedAt:now,deadline:now+config.durationSeconds*1000,responses:{}};stores.trainingStore.write('exam',e);return examView(e,now);}
 if(typeof a.id!=='string')throw Error('Exam id required');const saved=stores.trainingStore.read<QuantExam>('exam',a.id);if(!saved)throw Error('Exam not found');const e=expire(saved,now);
 if(a.action==='refresh')return examView(e,now);
 if(e.endedAt!==undefined){if(a.action==='finish')return examView(e,now);throw Error('Time is up or this exam is finished; answers are locked');}
 if(a.revision!==e.revision)throw Error('This exam changed in another tab; reload before saving');
 if(a.action==='finish'){const next={...e,endedAt:now,revision:e.revision+1};stores.trainingStore.write('exam',next);return examView(next,now);}
 if(a.action!=='answer'||typeof a.index!=='number'||!Number.isInteger(a.index)||a.index<0||a.index>=examQuestions(e).length||typeof a.answer!=='string'||a.answer.length>80||(a.answer.trim()&&numericAnswer(a.answer)===null)||typeof a.reasoning!=='string'||a.reasoning.length>4000||typeof a.flagged!=='boolean')throw Error('Use a finite decimal or fraction answer, optional reasoning, and a valid question');
 const next={...e,revision:e.revision+1,responses:{...e.responses,[a.index]:{answer:a.answer.trim(),reasoning:a.reasoning,flagged:a.flagged,savedAt:now}}};stores.trainingStore.write('exam',next);return examView(next,now);
}

"use client";
import {useState} from 'react';import {useRouter} from 'next/navigation';
import {parseLearningEvidence} from '@/src/core';
export function TrainingHandoff({title,snapshot}:{title:string;snapshot:unknown}){
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState<string>();
 return <div><button disabled={busy} className="rounded border px-3 py-2 text-sm" onClick={async()=>{setBusy(true);setError(undefined);try{const evidence=parseLearningEvidence({code:[{name:'training-record.json',language:'json',source:JSON.stringify(snapshot,null,2)}]});const r=await fetch('/api/chats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});if(!r.ok)throw Error('Could not create learning session');const chat=await r.json();sessionStorage.setItem('lh:incoming-evidence',JSON.stringify({chatId:chat.id,evidence}));router.push('/chat/'+encodeURIComponent(chat.id));}catch(e){setError((e as Error).message);setBusy(false);}}}>Discuss this result with tutor</button>{error&&<p role="alert">{error}</p>}<p className="text-xs text-muted-foreground">Stages this saved result in a new session. Add your question before sending.</p></div>;
}

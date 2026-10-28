import type{CppExecutionResult}from'./cpp-run.ts';
export interface CppChallenge{id:string;title:string;statement:string;examples:Array<{stdin:string;expected:string}>;hiddenCount:number}
export interface CppJudgeReport{version:1;id:string;challengeId:string;createdAt:number;sourceHash:string;files:Array<{name:string;source:string}>;result:CppExecutionResult;totalChecks:number;passedChecks:number;hiddenCount:number}

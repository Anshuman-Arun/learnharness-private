import type {Model,Provider,AssistantMessageEventStream} from "@earendil-works/pi-ai";
export function hasDesktopPlanBroker(env?:NodeJS.ProcessEnv):boolean;
export interface PlanProvider extends Provider {syncModels():Promise<readonly Model[]>;}
export function createPlanProvider(input:{
 makeEventStream:()=>AssistantMessageEventStream;
 getModels?:(...args:any[])=>Promise<unknown[]>;
 requestEvents?:(...args:any[])=>AsyncIterable<unknown>;
 env?:NodeJS.ProcessEnv;
}):PlanProvider;

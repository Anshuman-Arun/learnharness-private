/** Temporary integration preview for CI. Does NOT alter a developer's
 * repository unless explicitly invoked. CI checkouts are disposable.
 * It copies tested modules and applies the existing fail-closed patcher. */
import {existsSync,readdirSync,copyFileSync,mkdirSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {join,dirname} from "node:path";
const root=fileURLToPath(new URL("../",import.meta.url));
const source=join(root,"private-devkit","src","subscription");
const target=join(root,"src","subscription");
if(!existsSync(join(root,"private-devkit","scripts","apply-private-provider.mjs")))throw new Error("Missing vetted patcher");
if(!existsSync(join(root,"src","agent","models.ts")))throw new Error("Not a LearnHarness checkout");
mkdirSync(target,{recursive:true});
for(const file of readdirSync(source)){
 if(!file.endsWith(".mjs")||file==="pi-provider.mjs")continue;
 const dst=join(target,file);
 if(existsSync(dst))throw new Error("Refusing to overwrite existing "+file);
 copyFileSync(join(source,file),dst);
}
const declaration=`import type { Model, Provider, AssistantMessageEventStream } from "@earendil-works/pi-ai";
export function hasDesktopPlanBroker(env?: NodeJS.ProcessEnv): boolean;
export interface PlanProvider extends Provider {
  syncModels(): Promise<readonly Model[]>;
}
export function createPlanProvider(input: {
  makeEventStream: () => AssistantMessageEventStream;
  getModels?: (...args: any[]) => Promise<unknown[]>;
  requestEvents?: (...args: any[]) => AsyncIterable<unknown>;
  env?: NodeJS.ProcessEnv;
}): PlanProvider;
`;
const declarationFile=join(target,"pi-provider.d.mts");
if(existsSync(declarationFile))throw new Error("Refusing to overwrite declaration");
writeFileSync(declarationFile,declaration);
const result=spawnSync(process.execPath,[join(root,"private-devkit","scripts","apply-private-provider.mjs"),root],{stdio:"inherit",cwd:root});
if(result.error)throw result.error;
if(result.status!==0)throw Error("Native provider patcher failed");
console.log("Native integration preview generated in disposable CI checkout.");

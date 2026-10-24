/**
 * Windows-safe TypeScript test launcher matching upstream `npm test`.
 * Node runs each original .test.ts(x) through tsx, without shell assignments.
 */
import {readdirSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {join} from "node:path";
const files = readdirSync("tests").filter(name=>/\.test\.tsx?$/.test(name)).sort().map(name=>join("tests",name));
if(!files.length)throw Error("Test suite not found");
const result=spawnSync(process.execPath,["--import","tsx","--test",...files],{
 env:{...process.env,NODE_ENV:"test"},stdio:"inherit",windowsHide:true
});
if(result.error)throw result.error;
process.exit(result.status??1);

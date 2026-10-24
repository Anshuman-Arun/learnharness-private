/** Run the original TypeScript tests AND the new dependency-free tests. */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function run(args, env = process.env) {
  const result = spawnSync(process.execPath,args,{stdio:'inherit',env});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`Test suite failed (exit ${result.status})`);
}
const legacy = fs.readdirSync('tests').filter(name=>/\.test\.(tsx?|jsx?)$/.test(name))
  .sort().map(name=>path.join('tests',name));
const privateTests = fs.readdirSync('tests').filter(name=>name.endsWith('.test.mjs'))
  .sort().map(name=>path.join('tests',name));
if (!legacy.length) throw new Error('No upstream tests discovered');
run(['--import','tsx','--test',...legacy],{...process.env,NODE_ENV:'test'});
if(privateTests.length) run(['--test',...privateTests],{...process.env,NODE_ENV:'test'});

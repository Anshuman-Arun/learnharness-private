import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/apply-private-foundation.mjs');
function run(cmd,args,cwd) {const s=spawnSync(cmd,args,{cwd,encoding:'utf8'});if(s.status)throw new Error(s.stderr||s.stdout);}
function mockRepo(origin) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lh-private-test-'));
 fs.mkdirSync(path.join(dir,'electron'),{recursive:true});
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'learnharness',scripts:{test:'NODE_ENV=test tsx --test tests/*.test.ts'}}));
 fs.writeFileSync(path.join(dir,'.gitignore'),'node_modules/\ndata/\n');
 fs.writeFileSync(path.join(dir,'electron-builder.yml'),'appId: com.learnharness.LearnHarness\nproductName: LearnHarness\nextraResources:\n  - from: .next\n    to: server\npublish:\n  - provider: github\n    owner: amosblomqvist\n    repo: learnharness\n');
 fs.writeFileSync(path.join(dir,'electron/main.cjs'),'const PRODUCT_NAME = "LearnHarness";\nfunction setupAutoUpdater() {\n  // original\n}\n');
 run('git',['init','-b','main'],dir);run('git',['config','user.email','test@example.com'],dir);run('git',['config','user.name','Test'],dir);
 run('git',['remote','add','origin',origin],dir);run('git',['add','.'],dir);run('git',['commit','-m','Base'],dir);
 return dir;
}
test('fail closed when origin points to upstream',()=>{
 const dir=mockRepo('https://github.com/amosblomqvist/learnharness.git');
 try {const r=spawnSync(process.execPath,[script,dir],{encoding:'utf8'});
  assert.notEqual(r.status,0); assert.match(r.stderr,/origin still targets/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'package.json'))).scripts['desktop:dev:win'],undefined);
 } finally {fs.rmSync(dir,{recursive:true,force:true})}
});
test('private edition renames app, suppresses updater and adds Windows runners',()=>{
 const dir=mockRepo('https://github.com/Test/private-learnharness.git');
 try {const r=spawnSync(process.execPath,[script,dir],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  const pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json')));
  assert.equal(pkg.scripts['desktop:dist:win'],'node scripts/build-windows-private.mjs');
  const yaml=fs.readFileSync(path.join(dir,'electron-builder.yml'),'utf8');
  assert.match(yaml,/productName: LearnHarness Private/);assert.doesNotMatch(yaml,/owner: amosblomqvist/);
  const main=fs.readFileSync(path.join(dir,'electron/main.cjs'),'utf8');
  assert.match(main,/Private edition: auto-update disabled/);
  assert.ok(fs.existsSync(path.join(dir,'src/subscription/response-protocol.mjs')));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

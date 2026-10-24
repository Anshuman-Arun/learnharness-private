import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=fileURLToPath(new URL('../scripts/apply-private-provider.mjs',import.meta.url));
test('provider integration refuses non-LearnHarness tree without writing',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lh-invalid-'));
  try {
    const run=spawnSync(process.execPath,[script,dir],{encoding:'utf8'});
    assert.notEqual(run.status,0);
    assert.match(run.stderr,/No integration files changed/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

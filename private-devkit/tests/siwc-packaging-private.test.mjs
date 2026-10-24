import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('Electron runtime uses packaged audited SDK path, not globally installed credentials',()=>{
  const init=fs.readFileSync('electron/private-subscription/init.cjs','utf8');
  assert.match(init,/process\.resourcesPath/);
  assert.match(init,/vendor','siwc-runtime'/);
  assert.match(init,/pathToFileURL\(location\)/);
  assert.doesNotMatch(init,/import\(['"]@siwc\/local['"]\)/);
});
test('Windows staging script exists and installs from an isolated SDK tarball',()=>{
  const installer=fs.readFileSync('scripts/stage-siwc-runtime.mjs','utf8');
  assert.match(installer,/npm\(\['pack',target/);
  assert.match(installer,/--ignore-scripts/);
  assert.match(installer,/OPENAI_DEVKIT_LICENSE/);
  assert.match(installer,/--save=false/);
});
test('Electron SDK service source is identical in overlay and packaged shell',()=>{
  for(const name of ['devkit-event-stream.cjs','electron-subscription-service.cjs','electron-credential-encryption.cjs','loopback-broker.cjs']){
    const src=fs.readFileSync(path.join('src/subscription',name),'utf8');
    const packaged=fs.readFileSync(path.join('electron/private-subscription',name),'utf8');
    assert.equal(src,packaged,name+' drifted');
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const fromRoot=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Electron ChatGPT desktop IPC is origin checked and never exposes credentials',()=>{
 const main=fromRoot('electron/main.cjs');
 const preload=fromRoot('electron/preload.cjs');
 for(const op of ['session','connect','disconnect']) {
   assert.match(main,new RegExp('ipcMain\\.handle\\("lh:chatgpt:'+op+'".*'));
   assert.match(preload,new RegExp('ipcRenderer\\.invoke\\("lh:chatgpt:'+op+'"'));
 }
 assert.match(main,/assertPrivateRenderer\(event\)/);
 assert.match(main,/new URL\(actual\)\.origin !== expectedOrigin/);
 assert.doesNotMatch(preload,/accessToken|refreshToken|BROKER_SECRET/);
});
test('The renderer has a visible native sign-in control separate from paid API keys',()=>{
 const keys=fromRoot('components/settings/keys-section.tsx');
 assert.match(keys,/data-testid="chatgpt-desktop-account"/);
 assert.match(keys,/data-testid="chatgpt-connect"/);
 assert.match(keys,/Connect ChatGPT/);
 assert.match(keys,/<ChatGPTDesktopAccount \/>/);
 assert.match(keys,/if \(!supported\) return null/);
});

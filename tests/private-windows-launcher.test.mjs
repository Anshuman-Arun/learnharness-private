import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('private desktop development launches Electron as broker owner',()=>{
 const s=readFileSync(new URL('../scripts/private-windows-dev.mjs',import.meta.url),'utf8');
 assert.match(s,/LH_PRIVATE_NEXT_DEV:\s*'1'/);
 assert.match(s,/electron\.cmd/);
 assert.doesNotMatch(s,/spawn\(process\.execPath,\s*\[.*next/s);
});

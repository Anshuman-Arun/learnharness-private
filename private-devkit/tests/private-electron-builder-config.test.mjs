import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addSiwcResources} from '../scripts/private-electron-builder-config.mjs';
test('private installer includes staged SDK in resources (no upstream updater)',()=>{
 const base='appId: org.learnharness.private.windows\nextraResources:\n  - from: .next\n    to: server\nmac:\n  target: dmg\n';
 const next=addSiwcResources(base);
 assert.match(next,/from: vendor\\n    to: \\.\\n    filter:\\n      - "siwc-runtime\\/\\*\\*\\/\\*"/);
 assert.match(next,/to: server\\n  # Copy from vendor/);
 assert.throws(()=>addSiwcResources(next),/already included/);
 assert.throws(()=>addSiwcResources('invalid layout'),/Unsupported/);
});

test('private installer handles Git for Windows CRLF YAML',()=>{
 const base='appId: org.learnharness.private.windows\nextraResources:\n  - from: .next\n    to: server\nmac:\n  target: dmg\n';
 const patched=addSiwcResources(base.replace(/\n/g,'\r\n'));
 assert.match(patched,/from: vendor\\n    to: \\.\\n    filter:\\n      - "siwc-runtime\\/\\*\\*\\/\\*"/);
});
test('private installer config patch works with the actual repository YAML',()=>{
 const file=readFileSync(new URL('../../electron-builder.yml',import.meta.url),'utf8');
 const output=addSiwcResources(file);
 assert.match(output,/from: vendor\n    to: \.\n    filter:\n      - "siwc-runtime\/\*\*\/\*"/);
});

test('installer never puts SDK node_modules at a resource copy root',()=>{
  const base='extraResources:\n  - from: .next\n    to: server\nmac:\n';
  const result=addSiwcResources(base);
  assert.doesNotMatch(result,/from: vendor\/siwc-runtime/);
  assert.match(result,/from: vendor\n    to: \.\n    filter:\n      - "siwc-runtime\/\*\*\/\*"/);
});

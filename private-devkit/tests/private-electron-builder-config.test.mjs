import test from 'node:test';
import assert from 'node:assert/strict';
import {addSiwcResources} from '../scripts/private-electron-builder-config.mjs';
test('private installer includes staged SDK in resources (no upstream updater)',()=>{
 const base='appId: org.learnharness.private.windows\nextraResources:\n  - from: .next\n    to: server\nmac:\n  target: dmg\n';
 const next=addSiwcResources(base);
 assert.match(next,/from: vendor\/siwc-runtime\n    to: siwc-runtime/);
 assert.match(next,/to: server\n  - from: vendor\/siwc-runtime/);
 assert.throws(()=>addSiwcResources(next),/already included/);
 assert.throws(()=>addSiwcResources('invalid layout'),/Unsupported/);
});

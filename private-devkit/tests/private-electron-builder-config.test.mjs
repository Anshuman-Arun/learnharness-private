import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addSiwcResources } from '../scripts/private-electron-builder-config.mjs';

const example = [
  'appId: org.learnharness.private.windows',
  'extraResources:',
  '  - from: .next',
  '    to: server',
  'mac:',
  '  target: dmg',
  ''
].join('\n');
const sdkResource = [
  '  - from: vendor',
  '    to: .',
  '    filter:',
  '      - "siwc-runtime/**/*"'
].join('\n');

test('private installer preserves nested SDK node_modules and other resources', () => {
  const next = addSiwcResources(example);
  assert.ok(next.includes(sdkResource), 'SDK copied from vendor parent');
  assert.ok(next.includes('to: server'), 'Existing standalone server retained');
  assert.ok(!next.includes('  - from: vendor/siwc-runtime\n'), 'No root node_modules fileset');
  assert.throws(() => addSiwcResources(next), /already included/);
  assert.throws(() => addSiwcResources('invalid layout'), /Unsupported/);
});

test('private installer handles Windows CRLF YAML', () => {
  const result = addSiwcResources(example.replace(/\n/g, '\r\n'));
  assert.ok(result.includes(sdkResource));
  assert.ok(!result.includes('\r\n'));
});

test('private installer transform accepts actual application builder YAML', () => {
  const source = readFileSync(new URL('../../electron-builder.yml', import.meta.url), 'utf8');
  const next = addSiwcResources(source);
  assert.ok(next.includes(sdkResource));
  assert.ok(next.includes('extraResources:\n'));
  assert.ok(next.includes('mac:\n'));
});

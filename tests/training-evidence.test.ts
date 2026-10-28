import assert from 'node:assert/strict';
import { it } from 'node:test';
import { trainingEvidence } from '../src/core/training-evidence.ts';
import { parseLearningEvidence } from '../src/core/learning-evidence.ts';

it('preserves the existing single JSON attachment for small records', () => {
 const snapshot = { id: 'small', answer: '1/6' }, evidence = trainingEvidence(snapshot);
 assert.equal(evidence.code?.length, 1);
 assert.equal(evidence.code?.[0]?.name, 'training-record.json');
 assert.deepEqual(JSON.parse(evidence.code![0]!.source), snapshot);
});

it('losslessly stages a maximum-size exam with long multiline or Unicode reasoning', () => {
 for (const reasoning of ['x'.repeat(4000), '\n'.repeat(4000), '😀'.repeat(2000)]) {
  const snapshot = { questions: Array.from({ length: 50 }, (_, index) => ({ index, prompt: 'Question ' + index })), responses: Object.fromEntries(Array.from({ length: 50 }, (_, index) => [index, { answer: '1/6', reasoning, flagged: true, savedAt: 1 }])) };
  assert.throws(() => parseLearningEvidence({ code: [{ name: "training-record.json", language: "json", source: JSON.stringify(snapshot, null, 2) }] }), /65536/);
  const evidence = trainingEvidence(snapshot);
  assert.ok(evidence.code!.length > 1 && evidence.code!.length <= 8);
  assert.deepEqual(parseLearningEvidence(evidence), evidence);
  assert.deepEqual(JSON.parse(evidence.code!.map(part => part.source).join('')), snapshot);
  for (const part of evidence.code!) {
   assert.ok(part.source.length <= 65536);
   assert.equal(/[\uD800-\uDBFF]$/.test(part.source), false);
  }
 }
});

it('rejects records beyond the aggregate bound without truncating them', () => {
 assert.throws(() => trainingEvidence({ text: 'x'.repeat(8 * 65536) }), /attachment limit/);
 assert.throws(() => trainingEvidence(undefined), /No training record/);
});

import { parseLearningEvidence, type LearningEvidence } from './learning-evidence.ts';

/** Preserve complete training records within the existing per-file evidence limits. */
export function trainingEvidence(snapshot: unknown): LearningEvidence {
 const source = JSON.stringify(snapshot, null, 2);
 if (typeof source !== 'string') throw new Error('No training record to discuss');
 const chunks: string[] = [];
 for (let start = 0; start < source.length;) {
  let end = Math.min(start + 65536, source.length);
  // Keep Unicode pairs together when a record crosses an attachment boundary.
  const last = source.charCodeAt(end - 1);
  if (end < source.length && last >= 0xd800 && last <= 0xdbff) end--;
  chunks.push(source.slice(start, end)); start = end;
  if (chunks.length > 8) throw new Error('This training record exceeds the tutor attachment limit');
 }
 return parseLearningEvidence({ code: chunks.map((part, index) => ({
  name: chunks.length === 1 ? 'training-record.json' : `training-record.part-${index + 1}-of-${chunks.length}.txt`,
  language: chunks.length === 1 ? 'json' : 'text', source: part,
 })) })!;
}

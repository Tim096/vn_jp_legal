import fs from 'node:fs';
import path from 'node:path';

const resultsDir = path.resolve(
  '.workflow/taiwan-bar-explanation-source-and-ai-scale/results',
);
const reviewed = process.argv.includes('--reviewed');
const parts = process.argv.slice(2).filter((part) => part !== '--reviewed');

if (!parts.length) {
  throw new Error('Usage: node pipeline/collect-taiwan-bar-luna-batch.mjs 001 002 ...');
}

const rows = parts.flatMap((part) => {
  const file = path.join(resultsDir, `luna-${reviewed ? 'reviewed' : 'full'}-part-${part}.jsonl`);
  return fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean);
});
const parsed = rows.map((row) => JSON.parse(row));
const ids = parsed.map(({ id }) => id);

if (new Set(ids).size !== ids.length) {
  throw new Error('Duplicate question IDs found in Luna batch outputs.');
}

const output = path.join(
  resultsDir,
  `luna-${reviewed ? 'reviewed' : 'full'}-parts-${parts[0]}-${parts.at(-1)}.jsonl`,
);
fs.writeFileSync(output, `${rows.join('\n')}\n`, 'utf8');
console.log(`Collected ${rows.length} Luna explanations: ${output}`);

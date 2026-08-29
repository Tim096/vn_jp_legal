import fs from 'node:fs';
import path from 'node:path';

const resultsDir = path.resolve(
  '.workflow/taiwan-bar-explanation-source-and-ai-scale/results',
);
const inputs = ['a', 'b', 'c'].map((suffix) =>
  path.join(resultsDir, `luna-pilot-${suffix}.jsonl`),
);
const output = path.join(resultsDir, 'luna-pilot-all.jsonl');

const rows = inputs.flatMap((file) =>
  fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean),
);
const ids = rows.map((row) => JSON.parse(row).id);

if (new Set(ids).size !== ids.length) {
  throw new Error('Duplicate question IDs found in Luna pilot outputs.');
}

fs.writeFileSync(output, `${rows.join('\n')}\n`, 'utf8');
console.log(`Collected ${rows.length} Luna pilot explanations: ${output}`);

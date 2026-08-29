import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectDir = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const questions = JSON.parse(await readFile(resolve(projectDir, 'pipeline/output/taiwan-bar/questions.json'), 'utf8'));
const results = (await readFile(resolve(projectDir, process.argv[2] || 'pipeline/output/taiwan-bar-ai/published.jsonl'), 'utf8'))
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map(JSON.parse);
const perStratum = Number(process.argv[3] || 1);
const output = resolve(projectDir, process.argv[4] || '.workflow/taiwan-bar-explanation-source-and-ai-scale/results/scale-qa-sample.jsonl');
const startPart = Number(process.argv[5] || 0);
const endPart = Number(process.argv[6] || 0);
const seed = 'tw-bar-ai-scale-qa-v1';
const byId = new Map(results.map((result) => [result.id, result]));
const groups = new Map();
let allowedIds = null;

if (startPart && endPart) {
  allowedIds = new Set();
  for (let part = startPart; part <= endPart; part += 1) {
    const name = `part-${String(part).padStart(3, '0')}.jsonl`;
    const rows = (await readFile(resolve(projectDir, 'pipeline/output/taiwan-bar-ai/shards', name), 'utf8'))
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);
    for (const row of rows) allowedIds.add(row.id);
  }
}

for (const question of questions) {
  if (!byId.has(question.id)) continue;
  if (allowedIds && !allowedIds.has(question.id)) continue;
  const key = `${question.tags[0]}:${question.chapter}`;
  const hash = createHash('sha256').update(`${seed}:${question.id}`).digest('hex');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ key, hash, question, explanation: byId.get(question.id) });
}

const sample = [...groups.values()].flatMap((rows) => rows
  .sort((left, right) => left.hash.localeCompare(right.hash))
  .slice(0, perStratum));
await writeFile(output, `${sample.map(JSON.stringify).join('\n')}\n`, 'utf8');
console.log(`Selected ${sample.length} rows across ${groups.size} year/subject strata: ${output}`);

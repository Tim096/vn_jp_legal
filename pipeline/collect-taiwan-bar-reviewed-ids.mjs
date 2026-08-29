import fs from 'node:fs';
import path from 'node:path';

const idsFile = path.resolve(process.argv[2]);
const outputFile = path.resolve(process.argv[3]);
const resultsDir = path.resolve('.workflow/taiwan-bar-explanation-source-and-ai-scale/results');
const ids = new Set(JSON.parse(fs.readFileSync(idsFile, 'utf8')).map(({ id }) => id));
const found = new Map();

for (const name of fs.readdirSync(resultsDir).filter((name) => /^luna-reviewed-part-\d{3}\.jsonl$/.test(name))) {
  const rows = fs.readFileSync(path.join(resultsDir, name), 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
  for (const row of rows) {
    if (!ids.has(row.id)) continue;
    if (found.has(row.id)) throw new Error(`Duplicate reviewed result: ${row.id}`);
    found.set(row.id, row);
  }
}

const missing = [...ids].filter((id) => !found.has(id));
if (missing.length) throw new Error(`Missing reviewed results: ${missing.join(', ')}`);

const rows = [...ids].map((id) => found.get(id));
fs.writeFileSync(outputFile, `${rows.map(JSON.stringify).join('\n')}\n`, 'utf8');
console.log(`Collected ${rows.length} reviewed explanations: ${outputFile}`);

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const input = resolve(process.argv[2]);
const rows = (await readFile(input, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fields = ['issue', 'rule', 'application'];
const normalize = (sentence) => sentence.replace(/[。！？!?]+$/u, '').replace(/\s+/g, ' ').trim();
const sentenceOwners = new Map();

for (const row of rows) {
  const seen = new Set();
  for (const field of fields) {
    for (const segment of String(row[field] || '').match(/[^。！？!?]+[。！？!?]?/gu) || []) {
      const sentence = normalize(segment);
      if (sentence.length >= 20) seen.add(sentence);
    }
  }
  for (const sentence of seen) sentenceOwners.set(sentence, (sentenceOwners.get(sentence) || 0) + 1);
}

const threshold = Math.max(5, Math.ceil(rows.length * 0.5));
const repeated = new Set([...sentenceOwners].filter(([, count]) => count >= threshold).map(([sentence]) => sentence));
let removed = 0;
for (const row of rows) {
  for (const field of fields) {
    const kept = (String(row[field] || '').match(/[^。！？!?]+[。！？!?]?/gu) || []).filter((segment) => {
      if (!repeated.has(normalize(segment))) return true;
      removed += 1;
      return false;
    });
    row[field] = kept.join('').trim();
  }
}

await writeFile(input, `${rows.map(JSON.stringify).join('\n')}\n`, 'utf8');
console.log(`Removed ${removed} repeated filler sentences (${repeated.size} unique) from ${rows.length} rows.`);
for (const sentence of repeated) console.log(`- ${sentence}`);

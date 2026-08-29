import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const files = process.argv.slice(2).map((file) => resolve(file));
if (!files.length) throw new Error('Pass one or more AI result JSONL files.');

for (const file of files) {
  const rows = (await readFile(file, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  let repaired = 0;
  for (const row of rows) {
    if (!row.law_sources?.length && !String(row.uncertainty || '').includes('未完成法源核對')) {
      row.uncertainty = `${String(row.uncertainty || '').trim()} 未完成法源核對。`.trim();
      repaired += 1;
    }
  }
  await writeFile(file, `${rows.map(JSON.stringify).join('\n')}\n`, 'utf8');
  console.log(`${file}: repaired ${repaired}`);
}

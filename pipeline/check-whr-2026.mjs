// Publication gate: the four requested materials must all be complete.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root));
const json = async path => JSON.parse(await read(path));
const blocked = [];
const manifest = await json("data/whr-2026-materials.json");
assert.equal(manifest.items.filter(i => i.kind === "textbook").length, 27);
assert.equal(manifest.items.length, 29);
assert.equal(new Set(manifest.items.map(i => i.id)).size, 29);
for (const item of manifest.items) {
  if (item.status !== "ready" || !item.file) { blocked.push(`${item.id}: original PDF missing`); continue; }
  const bytes = await read(item.file);
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-", item.id);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), item.sha256, item.id);
  assert.ok(item.page_count > 0, item.id);
  if (item.id === "mock4-question") assert.equal(item.page_count, 27);
  if (item.id === "mock4-answer") assert.equal(item.page_count, 12);
}
for (const [kind, count] of Object.entries({ field: 72, qa: 120, mock4: 40 })) {
  const rows = await json(`pipeline/output/whr-2026/${kind}.json`);
  assert.equal(rows.length, count);
  for (const row of rows) {
    if (!row.question_zh || !row.explanation_zh) blocked.push(`${row.id}: Chinese summary missing`);
    if (row.review_status !== "source-consistency-checked") blocked.push(`${row.id}: source review pending`);
    assert.ok(row.question && row.explanation && row.answer.length && row.options.length >= 2, row.id);
  }
}
console.log(JSON.stringify({ status: blocked.length ? "blocked_data" : "ready", blockers: blocked }, null, 2));
process.exitCode = blocked.length ? 1 : 0;

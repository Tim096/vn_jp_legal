import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const app = (await readFile(new URL("../app.js", import.meta.url), "utf8")).replace(/\ninitializeApp\(\);\s*$/, "");
const config = await readFile(new URL("../config.js", import.meta.url), "utf8");
const packet = JSON.parse(await readFile(new URL("./raw/ibt-cbt-2/source.json", import.meta.url), "utf8"));
const questions = JSON.parse(await readFile(new URL("./output/ibt-cbt-2/questions.json", import.meta.url), "utf8"));
const storage = new Map();
const context = vm.createContext({
  console, Date, Math, Map, Set, URL, URLSearchParams, Blob, setTimeout, clearTimeout, setInterval, clearInterval,
  window: {}, navigator: {}, document: { querySelector: () => ({}) },
  location: { search: "?bank=jp-ibt-cbt-2" },
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
  rows: questions.map((q) => ({ ...q, options: q.options.join("\n"), answer: q.answer.join(","), law_refs: q.law_refs.join(","), tags: q.tags.join(",") }))
});
vm.runInContext(config, context);
vm.runInContext(app, context);
const actual = JSON.parse(JSON.stringify(vm.runInContext(`
  state.questions = rows.map(normalizeQuestion);
  const multi = state.questions.filter(isMultipleQuestion);
  ({
    initialBank: INITIAL_BANK,
    count: state.questions.length,
    order: createMockQuestions().map(q => q.id),
    multi: multi.map(q => ({ id: q.id, correct: questionAccepts(q, q.answer),
      partial: questionAccepts(q, q.answer.slice(0, 1)),
      extra: questionAccepts(q, [1, 2, 3, 4]),
      reversed: questionAccepts(q, [...q.answer].reverse()) })),
    ownProgressKey: storageKeysForBank("jp-ibt-cbt-2").progress,
    oldProgressKey: storageKeysForBank("jp-business-law").progress,
    bankSnapshotKeys: Object.keys(createCloudSnapshot().banks)
  })
`, context)));
assert.equal(actual.initialBank, "jp-ibt-cbt-2");
assert.equal(actual.count, 40);
assert.deepEqual(actual.order, questions.map(q => q.id), "whole-paper mock must preserve source order");
assert.equal(actual.multi.length, 4);
for (const q of actual.multi) assert.deepEqual([q.correct, q.partial, q.extra, q.reversed], [true, false, false, true], q.id);
assert.notEqual(actual.ownProgressKey, actual.oldProgressKey);
assert.ok(actual.bankSnapshotKeys.includes("jp-ibt-cbt-2"), "cloud backup must include new bank");
const compact = text => String(text).replace(/\s/g, "");
for (const [i, q] of questions.entries()) {
  const source = compact(packet.questions[i].lines.join(""));
  assert.equal(compact(q.question + ([1, 28].includes(i + 1) ? "" : q.options.join(""))), source, q.id + " source text coverage");
  assert.ok(q.question_zh && q.explanation_zh, q.id + " Chinese notes missing");
}
console.log(JSON.stringify(actual, null, 2));

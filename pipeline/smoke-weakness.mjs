import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const element = tag => ({ tag, children: [], attributes: {}, append(...children) { this.children.push(...children); },
  replaceChildren(...children) { this.children = children; }, setAttribute(key, value) { this.attributes[key] = value; } });
const context = vm.createContext({ window: {}, document: { createElement: element, createElementNS: (_, tag) => element(tag) } });
vm.runInContext(await read('data/jp-field-map.js'), context);
vm.runInContext(await read('weakness.js'), context);
const { JP_FIELD_MAP: map, StudyWeakness: { summarize, radar, render } } = context.window;
assert.deepEqual(Object.values(map.banks).map(q => Object.keys(q).length), [766, 120, 40, 72, 120]);
assert.ok(Object.values(map.banks).every(q => Object.values(q).every(n => Number.isInteger(n) && n >= 0 && n < 6)));
const bank = 'jp-ibt-cbt-4';
const snapshot = { history: [
  { id: 'ibt4-001', at: 20, correct: true },
  { id: 'ibt4-001', at: 10, correct: false },
  { id: 'ibt4-001', at: 20, correct: true }, // replay / self-evaluation does not double count
  { id: 'ibt4-002', at: 30, correct: false },
  { id: 'ibt4-003', at: 40, correct: false, answered: false, mode: 'mock' },
  { id: 'orphan', at: 50, correct: true }
], progress: { 'ibt4-002': { answeredAt: 30, correct: false }, 'ibt4-003': { answeredAt: 40, correct: false, answered: false } } };
const before = JSON.stringify(snapshot);
let result = summarize(map, { [bank]: snapshot }, [bank]);
assert.equal(result.rows[0].answered, 2);
assert.equal(result.rows[0].rate, 50);
assert.equal(result.excluded, 2);
assert.equal(result.rows[1].rate, null, 'unanswered is not zero percent');
assert.equal(JSON.stringify(snapshot), before, 'diagnosis must not mutate progress');
const partial = radar(result.rows);
assert.equal(partial.children.filter(n => n.attributes.class === 'radar-area').length, 0, 'do not fill missing dimensions as zero');
assert.equal(partial.children.filter(n => n.tag === 'circle').length, 1);
const afterReset = summarize(map, { [bank]: { ...snapshot, resetAt: 60 } }, [bank]);
assert.ok(afterReset.rows.every(r => r.rate === null));
const oldBank = 'jp-business-law';
const legacy = { progress: {
  'ch01-0001': { answeredAt: 10, quality: 5 },
  'ch01-0002': { answeredAt: 20, correct: false },
  'ch01-0003': { answeredAt: 30, correct: true },
}, history: [
  { id: 'ch01-0001', at: 10, correct: false, mode: 'legacy' },
  { id: 'ch01-0002', at: 20, correct: false, mode: 'mock' },
  { id: 'ch01-0003', at: 30, correct: true, mode: 'mock' },
] };
result = summarize(map, { [oldBank]: legacy }, [oldBank]);
assert.equal(result.rows[0].answered, 1, 'ambiguous legacy / unanswered mocks excluded');
assert.equal(result.excluded, 2);
legacy.history.push({ id: 'ch01-0002', at: 40, correct: false, mode: 'mock', answered: true });
result = summarize(map, { [oldBank]: legacy, [bank]: snapshot }, [oldBank, bank]);
assert.equal(result.rows[0].answered, 4);
assert.equal(result.rows[0].rate, 50);
const empty = element('div');
render(empty, map, {}, Object.keys(map.banks));
assert.match(empty.children[0].textContent, /まだ診断できません/);

const appStorage = new Map();
const appContext = vm.createContext({ window: { APP_CONFIG: {} }, navigator: {}, console, URLSearchParams,
  setTimeout, clearTimeout, document: { querySelector: () => ({}) },
  localStorage: { getItem: key => appStorage.get(key) ?? null, setItem: (key, value) => appStorage.set(key, value) } });
vm.runInContext((await read('app.js')).replace(/\ninitializeApp\(\);\s*$/, ''), appContext);
vm.runInContext(`
  state.mock = { answers: { 'ch01-0001': [2] } };
  recordAttempt({ id: 'ch01-0001' }, false, 2, 'mock');
  recordAttempt({ id: 'ch01-0002' }, false, 2, 'mock');
`, appContext);
const newMockProgress = JSON.parse(appStorage.get('bijihou2.progress.v1'));
assert.equal(newMockProgress['ch01-0001'].answered, true);
assert.equal(newMockProgress['ch01-0002'].answered, false);
const newMock = { progress: newMockProgress, history: JSON.parse(appStorage.get('bijihou2.history.v1')) };
const graded = summarize(map, { [oldBank]: newMock }, [oldBank]);
assert.equal(graded.rows[0].answered, 1);
assert.equal(graded.rows[0].rate, 0, 'real wrong answer is zero, skipped question is missing');
const mergeContext = vm.createContext({});
vm.runInContext(await read('supabase/functions/_shared/study-snapshot.js'), mergeContext);
const merged = mergeContext.mergeStudySnapshots({ version: 4, updatedAt: 1, banks: {} },
  { version: 4, updatedAt: 2, banks: { [oldBank]: newMock } });
assert.equal(merged.banks[oldBank].progress['ch01-0002'].answered, false);
assert.equal(summarize(map, merged.banks, [oldBank]).rows[0].answered, 1);

// A reproducible, explicitly labeled visual fixture; never loaded into learner storage.
const fixture = {};
const rates = [65, 50, 35, 30, 80, 75];
for (const [bankId, mapping] of Object.entries(map.banks)) {
  if (bankId !== 'jp-business-law') continue;
  fixture[bankId] = { history: [] };
  for (let field = 0; field < 6; field++) {
    const ids = Object.keys(mapping).filter(id => mapping[id] === field).slice(0, 20);
    ids.forEach((id, i) => fixture[bankId].history.push({ id, at: i + 1, correct: i < rates[field] / 5, answered: true }));
  }
}
const sample = summarize(map, fixture, Object.keys(map.banks));
assert.deepEqual(Array.from(sample.rows, r => r.rate), rates);
assert.equal(radar(sample.rows).children.filter(n => n.attributes.class === 'radar-area').length, 1);
await mkdir(new URL('.workflow/weakness/', root), { recursive: true });
await writeFile(new URL('.workflow/weakness/preview.html', root), `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>弱点診断・表示テスト</title><link rel="stylesheet" href="../../style.css"><main style="max-width:560px;margin:24px auto;padding:20px;background:var(--card);border-radius:20px"><p class="eyebrow">表示例 · テストデータ（本人の成績ではありません）</p><h2>6分野の弱点診断</h2><div id="chart"></div></main><script src="../../data/jp-field-map.js"></script><script src="../../weakness.js"></script><script>StudyWeakness.render(document.querySelector('#chart'),JP_FIELD_MAP,${JSON.stringify(fixture)},Object.keys(JP_FIELD_MAP.banks));</script></html>`);
console.log(JSON.stringify({ mappedQuestions: Object.values(map.banks).reduce((n,q) => n + Object.keys(q).length, 0),
  latestUnique: true, missingNotZero: true, reset: true, legacyExcluded: true, crossBank: true,
  immutable: true, fixtureRates: Array.from(sample.rows, r => r.rate) }, null, 2));

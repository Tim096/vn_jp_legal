import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const app = (await read("../app.js")).replace(/\ninitializeApp\(\);\s*$/, "");
const config = await read("../config.js");
const mergeSource = await read("../supabase/functions/_shared/study-snapshot.js");
const compact = text => text.replace(/\s/g, "");
const clone = value => JSON.parse(JSON.stringify(value));
const storage = new Map([["bijihou2.jp-ibt-cbt-2.progress", JSON.stringify({ "ibt2-001": { answeredAt: 1, attempts: 8 } })]]);
const oldProgress = storage.get("bijihou2.jp-ibt-cbt-2.progress");
const reports = [];
const captured = new Map();
for (const file of await readdir(new URL("./raw/whr-2026/", import.meta.url))) {
  if (!/^(field|qa)-\d+\.json$/.test(file)) continue;
  const packet = JSON.parse(await read(`./raw/whr-2026/${file}`));
  for (const q of packet.questions) captured.set(`whr26-${packet.kind}-${packet.unit_id}-${String(q.number).padStart(3, "0")}`, q);
}

for (const [kind, BANK, count, chapterCount] of [
  ["field", "jp-whr-field-2026", 72, 17], ["qa", "jp-whr-qa-2026", 120, 6], ["mock4", "jp-ibt-cbt-4", 40, 1]
]) {
  const questions = JSON.parse(await read(`./output/whr-2026/${kind}.json`));
  assert.equal(questions.length, count);
  assert.equal(new Set(questions.map(q => q.id)).size, count);
  assert.equal(new Set(questions.map(q => q.chapter)).size, chapterCount);
  assert.equal(new Set(questions.map(q => compact(q.question + q.options.join("")))).size, count, "duplicate source question");
  for (const q of questions) {
    assert.ok(q.question_zh && q.explanation_zh, `${q.id}: Chinese summary`);
    assert.equal(q.review_status, "source-consistency-checked");
    assert.ok(!/[\u{10000}-\u{10ffff}]/u.test(q.question), "underline offsets must match JavaScript UTF-16 indices");
    let last = 0;
    for (const [start, end] of q.question_underlines) {
      assert.ok(Number.isInteger(start) && start >= last && end > start && end <= q.question.length, q.id);
      last = end;
    }
    const original = captured.get(q.id);
    if (original) {
      assert.equal(compact(q.question), compact(original.question), q.id);
      assert.deepEqual(q.options.map(compact), original.options.map(compact), q.id);
      assert.deepEqual(q.answer, original.answer, `${q.id}: official correct marker, not user selection`);
      assert.equal(compact(q.explanation), compact(original.explanation.replace(/^解説\s*/, "")), q.id);
    }
  }
  const questionNode = { textContent: "", parts: [], replaceChildren(...parts) {
    this.parts = parts; this.textContent = parts.map(p => p.textContent).join("");
  } };
  const context = vm.createContext({
    console, Date, Math, Map, Set, URL, URLSearchParams, Blob, setTimeout, clearTimeout, setInterval, clearInterval,
    window: {}, navigator: {}, location: { search: `?bank=${BANK}` },
    document: { querySelector: selector => selector === "#questionText" ? questionNode : {}, querySelectorAll: () => [],
      createTextNode: text => ({ textContent: text }), createElement: tag => ({ tag, textContent: "" }) },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    rows: questions.map(q => ({ ...q, options: q.options.join("\n"), question_underlines: JSON.stringify(q.question_underlines) }))
  });
  vm.runInContext(config, context);
  vm.runInContext(app, context);
  const run = source => vm.runInContext(source, context);
  run("state.questions = rows.map(normalizeQuestion); render = () => {}; state.progress = {}; state.history = []; state.randomCycle = null;");
  assert.equal(run("state.questions.length"), count);
  for (const question of clone(run("state.questions"))) {
    const q = run(`state.questions.find(q => q.id === ${JSON.stringify(question.id)})`);
    assert.equal(run("questionAccepts")(q, question.answer), true, question.id);
    if (question.answer.length > 1) assert.equal(run("questionAccepts")(q, question.answer.slice(0, 1)), false);
    const wrong = question.options.map((_, i) => i + 1).find(n => !question.answer.includes(n));
    assert.equal(run("questionAccepts")(q, [wrong]), false, question.id);
    run("renderQuestionText")(q);
    assert.equal(questionNode.textContent, question.question, question.id);
    if (question.questionUnderlines.length) {
      assert.deepEqual(questionNode.parts.filter(p => p.tag === "u").map(p => p.textContent),
        question.questionUnderlines.map(([s, e]) => question.question.slice(s, e)));
    }
  }
  const encountered = [];
  for (let n = 0; n < count; n++) {
    run("buildDeck();");
    encountered.push(run("currentQuestion().id"));
    run("recordAttempt(currentQuestion(), false, 2, 'random'); state.randomCycle = readStorage(STORAGE_KEYS.randomCycle, null);");
    assert.equal(run("state.randomCycle.round"), 1);
  }
  assert.equal(new Set(encountered).size, count);
  assert.equal(run("state.randomCycle.remainingIds.length"), 0);
  assert.equal(storage.get("bijihou2.jp-ibt-cbt-2.progress"), oldProgress);
  reports.push({ bank: BANK, count, chapterCount, sourceCompared: kind === "mock4" ? "PDF importer assertions" : count,
    fullRoundUnique: true, scoringAndUnderlines: true });
}

const mergeContext = vm.createContext({});
vm.runInContext(mergeSource, mergeContext);
const bankState = id => ({ progress: { [id]: { answeredAt: 1 } }, history: [] });
const merged = mergeContext.mergeStudySnapshots(
  { version: 4, updatedAt: 1, banks: { "jp-ibt-cbt-2": bankState("old"), "jp-whr-qa-2026": bankState("qa-a") } },
  { version: 4, updatedAt: 2, banks: { "jp-ibt-cbt-4": bankState("mock"), "jp-whr-qa-2026": bankState("qa-b") } });
assert.deepEqual(Object.keys(merged.banks["jp-whr-qa-2026"].progress).sort(), ["qa-a", "qa-b"]);
assert.ok(merged.banks["jp-ibt-cbt-2"].progress.old && merged.banks["jp-ibt-cbt-4"].progress.mock);
console.log(JSON.stringify({ reports, legacyProgressUnchanged: true, mixedBankMerge: true }, null, 2));

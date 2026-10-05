import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const app = (await readFile(new URL("../app.js", import.meta.url), "utf8")).replace(/\ninitializeApp\(\);\s*$/, "");
const config = await readFile(new URL("../config.js", import.meta.url), "utf8");
const packets = await Promise.all([2, 3].map(async paper => JSON.parse(await readFile(new URL(`./raw/ibt-cbt-${paper}/source.json`, import.meta.url), "utf8"))));
const questions = JSON.parse(await readFile(new URL("./output/ibt-cbt-2/questions.json", import.meta.url), "utf8"));
const storage = new Map();
const context = vm.createContext({
  console, Date, Math, Map, Set, URL, URLSearchParams, Blob, setTimeout, clearTimeout, setInterval, clearInterval,
  window: {}, navigator: {}, document: { querySelector: () => ({}), querySelectorAll: () => [] },
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
    initialMode: state.mode,
    label: currentBankConfig().label,
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
assert.equal(actual.initialMode, "random");
assert.equal(actual.label, "IBT・CBT 模擬問題");
assert.equal(actual.count, 80);
assert.equal(actual.order.length, 40);
assert.equal(new Set(actual.order).size, 40);
assert.equal(actual.multi.length, 8);
assert.equal(new Set(questions.map(q => q.chapter)).size, 1, "all papers share one pool");
for (const q of actual.multi) assert.deepEqual([q.correct, q.partial, q.extra, q.reversed], [true, false, false, true], q.id);
assert.notEqual(actual.ownProgressKey, actual.oldProgressKey);
assert.ok(actual.bankSnapshotKeys.includes("jp-ibt-cbt-2"), "cloud backup must include new bank");
const compact = text => String(text).replace(/\s/g, "");
for (const [i, q] of questions.entries()) {
  const source = compact(packets[Math.floor(i / 40)].questions[i % 40].lines.join(""));
  assert.equal(compact(q.question + (["ibt2-001", "ibt2-028"].includes(q.id) ? "" : (q.source_options || q.options).join(""))), source, q.id + " source text coverage");
  assert.ok(q.question_zh && q.explanation_zh, q.id + " Chinese notes missing");
}

const rounds = JSON.parse(JSON.stringify(vm.runInContext(`
  render = () => {};
  state.progress = { "ibt2-001": { answeredAt: 1, notebook: "known", attempts: 3 } };
  state.randomCycle = { round: 1, knownIds: state.questions.slice(0, 40).map(q => q.id),
    remainingIds: state.questions.slice(1, 40).map(q => q.id) };
  ensureRandomCycle();
  const afterImport = [...state.randomCycle.remainingIds];
  const preservedAttempts = state.progress["ibt2-001"].attempts;
  state.randomCycle = readStorage(STORAGE_KEYS.randomCycle, null);
  ensureRandomCycle();
  const afterReload = [...state.randomCycle.remainingIds];
  state.mode = "random";
  buildDeck();
  state.selectedAnswer = [...currentQuestion().answer];
  const selectionDidNotConsume = state.randomCycle.remainingIds.includes(currentQuestion().id);
  state.progress = {};
  state.history = [];
  state.randomCycle = null;
  ensureRandomCycle();
  const encountered = [];
  for (let index = 0; index < 80; index++) {
    buildDeck();
    const question = currentQuestion();
    encountered.push(question.id);
    recordAttempt(question, index % 2 === 0, index % 2 === 0 ? 3 : 2, "random");
    state.randomCycle = readStorage(STORAGE_KEYS.randomCycle, null);
    if (index < 79 && state.randomCycle.round !== 1) throw new Error("Premature repeat");
  }
  const remainingBeforeRestart = state.randomCycle.remainingIds.length;
  ensureRandomCycle();
  ({ afterImport, afterReload, preservedAttempts, selectionDidNotConsume, encountered,
     remainingBeforeRestart, nextRound: state.randomCycle.round, nextCount: state.randomCycle.remainingIds.length });
`, context)));
assert.equal(rounds.afterImport.length, 79);
assert.ok(!rounds.afterImport.includes("ibt2-001"), "completed legacy question must stay completed");
assert.equal(rounds.afterImport.filter(id => id.startsWith("ibt3-")).length, 40);
assert.equal(rounds.preservedAttempts, 3);
assert.deepEqual(rounds.afterReload, rounds.afterImport, "reload preserves unfinished round and order");
assert.equal(rounds.selectionDidNotConsume, true, "selecting without submitting is not completion");
assert.equal(new Set(rounds.encountered).size, 80, "all 80 questions occur exactly once before repeating");
assert.equal(rounds.remainingBeforeRestart, 0);
assert.equal(rounds.nextRound, 2);
assert.equal(rounds.nextCount, 80);

const mocks = JSON.parse(JSON.stringify(vm.runInContext(`
  state.progress = {};
  state.history = [];
  state.randomCycle = null;
  const firstMock = createMockQuestions();
  firstMock.forEach(q => recordAttempt(q, true, 3, "mock"));
  state.randomCycle = readStorage(STORAGE_KEYS.randomCycle, null);
  const secondMock = createMockQuestions();
  secondMock.slice(0, 39).forEach(q => recordAttempt(q, false, 2, "random"));
  const finalMock = createMockQuestions();
  startMockTimer = () => {};
  renderMockResult = () => {};
  updateProgressSummary = () => {};
  updateTodaySummary = () => {};
  elements.mockDialog.close = () => {};
  startMock();
  const activeFinalCount = state.mock.questionIds.length;
  finishMock(true);
  const unansweredRemaining = state.randomCycle.remainingIds.length;
  const unansweredRecorded = Boolean(state.progress[finalMock[0].id]);
  startMock();
  state.mock.answers[finalMock[0].id] = [...finalMock[0].answer];
  finishMock(true);
  const afterFinalAnswer = state.randomCycle.remainingIds.length;
  const nextMock = createMockQuestions();
  ({ first: firstMock.map(q => q.id), second: secondMock.map(q => q.id),
     final: finalMock.map(q => q.id), activeFinalCount, unansweredRemaining, unansweredRecorded,
     afterFinalAnswer, nextCount: nextMock.length, nextRound: state.randomCycle.round });
`, context)));
assert.equal(mocks.first.length, 40);
assert.equal(mocks.second.length, 40);
assert.equal(new Set([...mocks.first, ...mocks.second]).size, 80, "consecutive mocks must not repeat this round");
assert.equal(mocks.final.length, 1, "do not refill with completed questions near round end");
assert.equal(mocks.activeFinalCount, 1, "a short final mock can start");
assert.equal(mocks.unansweredRemaining, 1, "unanswered mock questions stay in the pool");
assert.equal(mocks.unansweredRecorded, false);
assert.equal(mocks.afterFinalAnswer, 0);
assert.equal(mocks.nextCount, 40);
assert.equal(mocks.nextRound, 2);
console.log(JSON.stringify({ bank: actual.label, questions: actual.count, sourceTextCoverage: 80,
  multipleChoiceQuestions: actual.multi.length, preservedLegacyAttempts: rounds.preservedAttempts,
  firstRoundUnique: new Set(rounds.encountered).size, afterReloadUnchanged: true,
  nextRound: rounds.nextRound, nextRoundCount: rounds.nextCount,
  consecutiveMocksUnique: new Set([...mocks.first, ...mocks.second]).size,
  shortFinalMock: mocks.activeFinalCount, unansweredRetained: mocks.unansweredRemaining }, null, 2));

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const BANK = process.argv[2] || "jp-ibt-cbt-2";
const questionPaths = {
  "jp-ibt-cbt-2": "./output/ibt-cbt-2/questions.json",
  "jp-ibt-cbt-4": "./output/whr-2026/mock4.json",
  "jp-whr-field-2026": "./output/whr-2026/field.json",
  "jp-whr-qa-2026": "./output/whr-2026/qa.json"
};
assert.ok(questionPaths[BANK], "unknown bank");
const [mergeSource, cloudSource, appSource, configSource, apiSource, questionSource] = await Promise.all([
  read("../supabase/functions/_shared/study-snapshot.js"), read("../cloud-sync.js"), read("../app.js"),
  read("../config.js"), read("../supabase/functions/study-api/index.ts"), read(questionPaths[BANK])
]);
const questions = JSON.parse(questionSource);
const ids = questions.map(q => q.id);
const prefix = `bijihou2.${BANK}`;
const clone = value => JSON.parse(JSON.stringify(value));
const jsonb = value => Array.isArray(value) ? value.map(jsonb)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, jsonb(value[key])])) : value;

// Run the actual server save function against a database with conditional updates.
const database = {
  row: null, conflicts: 0,
  from() {
    let operation = "read", row, expected;
    const query = {
      select() { return query; },
      eq(key, value) { if (key === "updated_at") expected = value; return query; },
      update(value) { operation = "update"; row = value; return query; },
      insert(value) { operation = "insert"; row = value; return query; },
      async maybeSingle() {
        await new Promise(resolve => setImmediate(resolve));
        if (operation === "read") return { data: clone(database.row), error: null };
        if (operation === "insert" && database.row) {
          database.conflicts++;
          return { data: null, error: { code: "23505" } };
        }
        if (operation === "update" && database.row.updated_at !== expected) {
          database.conflicts++;
          return { data: null, error: null };
        }
        database.row = clone(row);
        return { data: clone(row), error: null };
      }
    };
    return query;
  }
};
const server = vm.createContext({ service: database, Date });
vm.runInContext(mergeSource, server);
const saveSource = apiSource.slice(apiSource.indexOf("async function saveStudySnapshot("), apiSource.indexOf("function corsHeaders("))
  .replace("learnerId: string, incoming: JsonRecord", "learnerId, incoming");
vm.runInContext("const mergeStudySnapshots = globalThis.mergeStudySnapshots;\n" + saveSource, server);
const save = snapshot => server.saveStudySnapshot("test-learner", snapshot);
const snapshot = (completed, updatedAt = 100, round = 1) => ({ version: 4, updatedAt, banks: {
  [BANK]: { progress: Object.fromEntries(completed.map(id => [id, { answeredAt: updatedAt, attempts: 1 }])),
    history: [], resetAt: 0, randomCycle: { round, knownIds: ids, remainingIds: ids.filter(id => !completed.includes(id)) } }
} });

await Promise.all([save(snapshot([ids[0]], 100)), save(snapshot([ids[1]], 200))]);
assert.deepEqual(Object.keys(database.row.payload.banks[BANK].progress).sort(), ids.slice(0, 2).sort());
assert.equal(database.row.payload.banks[BANK].randomCycle.remainingIds.length, ids.length - 2);
const insertConflicts = database.conflicts;
assert.ok(insertConflicts > 0, "concurrent initial insert must retry");
await Promise.all([save(snapshot([ids[2]], 300)), save(snapshot([ids[3]], 400))]);
assert.equal(Object.keys(database.row.payload.banks[BANK].progress).length, 4);
assert.equal(database.row.payload.banks[BANK].randomCycle.remainingIds.length, ids.length - 4);
assert.ok(database.conflicts > insertConflicts, "concurrent updates must retry");
const conditionalRetries = database.conflicts;

const merge = server.mergeStudySnapshots;
const newerRound = merge(snapshot([ids[0]], 500, 2), snapshot([ids[1]], 600, 1));
assert.equal(newerRound.banks[BANK].randomCycle.round, 2);
assert.ok(newerRound.banks[BANK].randomCycle.remainingIds.includes(ids[1]), "previous-round completion must not consume the next round");
const reset = snapshot([], 700);
reset.banks[BANK].resetAt = 700;
assert.equal(Object.keys(merge(reset, snapshot(ids.slice(0, 4), 800)).banks[BANK].progress).length, 0,
  "explicit reset must not resurrect old answers");

database.row = null;
function device(stored = {}, online = true) {
  const storage = new Map(Object.entries(stored));
  const documentListeners = new Map(), windowListeners = new Map(), timers = new Map(), elements = new Map();
  let timer = 0;
  const requests = [], inflight = new Set();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { dataset: {}, open: false, hidden: false,
      addEventListener() {}, close() { this.open = false; }, showModal() { this.open = true; } });
    return elements.get(selector);
  };
  const window = { addEventListener: (name, fn) => windowListeners.set(name, fn) };
  const navigator = { onLine: online };
  const context = vm.createContext({
    console, Date, Math, Map, Set, URL, URLSearchParams, Blob, crypto: webcrypto, window, navigator,
    location: { hash: "", pathname: "/", search: `?bank=${BANK}` }, history: { replaceState() {} },
    setTimeout: (fn, delay) => { timers.set(++timer, { fn, delay }); return timer; },
    clearTimeout: key => timers.delete(key), setInterval: () => 1, clearInterval() {},
    document: { visibilityState: "visible", querySelector: element, querySelectorAll: () => [],
      addEventListener: (name, fn) => documentListeners.set(name, fn) },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key) },
    fetch: (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ ...body, keepalive: options.keepalive });
      const promise = (async () => {
        if (body.action === "sync" && device.holdSync) await device.holdSync;
        const data = body.action === "pull" ? { snapshot: clone(database.row) }
          : body.action === "sync" ? { snapshot: await save(body.snapshot) } : {};
        return { ok: true, status: 200, json: async () => jsonb({ ok: true, ...data }) };
      })();
      inflight.add(promise);
      promise.finally(() => inflight.delete(promise));
      return promise;
    }, rows: questions.map(q => ({ ...q, options: q.options.join("\n"),
      question_underlines: JSON.stringify(q.question_underlines || []) }))
  });
  if (!storage.has("bijihou2.cloud-token.v1")) storage.set("bijihou2.cloud-token.v1", "a".repeat(64));
  vm.runInContext(configSource, context);
  vm.runInContext(mergeSource, context);
  window.mergeStudySnapshots = context.mergeStudySnapshots;
  vm.runInContext(cloudSource, context);
  vm.runInContext(appSource.replace(/\ninitializeApp\(\);\s*$/, ""), context);
  vm.runInContext("let renderCalls = 0, appliedSnapshots = 0; render = () => { renderCalls++; };", context);
  const run = code => vm.runInContext(code, context);
  return {
    storage, run, requests, navigator, timers, elements, windowListeners, documentListeners,
    async ready() {
      await window.studyCloud.initialize({ getSnapshot: run("createCloudSnapshot"), applySnapshot: snapshot => {
        run("appliedSnapshots++");
        run("applyCloudSnapshot")(snapshot);
      },
        getPresence: run("cloudPresence") });
      run("hydrateStudyState(); state.questions = rows.map(normalizeQuestion); buildDeck();");
      return this;
    },
    answer(id) {
      run(`recordAttempt(state.questions.find(q => q.id === ${JSON.stringify(id)}), false, 2, "random");`);
      window.studyCloud.trackEvent("answer_submitted", { questionId: id, correct: false, mode: "random" });
    },
    flush: () => window.studyCloud.flush(),
    async settle() {
      do {
        await Promise.all([...inflight]);
        await new Promise(resolve => setImmediate(resolve));
      } while (inflight.size);
    },
    remaining: () => clone(run("state.randomCycle.remainingIds")),
    saved: () => Object.fromEntries(storage)
  };
}

const a = await device().ready();
a.run(`state.index = state.deck.findIndex(q => q.id === ${JSON.stringify(ids[10])}); state.selectedAnswer = [1];`);
const beforeBackgroundSync = a.run("renderCalls");
const beforeBackgroundApply = a.run("appliedSnapshots");
await a.flush();
assert.equal(a.run("renderCalls"), beforeBackgroundSync, "unchanged JSONB snapshot must not rebuild the card");
assert.deepEqual(clone(a.run("state.selectedAnswer")), [1], "background sync must retain the selected answer");
database.row.client_updated_at += 1;
database.row.payload.updatedAt = database.row.client_updated_at;
a.documentListeners.get("visibilitychange")();
await a.settle();
assert.equal(a.run("renderCalls"), beforeBackgroundSync, "JSONB key order and sync time alone must not rebuild the card");
assert.equal(a.run("appliedSnapshots"), beforeBackgroundApply, "unchanged records must not be reapplied or queued for another upload");
a.answer(ids[0]);
await a.flush();
await a.settle();
// Manual classification replaces the same attempt even after its first sync.
a.run(`recordAttempt(state.questions.find(q => q.id === ${JSON.stringify(ids[0])}), false, 2, "random",
  { previous: null, historyIndex: 0 }, "uncertain");`);
await a.flush();
assert.equal(database.row.payload.banks[BANK].history.length, 1, "classification must not add a duplicate cloud attempt");
assert.equal(database.row.payload.banks[BANK].history[0].notebook, "uncertain");
const beforeOtherDevice = a.saved();
const b = await device().ready();
assert.ok(!b.remaining().includes(ids[0]), "second device must exclude the first device's submitted answer");
b.answer(ids[1]);
await b.flush();
await b.settle();
a.documentListeners.get("visibilitychange")();
await a.settle();
assert.equal(a.run("renderCalls"), beforeBackgroundSync, "another question's progress must not rebuild the current card");
assert.deepEqual(clone(a.run("state.selectedAnswer")), [1]);
assert.ok(!a.remaining().includes(ids[1]), "preserving the card must still update the unfinished round");
const reloaded = await device(beforeOtherDevice).ready();
assert.equal(reloaded.remaining().length, ids.length - 2);
assert.ok(!reloaded.remaining().includes(ids[0]) && !reloaded.remaining().includes(ids[1]));

const fastClock = { ...beforeOtherDevice, "bijihou2.cloud-updated.v1": String(Date.now() + 86400000) };
const skewed = await device(fastClock).ready();
assert.ok(!skewed.remaining().includes(ids[1]), "a faster local clock must not reject another device's completed answer");

const offline = await device(beforeOtherDevice, false).ready();
offline.answer(ids[2]);
offline.navigator.onLine = true;
offline.windowListeners.get("online")();
await offline.settle();
await offline.flush();
await offline.settle();
assert.equal(offline.remaining().length, ids.length - 3);
assert.equal(database.row.payload.banks[BANK].randomCycle.remainingIds.length, ids.length - 3);

// Save a new answer while the previous snapshot is still in flight.
let release;
device.holdSync = new Promise(resolve => { release = resolve; });
const inFlight = offline.flush();
await Promise.resolve();
offline.answer(ids[3]);
release();
device.holdSync = null;
await inFlight;
assert.ok(!offline.remaining().includes(ids[3]), "a sync response must not erase an answer submitted while awaiting it");
assert.equal(offline.elements.get("#cloudStatus").dataset.state, "syncing");
await offline.flush();
assert.equal(database.row.payload.banks[BANK].randomCycle.remainingIds.length, ids.length - 4);

// Refresh before the normal timer fires: the outgoing snapshot uses keepalive.
offline.answer(ids[4]);
offline.windowListeners.get("pagehide")();
await offline.settle();
assert.ok(offline.requests.some(request => request.action === "sync" && request.keepalive));
assert.equal(database.row.payload.banks[BANK].randomCycle.remainingIds.length, ids.length - 5);
const finalDevice = await device().ready();
assert.equal(finalDevice.remaining().length, ids.length - 5);
assert.equal(finalDevice.run("state.randomCycle.round"), 1);
for (const id of ids.slice(0, 5)) assert.ok(!finalDevice.remaining().includes(id), id);

// Repair an already inconsistent legacy first-round list from saved progress.
finalDevice.run(`state.randomCycle.remainingIds = state.questions.map(q => q.id); ensureRandomCycle();`);
assert.equal(finalDevice.remaining().length, ids.length - 5);
assert.equal(finalDevice.run("state.randomCycle.round"), 1);
assert.equal(finalDevice.run(`state.progress[${JSON.stringify(ids[0])}].attempts`), 1);
finalDevice.run(`
  startMockTimer = () => {};
  writeStorage(STORAGE_KEYS.activeMock, { questionIds: ${JSON.stringify(ids.slice(0, 10))},
    answers: {}, startedAt: Date.now(), durationMs: 5400000 });
  if (!restoreActiveMock()) throw new Error("Expected unfinished mock");
`);
assert.equal(finalDevice.run("state.mock.questionIds.length"), 5, "restored mock excludes completed first-round questions");
finalDevice.run(`
  writeStorage(STORAGE_KEYS.activeMock, { questionIds: ${JSON.stringify(ids.slice(0, 5))}, answers: {} });
  applyCloudSnapshot(createCloudSnapshot());
`);
assert.equal(finalDevice.run("state.mode"), "random", "obsolete mock must return to the unfinished random pool");
assert.equal(finalDevice.run("state.deck.length"), ids.length - 5);
console.log(JSON.stringify({ bank: BANK, questions: ids.length, conditionalRetries, refreshRemaining: reloaded.remaining().length,
  fastClockPreserved: true, offlineAnswersMerged: true, inFlightAnswerPreserved: true,
  keepaliveSaved: true, finalFirstRoundRemaining: finalDevice.remaining().length,
  staleFirstRoundRepaired: true, restoredMockExcludesCompleted: true,
  laterRoundPreserved: true, explicitResetPreserved: true,
  unchangedSyncSkipsApply: true, backgroundSyncPreservesCardAndSelection: true }, null, 2));

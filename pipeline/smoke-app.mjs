import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const appSource = (await readFile(new URL("../app.js", import.meta.url), "utf8")).replace(/\nloadData\(\);\s*$/, "");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const storage = new Map();
const context = vm.createContext({
  console,
  Date,
  Math,
  Map,
  Set,
  URL,
  URLSearchParams,
  Blob,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  window: { APP_CONFIG: {} },
  document: { querySelector: () => ({}) },
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key)
  }
});

vm.runInContext(appSource, context);

const selectors = [...appSource.matchAll(/document\.querySelector\("#([^"]+)"\)/g)].map((match) => match[1]);
const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
assert.deepEqual(selectors.filter((id) => !htmlIds.has(id)), [], "app.js references a missing HTML id");

const result = JSON.parse(JSON.stringify(vm.runInContext(`
  state.questions = Array.from({ length: 68 }, (_, index) => ({
    id: "q" + index,
    chapter: "ch" + String(index % 17).padStart(2, "0"),
    answer: [1]
  }));
  state.progress = {};
  state.dailyPlan = null;
  const first = todayParts(state.questions);
  const firstNewId = first.fresh[0].id;
  state.progress[firstNewId] = { answeredAt: Date.now(), due: Date.now() + DAY_MS, weak: false };
  const second = todayParts(state.questions);
  state.progress.q40 = { answeredAt: Date.now() - DAY_MS, due: Date.now() + DAY_MS, weak: true };
  state.progress.q41 = { answeredAt: Date.now() - DAY_MS, due: Date.now() - 1, weak: false };
  const third = todayParts(state.questions);
  state.progress.q42 = { correct: true, repetitions: 2, quality: 3, weak: false };
  ({
    firstNew: first.fresh.length,
    remainingNew: second.fresh.length,
    weak: third.weak.length,
    due: third.due.length,
    mastered: isMastered("q42"),
    mockCount: createMockQuestions().length,
    mockMinutes: MOCK_DURATION_MS / 60000,
    passScore: MOCK_PASS_SCORE,
    scoreFor28Correct: Math.round(28 / 40 * 100)
  });
`, context)));

assert.deepEqual(result, {
  firstNew: 10,
  remainingNew: 9,
  weak: 1,
  due: 1,
  mastered: true,
  mockCount: 40,
  mockMinutes: 90,
  passScore: 70,
  scoreFor28Correct: 70
});

console.log(JSON.stringify(result, null, 2));

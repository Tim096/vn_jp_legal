import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const appSource = (await readFile(new URL("../app.js", import.meta.url), "utf8")).replace(/\ninitializeApp\(\);\s*$/, "");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const aiMocks = JSON.parse(await readFile(new URL("../data/ai-mocks-2026.json", import.meta.url), "utf8"));
assert.equal(aiMocks.exams.length, 3, "2026 AI prediction should provide three exams");
const aiQuestionIds = aiMocks.exams.flatMap((exam) => exam.questions.map((question) => question.id));
assert.equal(new Set(aiQuestionIds).size, 24, "AI original question ids must be unique");
for (const exam of aiMocks.exams) {
  assert.equal(exam.questions.length, 8, `${exam.id} should contain eight AI original questions`);
  for (const question of exam.questions) {
    assert.ok(question.answer.every((answer) => answer >= 1 && answer <= question.options.length), `${question.id} has an invalid answer`);
    assert.match(question.sourceUrl, /^https:\/\//, `${question.id} should link to a primary source`);
  }
}
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
  navigator: {},
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
assert.match(html, /<a class="admin-entry-link" href="\.\/admin\.html"[^>]*>管理<\/a>/, "home page should link to the email-protected admin page");
assert.match(appSource, /function reviewMockMistakes\(\)[\s\S]*?elements\.studyToolbar\.hidden = false;/, "mock review needs a visible exit path");
assert.match(appSource, /function exportData\(\)[\s\S]*?document\.body\.append\(link\);[\s\S]*?setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 1000\);/, "export should keep the download URL alive long enough");

context.aiMocksFixture = aiMocks;
const result = JSON.parse(JSON.stringify(vm.runInContext(`
  state.questions = Array.from({ length: 340 }, (_, index) => ({
    id: "q" + index,
    chapter: "ch" + String(index % 17).padStart(2, "0"),
    question: "事例問題".repeat(30),
    options: ["a", "b", "c", "d"],
    answer: [1]
  }));
  state.progress = {
    legacy1: { answeredAt: 1, quality: 2 },
    legacy2: { answeredAt: 1, quality: 3 },
    legacy3: { answeredAt: 1, quality: 5 }
  };
  migrateNotebookCategories();
  const migratedNotebooks = [state.progress.legacy1.notebook, state.progress.legacy2.notebook, state.progress.legacy3.notebook];
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
  state.history = [];
  const replacement = { questionId: "q100", previous: null, historyIndex: 0 };
  recordAttempt(state.questions[100], true, 3, "today");
  recordAttempt(state.questions[100], true, 5, "today", replacement);
  const replacedAttemptCount = state.history.length;
  const replacedAttemptQuality = state.progress.q100.quality;
  const replacedAttemptRepetitions = state.progress.q100.repetitions;
  recordAttempt(state.questions[101], false, 2, "all", null, "uncertain");
  const mock = createMockQuestions();
  const mockTopPriority = mock.filter((question) => question.chapter === "ch13").length;
  const mockUnmarked = mock.filter((question) => !CHAPTER_PRIORITIES[question.chapter]).length;
  const mockIntro = mock.filter((question) => question.chapter === "ch00").length;
  const mockDisputes = mock.filter((question) => question.chapter === "ch12").length;
  state.aiMockExams = normalizeAiMockData(aiMocksFixture);
  const aiPacks = state.aiMockExams.map((exam) => createAiMockQuestions(exam.id));
  ({
    firstNew: first.fresh.length,
    remainingNew: second.fresh.length,
    weak: third.weak.length,
    due: third.due.length,
    mastered: isMastered("q42"),
    replacedAttemptCount,
    replacedAttemptQuality,
    replacedAttemptRepetitions,
    migratedNotebooks,
    incorrectNotebook: state.progress.q101.notebook,
    notebookHistory: state.history.find((item) => item.id === "q101").notebook,
    mockCount: mock.length,
    mockTopPriority,
    mockUnmarked,
    mockIntro,
    mockDisputes,
    aiMockCount: aiPacks.length,
    aiPackCounts: aiPacks.map((pack) => pack.length),
    aiOriginalCounts: aiPacks.map((pack) => pack.filter((question) => question.sourceTier === "ai-original-primary").length),
    aiUniqueCounts: aiPacks.map((pack) => new Set(pack.map((question) => question.id)).size),
    distinctAiPacks: new Set(aiPacks.map((pack) => pack.map((question) => question.id).sort().join(","))).size,
    aiCh13Counts: aiPacks.map((pack) => pack.filter((question) => question.chapter === "ch13").length),
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
  replacedAttemptCount: 1,
  replacedAttemptQuality: 5,
  replacedAttemptRepetitions: 1,
  migratedNotebooks: ["unknown", "uncertain", "known"],
  incorrectNotebook: "uncertain",
  notebookHistory: "uncertain",
  mockCount: 40,
  mockTopPriority: 7,
  mockUnmarked: 10,
  mockIntro: 0,
  mockDisputes: 4,
  aiMockCount: 3,
  aiPackCounts: [40, 40, 40],
  aiOriginalCounts: [8, 8, 8],
  aiUniqueCounts: [40, 40, 40],
  distinctAiPacks: 3,
  aiCh13Counts: [7, 7, 7],
  mockMinutes: 90,
  passScore: 70,
  scoreFor28Correct: 70
});

console.log(JSON.stringify(result, null, 2));

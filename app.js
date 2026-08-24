const STORAGE_KEYS = {
  progress: "bijihou2.progress.v1",
  history: "bijihou2.history.v1",
  reported: "bijihou2.reported.v1",
  mockResults: "bijihou2.mock-results.v1",
  activeMock: "bijihou2.active-mock.v1",
  dailyPlan: "bijihou2.daily-plan.v1",
  csvCache: "bijihou2.csv-cache.v3"
};

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_QUESTIONS_PER_DAY = 10;
const MOCK_QUESTION_COUNT = 40;
const MOCK_DURATION_MS = 90 * 60 * 1000;
const MOCK_PASS_SCORE = 70;
const CHAPTER_PRIORITIES = {
  ch13: { marker: "★★", level: "highest" },
  ch01: { marker: "★", level: "important" },
  ch02: { marker: "★", level: "important" },
  ch03: { marker: "★", level: "important" },
  ch04: { marker: "★", level: "important" },
  ch09: { marker: "★", level: "important" },
  ch12: { marker: "★", level: "important" },
  ch16: { marker: "★", level: "important" }
};
// Proxy weights: chapter counts selected from nine past exams in Shoeisha's 2026 problem book; not an official score allocation.
const MOCK_CHAPTER_WEIGHTS = {
  ch00: 0,
  ch01: 14,
  ch02: 18,
  ch03: 19,
  ch04: 12,
  ch05: 3,
  ch06: 4,
  ch07: 3,
  ch08: 4,
  ch09: 14,
  ch10: 9,
  ch11: 9,
  ch12: 18,
  ch13: 34,
  ch14: 5,
  ch15: 5,
  ch16: 11
};
const config = window.APP_CONFIG;
const SOURCE_TIER_LABELS = {
  "checked-secondary": "外部問題集・一次資料確認表記あり",
  "supplemental-secondary": "補充問題・法令基準日未確認"
};
const LOVE_NOTES = [
  "頑張る君も、休む君も、大好き。",
  "焦らなくていい。ずっと味方だよ。",
  "今日の10分も、未来の自信になる。",
  "彼氏は今日も君を応援してる。",
  "君なら大丈夫。"
];
const ENCOURAGEMENTS = [
  "今日もよく頑張ったね。彼氏はちゃんと知ってるよ ♥",
  "一歩ずつで大丈夫。いつでも君の味方。",
  "勉強する君も、休む君も、大好き。",
  "今日の努力、ほんとうにえらい。"
];
const E_GOV_LAW_IDS = {
  "下請法": "331AC0000000120",
  "不当景品類及び不当表示防止法": "337AC0000000134",
  "不正競争防止法": "405AC0000000047",
  "仲裁法": "415AC0000000138",
  "会社更生法": "414AC0000000154",
  "会社法": "417AC0000000086",
  "個人情報保護法": "415AC0000000057",
  "借地借家法": "403AC0000000090",
  "公益通報者保護法": "416AC0000000122",
  "刑法": "140AC0000000045",
  "割賦販売法": "336AC0000000159",
  "労働基準法": "322AC0000000049",
  "労働契約法": "419AC0000000128",
  "労働安全衛生法": "347AC0000000057",
  "労働組合法": "324AC0000000174",
  "労働者派遣事業の適正な運営の確保及び派遣労働者の保護等に関する法律": "360AC0000000088",
  "労働者派遣法": "360AC0000000088",
  "労働者災害補償保険法": "322AC0000000050",
  "取適法（旧下請法）": "331AC0000000120",
  "商標法": "334AC0000000127",
  "商法": "132AC0000000048",
  "国家賠償法": "322AC0000000125",
  "廃棄物処理法": "345AC0000000137",
  "日本国憲法": "321CONSTITUTION",
  "景品表示法": "337AC0000000134",
  "民事再生法": "411AC0000000225",
  "民事執行法": "354AC0000000004",
  "民事訴訟法": "408AC0000000109",
  "民法": "129AC0000000089",
  "法の適用に関する通則法": "418AC0000000078",
  "消費者契約法": "412AC0000000061",
  "特定商取引法": "351AC0000000057",
  "特定電子メールの送信の適正化等に関する法律": "414AC0100000026",
  "特定電子メール法": "414AC0100000026",
  "特許法": "334AC0000000121",
  "独占禁止法": "322AC0000000054",
  "環境基本法": "405AC0000000091",
  "男女雇用機会均等法": "347AC0000000113",
  "破産法": "416AC0000000075",
  "育児・介護休業法": "403AC0000000076",
  "著作権法": "345AC0000000048",
  "行政手続法": "405AC0000000088",
  "裁判所法": "322AC0000000059",
  "金融サービス提供法": "412AC0000000101",
  "金融商品取引法": "323AC0000000025",
  "雇用の分野における男女の均等な機会及び待遇の確保等に関する法律": "347AC0000000113",
  "電子消費者契約に関する民法の特例に関する法律": "413AC0000000095",
  "電子消費者契約法": "413AC0000000095",
  "電子署名及び認証業務に関する法律": "412AC0000000102",
  "電子署名法": "412AC0000000102"
};

const state = {
  questions: [],
  chapters: new Map(),
  deck: [],
  index: 0,
  mode: "today",
  chapter: "all",
  flipped: false,
  selectedAnswer: null,
  progress: readStorage(STORAGE_KEYS.progress, {}),
  history: readStorage(STORAGE_KEYS.history, []),
  reported: new Set(readStorage(STORAGE_KEYS.reported, [])),
  mockResults: readStorage(STORAGE_KEYS.mockResults, []),
  dailyPlan: readStorage(STORAGE_KEYS.dailyPlan, null),
  mock: null,
  mockTimer: null,
  easterClicks: 0
};

const elements = {
  statusPanel: document.querySelector("#statusPanel"),
  studyPanel: document.querySelector("#studyPanel"),
  emptyPanel: document.querySelector("#emptyPanel"),
  emptyMessage: document.querySelector("#emptyMessage"),
  easterMessage: document.querySelector("#easterMessage"),
  loveNotes: document.querySelector("#loveNotes"),
  easterTrigger: document.querySelector("#easterTrigger"),
  studyToolbar: document.querySelector("#studyToolbar"),
  todayTotal: document.querySelector("#todayTotal"),
  todayNew: document.querySelector("#todayNew"),
  todayDue: document.querySelector("#todayDue"),
  todayWeak: document.querySelector("#todayWeak"),
  chapterSelect: document.querySelector("#chapterSelect"),
  questionCard: document.querySelector("#questionCard"),
  questionId: document.querySelector("#questionId"),
  questionTitle: document.querySelector("#questionTitle"),
  questionText: document.querySelector("#questionText"),
  optionsList: document.querySelector("#optionsList"),
  answerPanel: document.querySelector("#answerPanel"),
  answerText: document.querySelector("#answerText"),
  explanationText: document.querySelector("#explanationText"),
  lawSection: document.querySelector("#lawSection"),
  lawLinks: document.querySelector("#lawLinks"),
  lawAsOf: document.querySelector("#lawAsOf"),
  sourceTier: document.querySelector("#sourceTier"),
  sourceLink: document.querySelector("#sourceLink"),
  reportButton: document.querySelector("#reportButton"),
  flipHint: document.querySelector("#flipHint"),
  cardPosition: document.querySelector("#cardPosition"),
  chapterName: document.querySelector("#chapterName"),
  previousButton: document.querySelector("#previousButton"),
  nextButton: document.querySelector("#nextButton"),
  showAnswerButton: document.querySelector("#showAnswerButton"),
  ratingBar: document.querySelector("#ratingBar"),
  progressButton: document.querySelector("#progressButton"),
  progressCount: document.querySelector("#progressCount"),
  progressDialog: document.querySelector("#progressDialog"),
  closeProgressButton: document.querySelector("#closeProgressButton"),
  progressStats: document.querySelector("#progressStats"),
  chapterProgress: document.querySelector("#chapterProgress"),
  mockHistory: document.querySelector("#mockHistory"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  showAllButton: document.querySelector("#showAllButton"),
  toast: document.querySelector("#toast"),
  openMockButton: document.querySelector("#openMockButton"),
  mockDialog: document.querySelector("#mockDialog"),
  closeMockButton: document.querySelector("#closeMockButton"),
  startMockButton: document.querySelector("#startMockButton"),
  mockStatus: document.querySelector("#mockStatus"),
  mockTimer: document.querySelector("#mockTimer"),
  mockAnswered: document.querySelector("#mockAnswered"),
  finishMockButton: document.querySelector("#finishMockButton"),
  mockResultPanel: document.querySelector("#mockResultPanel"),
  mockResultTitle: document.querySelector("#mockResultTitle"),
  mockResultScore: document.querySelector("#mockResultScore"),
  mockLoveNote: document.querySelector("#mockLoveNote"),
  mockChapterStats: document.querySelector("#mockChapterStats"),
  reviewMockButton: document.querySelector("#reviewMockButton"),
  closeMockResultButton: document.querySelector("#closeMockResultButton")
};

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function parseList(value, separator = ",") {
  return String(value || "")
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeQuestion(row) {
  return {
    id: row.id?.trim(),
    chapter: row.chapter?.trim(),
    title: row.title?.trim() || "",
    question: row.question?.trim(),
    options: String(row.options || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    answer: parseList(row.answer).map(Number).filter(Number.isInteger),
    explanation: row.explanation?.trim() || "",
    lawRefs: parseList(row.law_refs),
    tags: parseList(row.tags),
    confidence: row.confidence?.trim() || "mid",
    status: row.status?.trim() || "ok",
    lawAsOf: row.law_as_of?.trim() || "unknown",
    sourceTier: row.source_tier?.trim() || "supplemental-secondary",
    sourceUrl: row.source_url?.trim() || ""
  };
}

async function fetchCsv(url, cacheName) {
  const refresh = new URLSearchParams(location.search).get("refresh") === "1";
  const cache = readStorage(STORAGE_KEYS.csvCache, {});
  const cached = cache[cacheName];
  const maxAge = Number(config.cacheHours || 24) * 60 * 60 * 1000;

  if (!refresh && cached && Date.now() - cached.savedAt < maxAge) {
    return cached.text;
  }

  try {
    const response = await fetch(url, { cache: refresh ? "reload" : "default" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    cache[cacheName] = { text, savedAt: Date.now() };
    writeStorage(STORAGE_KEYS.csvCache, cache);
    return text;
  } catch (error) {
    if (cached?.text) return cached.text;
    throw error;
  }
}

function parseCsv(text) {
  if (!window.Papa) throw new Error("PapaParse unavailable");
  const result = window.Papa.parse(text, { header: true, skipEmptyLines: "greedy" });
  if (result.errors.length) throw new Error(result.errors[0].message);
  return result.data;
}

async function loadData() {
  try {
    const [questionsText, chaptersText] = await Promise.all([
      fetchCsv(config.questionsCsvUrl, "questions"),
      fetchCsv(config.chaptersCsvUrl, "chapters")
    ]);

    state.questions = parseCsv(questionsText)
      .map(normalizeQuestion)
      .filter((question) => question.id && question.chapter && question.question && question.options.length >= 2 && question.answer.length);

    state.chapters = new Map(parseCsv(chaptersText).map((row) => [row.chapter?.trim(), row.name?.trim()]));
    migrateLegacyHistory();
    renderLoveNotes();
    populateChapters();
    bindEvents();
    if (!restoreActiveMock()) buildDeck();
    registerServiceWorker();
  } catch (error) {
    console.error(error);
    elements.statusPanel.innerHTML = "<span>読み込みに失敗しました。もう一度お試しください。</span>";
  }
}

function populateChapters() {
  const availableChapters = new Set(state.questions.map((question) => question.chapter));
  elements.chapterSelect.replaceChildren(new Option("すべて", "all"));
  for (const [id, name] of state.chapters) {
    if (availableChapters.has(id)) elements.chapterSelect.add(new Option(formatChapterName(id, name), id));
  }
}

function formatChapterName(chapter, name) {
  const priority = CHAPTER_PRIORITIES[chapter];
  return priority ? `${priority.marker} ${name}` : name;
}

function renderLoveNotes() {
  elements.loveNotes.replaceChildren(...LOVE_NOTES.map((message) => {
    const note = document.createElement("span");
    note.textContent = message;
    return note;
  }));
}

function encouragementForToday() {
  const seed = [...currentDateKey()].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return ENCOURAGEMENTS[seed % ENCOURAGEMENTS.length];
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function migrateLegacyHistory() {
  if (state.history.length) return;
  state.history = Object.entries(state.progress)
    .filter(([, progress]) => progress?.answeredAt)
    .map(([id, progress]) => ({
      id,
      at: progress.answeredAt,
      correct: Boolean(progress.correct),
      quality: progress.quality || 2,
      mode: "legacy"
    }))
    .sort((a, b) => a.at - b.at);
  if (state.history.length) writeStorage(STORAGE_KEYS.history, state.history);
}

function isMastered(questionId) {
  const progress = state.progress[questionId];
  return Boolean(progress?.correct && progress.repetitions >= 2 && progress.quality >= 3 && !progress.weak);
}

function balancedQuestions(questions, limit) {
  const groups = new Map();
  for (const question of questions) {
    if (!groups.has(question.chapter)) groups.set(question.chapter, []);
    groups.get(question.chapter).push(question);
  }
  const result = [];
  while (result.length < limit && [...groups.values()].some((group) => group.length)) {
    for (const group of groups.values()) {
      if (group.length && result.length < limit) result.push(group.shift());
    }
  }
  return result;
}

function currentDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getDailyPlan() {
  const date = currentDateKey();
  const validIds = new Set(state.questions.map((question) => question.id));
  if (state.dailyPlan?.date !== date || !state.dailyPlan.newIds?.every((id) => validIds.has(id))) {
    state.dailyPlan = {
      date,
      newIds: balancedQuestions(shuffle(state.questions.filter((question) => !state.progress[question.id])), NEW_QUESTIONS_PER_DAY).map((question) => question.id)
    };
    writeStorage(STORAGE_KEYS.dailyPlan, state.dailyPlan);
  }
  return state.dailyPlan;
}

function todayParts(questions) {
  const now = Date.now();
  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const due = questions
    .filter((question) => state.progress[question.id]?.due <= now)
    .sort((a, b) => state.progress[a.id].due - state.progress[b.id].due);
  const dueIds = new Set(due.map((question) => question.id));
  const weak = questions.filter((question) => {
    const progress = state.progress[question.id];
    return progress?.weak && progress.answeredAt < startOfDay && !dueIds.has(question.id);
  });
  const questionIds = new Set(questions.map((question) => question.id));
  const fresh = getDailyPlan().newIds
    .filter((id) => questionIds.has(id) && !state.progress[id])
    .map((id) => state.questions.find((question) => question.id === id));
  return { due, weak, fresh };
}

function updateTodaySummary() {
  const questions = state.questions.filter((question) => state.chapter === "all" || question.chapter === state.chapter);
  const parts = todayParts(questions);
  elements.todayNew.textContent = parts.fresh.length;
  elements.todayDue.textContent = parts.due.length;
  elements.todayWeak.textContent = parts.weak.length;
  elements.todayTotal.textContent = parts.fresh.length + parts.due.length + parts.weak.length;
}

function buildDeck() {
  let deck = state.questions.filter((question) => state.chapter === "all" || question.chapter === state.chapter);
  const now = Date.now();

  if (state.mode === "today") {
    const parts = todayParts(deck);
    deck = [...parts.due, ...parts.weak, ...parts.fresh];
  } else if (state.mode === "due") {
    deck = deck.filter((question) => state.progress[question.id]?.due <= now);
  } else if (state.mode === "weak") {
    deck = deck.filter((question) => state.progress[question.id]?.weak);
  } else if (state.mode === "random") {
    deck = shuffle(deck);
  }

  state.deck = deck;
  state.index = 0;
  state.flipped = false;
  state.selectedAnswer = null;
  render();
}

function currentQuestion() {
  return state.deck[state.index];
}

function render() {
  elements.statusPanel.hidden = true;
  updateProgressSummary();
  updateTodaySummary();

  if (!state.deck.length) {
    elements.studyPanel.hidden = true;
    elements.ratingBar.hidden = true;
    elements.emptyPanel.hidden = false;
    elements.emptyMessage.textContent = state.mode === "today"
      ? "今日の学習は完了しました"
      : state.mode === "due" ? "今日の復習は完了しました" : "まだ問題がありません";
    elements.easterMessage.hidden = state.mode !== "today";
    elements.easterMessage.textContent = state.mode === "today" ? encouragementForToday() : "";
    return;
  }

  elements.easterMessage.hidden = true;
  elements.emptyPanel.hidden = true;
  elements.studyPanel.hidden = false;
  renderCard();
}

function renderCard() {
  const question = currentQuestion();
  const mockActive = state.mode === "mock";
  const mockReview = state.mode === "mock-review";
  state.flipped = mockReview;
  state.selectedAnswer = mockActive || mockReview ? state.mock?.answers[question.id] ?? null : null;
  elements.questionId.textContent = question.id;
  elements.questionTitle.textContent = question.title;
  elements.questionTitle.hidden = !question.title;
  elements.questionText.textContent = question.question;
  elements.cardPosition.textContent = `${state.index + 1} / ${state.deck.length}`;
  elements.chapterName.textContent = state.chapters.get(question.chapter) || question.chapter;
  elements.answerPanel.hidden = !mockReview;
  elements.flipHint.hidden = mockReview;
  elements.flipHint.textContent = mockActive ? "選択すると回答が保存されます" : "選択肢を選んでください";
  elements.showAnswerButton.hidden = mockReview;
  elements.showAnswerButton.textContent = mockActive ? "次の問題" : "回答する";
  elements.showAnswerButton.disabled = !mockActive;
  elements.ratingBar.hidden = true;

  elements.optionsList.replaceChildren(...question.options.map((option, index) => {
    const item = document.createElement("li");
    const answer = index + 1;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-choice";
    button.textContent = option;
    button.setAttribute("aria-label", `選択肢 ${index + 1}: ${option}`);
    button.disabled = mockReview;
    button.addEventListener("click", () => selectOption(answer));
    item.classList.toggle("is-selected", mockActive && answer === state.selectedAnswer);
    item.classList.toggle("is-answer", mockReview && question.answer.includes(answer));
    item.classList.toggle("is-wrong", mockReview && answer === state.selectedAnswer && !question.answer.includes(answer));
    item.append(button);
    return item;
  }));

  elements.answerText.textContent = "";
  elements.answerText.classList.remove("is-wrong");
  elements.explanationText.textContent = question.explanation || "解説は登録されていません。";
  renderLaws(question.lawRefs);
  elements.lawAsOf.textContent = question.lawAsOf === "unknown" ? "法令基準日：未確認" : `法令基準日：${question.lawAsOf}`;
  elements.sourceTier.textContent = SOURCE_TIER_LABELS[question.sourceTier] || question.sourceTier;
  elements.sourceLink.hidden = !question.sourceUrl;
  elements.sourceLink.href = question.sourceUrl || "#";
  elements.reportButton.textContent = state.reported.has(question.id) ? "報告用情報を共有済み" : "この問題を報告";
  elements.previousButton.disabled = state.deck.length < 2;
  elements.nextButton.disabled = state.deck.length < 2;
  elements.mockStatus.hidden = !mockActive;
  if (mockActive) updateMockStatus();
  if (mockReview) {
    const isCorrect = question.answer.includes(state.selectedAnswer);
    elements.answerText.textContent = isCorrect ? `正解です：${question.answer.join("、")}` : `不正解。正解：${question.answer.join("、")}`;
    elements.answerText.classList.toggle("is-wrong", !isCorrect);
  }
  elements.questionCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderLaws(lawRefs) {
  elements.lawSection.hidden = lawRefs.length === 0;
  elements.lawLinks.replaceChildren(...lawRefs.map((lawRef) => {
    const link = document.createElement("a");
    const lawName = lawRef.replace(/\s*第\d+条.*$/, "").trim();
    const lawId = E_GOV_LAW_IDS[lawName];
    link.textContent = lawRef;
    link.href = lawId ? `https://laws.e-gov.go.jp/law/${lawId}` : "https://laws.e-gov.go.jp/";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }));
}

function selectOption(answer) {
  if (state.flipped || !currentQuestion()) return;
  if (answer < 1 || answer > currentQuestion().options.length) return;
  state.selectedAnswer = answer;
  if (state.mode === "mock") {
    state.mock.answers[currentQuestion().id] = answer;
    persistActiveMock();
    updateMockStatus();
  }
  [...elements.optionsList.children].forEach((item, index) => item.classList.toggle("is-selected", index + 1 === answer));
  elements.showAnswerButton.disabled = false;
  elements.flipHint.textContent = `選択肢 ${answer} を選択中`;
}

function submitAnswer() {
  if (state.flipped || !currentQuestion()) return;
  if (state.mode === "mock") {
    moveCard(1);
    return;
  }
  if (state.selectedAnswer === null) {
    showToast("選択肢を選んでください");
    return;
  }
  state.flipped = true;
  const question = currentQuestion();
  [...elements.optionsList.children].forEach((item, index) => {
    const answer = index + 1;
    item.classList.remove("is-selected");
    item.classList.toggle("is-answer", question.answer.includes(answer));
    item.classList.toggle("is-wrong", answer === state.selectedAnswer && !question.answer.includes(answer));
    item.querySelector("button").disabled = true;
  });
  const isCorrect = question.answer.includes(state.selectedAnswer);
  elements.answerText.textContent = isCorrect ? `正解です：${question.answer.join("、")}` : `不正解。正解：${question.answer.join("、")}`;
  elements.answerText.classList.toggle("is-wrong", !isCorrect);
  elements.answerPanel.hidden = false;
  elements.flipHint.hidden = true;
  elements.showAnswerButton.hidden = true;
  elements.ratingBar.hidden = false;
}

function moveCard(offset) {
  if (!state.deck.length) return;
  state.index = (state.index + offset + state.deck.length) % state.deck.length;
  renderCard();
}

function rateCurrent(quality) {
  const question = currentQuestion();
  if (!question || !state.flipped) return;
  const isCorrect = question.answer.includes(state.selectedAnswer);
  recordAttempt(question, isCorrect, isCorrect ? quality : 2, state.mode);
  updateProgressSummary();
  updateTodaySummary();
  const correctCount = state.history.filter((item) => item.correct).length;
  if (isCorrect && correctCount % 10 === 0) showToast(`正解${correctCount}問。${encouragementForToday()}`, 3600);
  else showToast("進捗を保存しました");

  if (state.mode === "today" || state.mode === "due" || state.mode === "weak") {
    state.deck.splice(state.index, 1);
    if (state.index >= state.deck.length) state.index = 0;
    render();
  } else {
    moveCard(1);
  }
}

function recordAttempt(question, isCorrect, reviewQuality, mode) {
  const previous = state.progress[question.id] || { repetitions: 0, interval: 0, ease: 2.5 };
  let repetitions = previous.repetitions;
  let interval = previous.interval;
  let ease = previous.ease;

  if (reviewQuality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.max(1, Math.round(interval * ease));
  }

  ease = Math.max(1.3, ease + (0.1 - (5 - reviewQuality) * (0.08 + (5 - reviewQuality) * 0.02)));
  const attempts = (previous.attempts || 0) + 1;
  const correctCount = (previous.correctCount || 0) + Number(isCorrect);
  const recentForQuestion = state.history.filter((item) => item.id === question.id).slice(-1);
  const consecutiveCorrect = isCorrect && recentForQuestion[0]?.correct ? 2 : Number(isCorrect);
  state.progress[question.id] = {
    repetitions,
    interval,
    ease: Number(ease.toFixed(2)),
    due: Date.now() + interval * DAY_MS,
    answeredAt: Date.now(),
    quality: reviewQuality,
    correct: isCorrect,
    weak: !isCorrect || reviewQuality < 3 || Boolean(previous.weak && consecutiveCorrect < 2),
    attempts,
    correctCount
  };
  state.history.push({ id: question.id, at: Date.now(), correct: isCorrect, quality: reviewQuality, mode });
  writeStorage(STORAGE_KEYS.progress, state.progress);
  writeStorage(STORAGE_KEYS.history, state.history);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

async function reportCurrent() {
  const question = currentQuestion();
  if (!question) return;
  const text = [
    `問題ID: ${question.id}`,
    question.title,
    question.question,
    `法令基準日: ${question.lawAsOf === "unknown" ? "未確認" : question.lawAsOf}`,
    question.sourceUrl
  ].filter(Boolean).join("\n");
  try {
    if (navigator.share) await navigator.share({ title: "問題報告", text });
    else await copyText(text);
    state.reported.add(question.id);
    writeStorage(STORAGE_KEYS.reported, [...state.reported]);
    elements.reportButton.textContent = "報告用情報を共有済み";
    showToast(navigator.share ? "共有しました" : "問題情報をコピーしました");
  } catch (error) {
    if (error.name !== "AbortError") showToast("共有に失敗しました");
  }
}

function updateProgressSummary() {
  const mastered = state.questions.filter((question) => isMastered(question.id)).length;
  elements.progressCount.textContent = `${mastered} / ${state.questions.length}`;
}

function openProgress() {
  const answered = state.questions.filter((question) => state.progress[question.id]);
  const weak = answered.filter((question) => state.progress[question.id].weak).length;
  const due = answered.filter((question) => state.progress[question.id].due <= Date.now()).length;
  const mastered = state.questions.filter((question) => isMastered(question.id)).length;
  const correct = state.history.filter((item) => item.correct).length;
  const accuracy = state.history.length ? Math.round(correct / state.history.length * 100) : 0;
  const stats = [
    [mastered, "習得済み"],
    [`${accuracy}%`, "累積正答率"],
    [due, "今日の復習"],
    [weak, "苦手問題"]
  ];
  elements.progressStats.replaceChildren(...stats.map(([value, label]) => {
    const item = document.createElement("div");
    item.className = "stat";
    item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    return item;
  }));
  renderChapterProgress();
  renderMockHistory();
  elements.progressDialog.showModal();
}

function renderChapterProgress() {
  const rows = [];
  for (const [chapter, name] of state.chapters) {
    const questions = state.questions.filter((question) => question.chapter === chapter);
    if (!questions.length) continue;
    const attempts = state.history.filter((item) => questions.some((question) => question.id === item.id));
    const accuracy = attempts.length ? Math.round(attempts.filter((item) => item.correct).length / attempts.length * 100) : 0;
    const mastered = questions.filter((question) => isMastered(question.id)).length;
    rows.push({ chapter, name, accuracy, mastered, total: questions.length });
  }
  const heading = document.createElement("h3");
  heading.textContent = "章別の到達度";
  elements.chapterProgress.replaceChildren(heading, ...rows.map((row) => {
    const item = document.createElement("div");
    const priority = CHAPTER_PRIORITIES[row.chapter];
    item.className = `chapter-progress-row${priority ? ` is-${priority.level}` : ""}`;
    item.replaceChildren(
      Object.assign(document.createElement("span"), { textContent: formatChapterName(row.chapter, row.name) }),
      Object.assign(document.createElement("span"), { textContent: `${row.accuracy}%` }),
      Object.assign(document.createElement("span"), { textContent: `${row.mastered}/${row.total}` })
    );
    return item;
  }));
}

function renderMockHistory() {
  const heading = document.createElement("h3");
  heading.textContent = "模擬試験";
  const results = state.mockResults.slice(-3).reverse();
  elements.mockHistory.replaceChildren(heading, ...results.map((result) => {
    const item = document.createElement("p");
    item.textContent = `${new Date(result.at).toLocaleDateString("ja-JP")}　${result.score}点　${result.score >= MOCK_PASS_SCORE ? "合格圏" : "要復習"}`;
    return item;
  }));
}

function exportData() {
  const blob = new Blob([JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    progress: state.progress,
    history: state.history,
    reported: [...state.reported],
    mockResults: state.mockResults
  }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `bijihou2-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importData(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (![1, 2].includes(data.version) || !data.progress || typeof data.progress !== "object" || Array.isArray(data.progress)) throw new Error("Invalid backup");
    if (!window.confirm("現在の進捗を読み込んだデータで置き換えますか？")) return;
    state.progress = data.progress;
    state.history = Array.isArray(data.history) ? data.history : [];
    state.reported = new Set(Array.isArray(data.reported) ? data.reported : []);
    state.mockResults = Array.isArray(data.mockResults) ? data.mockResults : [];
    state.dailyPlan = null;
    writeStorage(STORAGE_KEYS.progress, state.progress);
    writeStorage(STORAGE_KEYS.history, state.history);
    writeStorage(STORAGE_KEYS.reported, [...state.reported]);
    writeStorage(STORAGE_KEYS.mockResults, state.mockResults);
    localStorage.removeItem(STORAGE_KEYS.dailyPlan);
    migrateLegacyHistory();
    elements.progressDialog.close();
    buildDeck();
    showToast("データを読み込みました");
  } catch {
    showToast("読み込みに失敗しました");
  } finally {
    elements.importInput.value = "";
  }
}

function createMockQuestions() {
  const groups = new Map();
  for (const question of state.questions) {
    if (!groups.has(question.chapter)) groups.set(question.chapter, []);
    groups.get(question.chapter).push(question);
  }
  for (const [chapter, questions] of groups) groups.set(chapter, orderMockCandidates(questions));

  const targetCount = Math.min(MOCK_QUESTION_COUNT, state.questions.length);
  const allocations = allocateMockCounts(groups, targetCount);
  const selected = [];
  const remaining = [];
  for (const [chapter, questions] of groups) {
    const count = allocations.get(chapter) ?? 0;
    selected.push(...questions.slice(0, count));
    remaining.push(...questions.slice(count));
  }
  if (selected.length < targetCount) {
    const orderedRemaining = orderMockCandidates(remaining);
    selected.push(...orderedRemaining.slice(0, targetCount - selected.length));
  }
  return shuffle(selected);
}

function allocateMockCounts(groups, targetCount) {
  const chapters = [...groups.entries()].map(([chapter, questions]) => {
    const weight = MOCK_CHAPTER_WEIGHTS[chapter] ?? 1;
    return { chapter, capacity: questions.length, weight, count: 0, target: 0 };
  });
  const totalWeight = chapters.reduce((sum, item) => sum + item.weight, 0);
  for (const item of chapters) {
    item.target = targetCount * item.weight / totalWeight;
    item.count = Math.min(item.capacity, Math.floor(item.target));
  }
  let unallocated = targetCount - chapters.reduce((sum, item) => sum + item.count, 0);
  while (unallocated > 0) {
    const candidate = chapters
      .filter((item) => item.count < item.capacity)
      .sort((left, right) => (right.target - right.count) - (left.target - left.count) || left.chapter.localeCompare(right.chapter))[0];
    if (!candidate) break;
    candidate.count += 1;
    unallocated -= 1;
  }
  return new Map(chapters.map((item) => [item.chapter, item.count]));
}

function orderMockCandidates(questions) {
  const tiers = [[], [], []];
  for (const question of questions) {
    const optionCount = question.options?.length ?? 0;
    const textLength = question.question?.length ?? 0;
    if (optionCount >= 4 && textLength >= 100) tiers[0].push(question);
    else if (optionCount >= 4) tiers[1].push(question);
    else tiers[2].push(question);
  }
  return tiers.flatMap((tier) => shuffle(tier));
}

function startMock() {
  const questions = createMockQuestions();
  state.mock = {
    questionIds: questions.map((question) => question.id),
    answers: {},
    startedAt: Date.now(),
    durationMs: MOCK_DURATION_MS,
    submitted: false
  };
  state.mode = "mock";
  elements.studyToolbar.hidden = true;
  elements.loveNotes.hidden = true;
  elements.chapterSelect.disabled = true;
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.remove("is-active"));
  state.deck = questions;
  state.index = 0;
  state.flipped = false;
  state.selectedAnswer = null;
  elements.mockDialog.close();
  elements.mockResultPanel.hidden = true;
  persistActiveMock();
  startMockTimer();
  render();
}

function persistActiveMock() {
  if (state.mock && !state.mock.submitted) writeStorage(STORAGE_KEYS.activeMock, state.mock);
}

function restoreActiveMock() {
  const saved = readStorage(STORAGE_KEYS.activeMock, null);
  if (!saved?.questionIds?.length || saved.submitted) return false;
  const byId = new Map(state.questions.map((question) => [question.id, question]));
  const questions = saved.questionIds.map((id) => byId.get(id)).filter(Boolean);
  if (questions.length !== saved.questionIds.length) return false;
  state.mock = saved;
  state.mode = "mock";
  elements.studyToolbar.hidden = true;
  elements.loveNotes.hidden = true;
  elements.chapterSelect.disabled = true;
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.remove("is-active"));
  state.deck = questions;
  state.index = 0;
  startMockTimer();
  if (mockRemainingMs() <= 0) finishMock(true);
  else render();
  return true;
}

function mockRemainingMs() {
  return Math.max(0, state.mock.startedAt + state.mock.durationMs - Date.now());
}

function startMockTimer() {
  clearInterval(state.mockTimer);
  updateMockStatus();
  state.mockTimer = setInterval(() => {
    updateMockStatus();
    if (mockRemainingMs() <= 0) finishMock(true);
  }, 1000);
}

function updateMockStatus() {
  if (!state.mock || state.mode !== "mock") return;
  const remainingSeconds = Math.ceil(mockRemainingMs() / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  elements.mockTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  elements.mockAnswered.textContent = `${Object.keys(state.mock.answers).length} / ${state.mock.questionIds.length} 回答`;
}

function finishMock(autoSubmit = false) {
  if (!state.mock || state.mock.submitted) return;
  const unanswered = state.mock.questionIds.length - Object.keys(state.mock.answers).length;
  if (!autoSubmit && unanswered && !window.confirm(`未回答が${unanswered}問あります。採点しますか？`)) return;
  clearInterval(state.mockTimer);
  if (elements.progressDialog.open) elements.progressDialog.close();
  if (elements.mockDialog.open) elements.mockDialog.close();
  const byId = new Map(state.questions.map((question) => [question.id, question]));
  const questions = state.mock.questionIds.map((id) => byId.get(id));
  let correct = 0;
  const chapters = {};
  for (const question of questions) {
    const selected = state.mock.answers[question.id] ?? null;
    const isCorrect = question.answer.includes(selected);
    correct += Number(isCorrect);
    if (!chapters[question.chapter]) chapters[question.chapter] = { correct: 0, total: 0 };
    chapters[question.chapter].correct += Number(isCorrect);
    chapters[question.chapter].total += 1;
    recordAttempt(question, isCorrect, isCorrect ? 3 : 2, "mock");
  }
  const score = Math.round(correct / questions.length * 100);
  const result = { at: Date.now(), score, correct, total: questions.length, chapters };
  state.mock.submitted = true;
  state.mock.result = result;
  state.mockResults.push(result);
  writeStorage(STORAGE_KEYS.mockResults, state.mockResults);
  localStorage.removeItem(STORAGE_KEYS.activeMock);
  state.mode = "mock-result";
  elements.studyPanel.hidden = true;
  elements.emptyPanel.hidden = true;
  elements.ratingBar.hidden = true;
  elements.mockStatus.hidden = true;
  renderMockResult();
  updateProgressSummary();
  updateTodaySummary();
}

function renderMockResult() {
  const result = state.mock.result;
  elements.mockResultPanel.hidden = false;
  elements.mockResultTitle.textContent = result.score >= MOCK_PASS_SCORE ? "合格圏です" : "復習が必要です";
  elements.mockResultScore.textContent = `${result.score}点`;
  elements.mockLoveNote.textContent = result.score >= MOCK_PASS_SCORE
    ? "合格圏、おめでとう。彼氏もきっと誇らしいよ ♥"
    : "点数より、ここまで続けた君がすごい。彼氏はずっと味方だよ。";
  elements.mockChapterStats.replaceChildren(...Object.entries(result.chapters).map(([chapter, value]) => {
    const row = document.createElement("div");
    row.className = "chapter-result-row";
    row.replaceChildren(
      Object.assign(document.createElement("span"), { textContent: state.chapters.get(chapter) || chapter }),
      Object.assign(document.createElement("strong"), { textContent: `${value.correct} / ${value.total}` })
    );
    return row;
  }));
  elements.reviewMockButton.disabled = result.correct === result.total;
}

function reviewMockMistakes() {
  const byId = new Map(state.questions.map((question) => [question.id, question]));
  state.deck = state.mock.questionIds
    .map((id) => byId.get(id))
    .filter((question) => !question.answer.includes(state.mock.answers[question.id] ?? null));
  state.mode = "mock-review";
  state.index = 0;
  elements.mockResultPanel.hidden = true;
  render();
}

function closeMockResult() {
  state.mock = null;
  state.mode = "today";
  elements.studyToolbar.hidden = false;
  elements.loveNotes.hidden = false;
  elements.chapterSelect.disabled = false;
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === "today"));
  elements.mockResultPanel.hidden = true;
  buildDeck();
}

function selectMode(mode) {
  if (state.mode === "mock" && !state.mock?.submitted) {
    showToast("模擬試験を先に採点してください");
    return;
  }
  state.mock = null;
  elements.studyToolbar.hidden = false;
  elements.loveNotes.hidden = false;
  elements.chapterSelect.disabled = false;
  elements.mockResultPanel.hidden = true;
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === mode));
  buildDeck();
}

function showAllQuestions() {
  state.chapter = "all";
  elements.chapterSelect.value = "all";
  selectMode("all");
}

let toastTimer;
function showToast(message, duration = 1800) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), duration);
}

function bindEvents() {
  elements.chapterSelect.addEventListener("change", (event) => {
    if (state.mode === "mock" || state.mode === "mock-review") {
      event.target.value = state.chapter;
      showToast("模擬試験を終了してから章を変更してください");
      return;
    }
    state.chapter = event.target.value;
    buildDeck();
  });
  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => selectMode(button.dataset.mode)));
  elements.showAnswerButton.addEventListener("click", submitAnswer);
  elements.previousButton.addEventListener("click", () => moveCard(-1));
  elements.nextButton.addEventListener("click", () => moveCard(1));
  elements.reportButton.addEventListener("click", reportCurrent);
  elements.ratingBar.querySelectorAll("[data-quality]").forEach((button) => button.addEventListener("click", () => rateCurrent(Number(button.dataset.quality))));
  elements.progressButton.addEventListener("click", openProgress);
  elements.closeProgressButton.addEventListener("click", () => elements.progressDialog.close());
  elements.exportButton.addEventListener("click", exportData);
  elements.importInput.addEventListener("change", () => importData(elements.importInput.files[0]));
  elements.showAllButton.addEventListener("click", showAllQuestions);
  elements.openMockButton.addEventListener("click", () => {
    if (state.mode === "mock") showToast("模擬試験を実施中です");
    else elements.mockDialog.showModal();
  });
  elements.closeMockButton.addEventListener("click", () => elements.mockDialog.close());
  elements.startMockButton.addEventListener("click", startMock);
  elements.finishMockButton.addEventListener("click", () => finishMock(false));
  elements.reviewMockButton.addEventListener("click", reviewMockMistakes);
  elements.closeMockResultButton.addEventListener("click", closeMockResult);
  elements.easterTrigger.addEventListener("click", () => {
    state.easterClicks += 1;
    if (state.easterClicks === 5) {
      state.easterClicks = 0;
      showToast("何回でも言うよ。君の彼氏は君を愛してる ♥", 4500);
    }
  });
  window.addEventListener("keydown", (event) => {
    if (elements.progressDialog.open || elements.mockDialog.open) return;
    if (event.key === "ArrowLeft") moveCard(-1);
    if (event.key === "ArrowRight") moveCard(1);
    if (/^[1-5]$/.test(event.key) && !state.flipped) selectOption(Number(event.key));
    else if (["1", "2", "3"].includes(event.key)) rateCurrent({ "1": 2, "2": 3, "3": 5 }[event.key]);
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service worker registration failed", error));
  }
}

loadData();

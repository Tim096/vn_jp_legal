const config = window.APP_CONFIG;
const BANKS = config.banks || {};
const DEFAULT_BANK = config.defaultBank || Object.keys(BANKS)[0] || "jp-business-law";
const BANK_KEY = "bijihou2.bank.v1";
const URL_PARAMS = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
const REQUESTED_BANK = URL_PARAMS.get("bank");
const DIRECT_QUESTION_ID = URL_PARAMS.get("question");
const INITIAL_BANK = BANKS[REQUESTED_BANK]
  ? REQUESTED_BANK
  : (BANKS[localStorage.getItem(BANK_KEY)] ? localStorage.getItem(BANK_KEY) : DEFAULT_BANK);
const LEGACY_STORAGE_KEYS = {
  progress: "bijihou2.progress.v1",
  history: "bijihou2.history.v1",
  reported: "bijihou2.reported.v1",
  mockResults: "bijihou2.mock-results.v1",
  activeMock: "bijihou2.active-mock.v1",
  dailyPlan: "bijihou2.daily-plan.v1",
  csvCache: "bijihou2.csv-cache.v3"
};
function storageKeysForBank(bank) {
  if (bank === "jp-business-law") return { ...LEGACY_STORAGE_KEYS };
  const prefix = `bijihou2.${bank}`;
  return {
    progress: `${prefix}.progress.v1`,
    history: `${prefix}.history.v1`,
    reported: `${prefix}.reported.v1`,
    mockResults: `${prefix}.mock-results.v1`,
    activeMock: `${prefix}.active-mock.v1`,
    dailyPlan: `${prefix}.daily-plan.v1`,
    csvCache: LEGACY_STORAGE_KEYS.csvCache
  };
}
let STORAGE_KEYS = storageKeysForBank(INITIAL_BANK);
const STUDY_STORAGE_KEYS = [...new Set(Object.keys(BANKS).flatMap((bank) => {
  const keys = storageKeysForBank(bank);
  return ["progress", "history", "reported", "mockResults", "activeMock", "dailyPlan"].map((key) => keys[key]);
}))];
const DURABLE_DB_NAME = "bijihou2-durable-storage";
const DURABLE_STORE_NAME = "snapshots";
const durableValues = {};
let durableSaveTimer;

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_QUESTIONS_PER_DAY = 10;
const MOCK_QUESTION_COUNT = 40;
const MOCK_DURATION_MS = 90 * 60 * 1000;
const MOCK_PASS_SCORE = 70;
const NOTEBOOK_MODES = {
  "notebook-unknown": "unknown",
  "notebook-uncertain": "uncertain",
  "notebook-known": "known"
};
const NOTEBOOK_LABELS = {
  unknown: "わからない",
  uncertain: "あいまい",
  known: "わかる"
};
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
const SOURCE_TIER_LABELS = {
  "checked-secondary": "外部問題集・一次資料確認表記あり",
  "supplemental-secondary": "補充問題・法令基準日未確認",
  "ai-original-primary": "AIオリジナル・公式一次資料で確認",
  "official-primary": "考選部官方答案為判分依據；各欄來源見下方"
};
const LOVE_NOTES = [
  "頑張る君も、休む君も、大好き。",
  "焦らなくていい。ずっと味方だよ。",
  "今日の10分も、未来の自信になる。",
  "彼氏は今日も君を応援してる。",
  "君なら大丈夫。",
  "いつでも味方。",
  "今日もえらい。",
  "一歩ずつで大丈夫。",
  "ちゃんと見てるよ。",
  "無理しすぎないでね。",
  "合格まで一緒に。",
  "大好きだよ ♥"
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
  bank: INITIAL_BANK,
  questions: [],
  aiMockExams: [],
  chapters: new Map(),
  deck: [],
  index: 0,
  mode: "today",
  chapter: "all",
  flipped: false,
  selectedAnswer: [],
  progress: readStorage(STORAGE_KEYS.progress, {}),
  history: readStorage(STORAGE_KEYS.history, []),
  reported: new Set(readStorage(STORAGE_KEYS.reported, [])),
  mockResults: readStorage(STORAGE_KEYS.mockResults, []),
  dailyPlan: readStorage(STORAGE_KEYS.dailyPlan, null),
  mock: null,
  mockTimer: null,
  easterClicks: 0,
  pendingAttempt: null
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
  provenanceDisclosure: document.querySelector("#provenanceDisclosure"),
  provenanceDetails: document.querySelector("#provenanceDetails"),
  sourceLink: document.querySelector("#sourceLink"),
  answerSourceLink: document.querySelector("#answerSourceLink"),
  explanationSourceLink: document.querySelector("#explanationSourceLink"),
  siteTitle: document.querySelector("#siteTitle"),
  bankSwitch: document.querySelector("#bankSwitch"),
  chapterPriorityNote: document.querySelector("#chapterPriorityNote"),
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
  resetButton: document.querySelector("#resetButton"),
  showAllButton: document.querySelector("#showAllButton"),
  toast: document.querySelector("#toast"),
  openMockButton: document.querySelector("#openMockButton"),
  openAiMockButton: document.querySelector("#openAiMockButton"),
  mockDialog: document.querySelector("#mockDialog"),
  closeMockButton: document.querySelector("#closeMockButton"),
  startMockButton: document.querySelector("#startMockButton"),
  aiMockDialog: document.querySelector("#aiMockDialog"),
  closeAiMockButton: document.querySelector("#closeAiMockButton"),
  aiMockList: document.querySelector("#aiMockList"),
  startAiMockButton: document.querySelector("#startAiMockButton"),
  mockStatus: document.querySelector("#mockStatus"),
  mockTypeLabel: document.querySelector("#mockTypeLabel"),
  mockTimer: document.querySelector("#mockTimer"),
  mockAnswered: document.querySelector("#mockAnswered"),
  finishMockButton: document.querySelector("#finishMockButton"),
  mockResultPanel: document.querySelector("#mockResultPanel"),
  mockResultTitle: document.querySelector("#mockResultTitle"),
  mockResultScore: document.querySelector("#mockResultScore"),
  mockLoveNote: document.querySelector("#mockLoveNote"),
  mockDiagnosis: document.querySelector("#mockDiagnosis"),
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

function writeStorage(key, value, syncCloud = true) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Local storage write failed", error);
  }
  if (STUDY_STORAGE_KEYS.includes(key)) {
    durableValues[key] = value;
    scheduleDurableSnapshot();
    if (syncCloud) window.studyCloud?.scheduleSnapshot();
  }
}

function removeStorage(key, syncCloud = true) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn("Local storage removal failed", error);
  }
  if (STUDY_STORAGE_KEYS.includes(key)) {
    delete durableValues[key];
    scheduleDurableSnapshot();
    if (syncCloud) window.studyCloud?.scheduleSnapshot();
  }
}

function openDurableDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DURABLE_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DURABLE_STORE_NAME, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDurableSnapshot() {
  try {
    const database = await openDurableDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(DURABLE_STORE_NAME, "readwrite");
      transaction.objectStore(DURABLE_STORE_NAME).put({ id: "study", savedAt: Date.now(), values: durableValues });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch (error) {
    console.warn("Durable storage write failed", error);
  }
}

function scheduleDurableSnapshot() {
  if (!window.indexedDB) return;
  clearTimeout(durableSaveTimer);
  durableSaveTimer = setTimeout(saveDurableSnapshot, 50);
}

async function restoreDurableStorage() {
  try {
    const database = await openDurableDatabase();
    const snapshot = await new Promise((resolve, reject) => {
      const request = database.transaction(DURABLE_STORE_NAME).objectStore(DURABLE_STORE_NAME).get("study");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    for (const key of STUDY_STORAGE_KEYS) {
      const localValue = readStorage(key, undefined);
      const value = localValue ?? snapshot?.values?.[key];
      if (value === undefined) continue;
      durableValues[key] = value;
      if (localValue === undefined) localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    console.warn("Durable storage restore failed", error);
  }
}

function hydrateStudyState() {
  state.progress = readStorage(STORAGE_KEYS.progress, {});
  migrateNotebookCategories();
  state.history = readStorage(STORAGE_KEYS.history, []);
  state.reported = new Set(readStorage(STORAGE_KEYS.reported, []));
  state.mockResults = readStorage(STORAGE_KEYS.mockResults, []);
  state.dailyPlan = readStorage(STORAGE_KEYS.dailyPlan, null);
}

function readBankSnapshot(bank) {
  const keys = storageKeysForBank(bank);
  return {
    progress: readStorage(keys.progress, {}),
    history: readStorage(keys.history, []),
    reported: readStorage(keys.reported, []),
    mockResults: readStorage(keys.mockResults, []),
    activeMock: readStorage(keys.activeMock, null),
    dailyPlan: readStorage(keys.dailyPlan, null)
  };
}

function writeBankSnapshot(bank, snapshot) {
  const keys = storageKeysForBank(bank);
  writeStorage(keys.progress, snapshot?.progress || {}, false);
  writeStorage(keys.history, Array.isArray(snapshot?.history) ? snapshot.history : [], false);
  writeStorage(keys.reported, Array.isArray(snapshot?.reported) ? snapshot.reported : [], false);
  writeStorage(keys.mockResults, Array.isArray(snapshot?.mockResults) ? snapshot.mockResults : [], false);
  if (snapshot?.activeMock) writeStorage(keys.activeMock, snapshot.activeMock, false);
  else removeStorage(keys.activeMock, false);
  if (snapshot?.dailyPlan) writeStorage(keys.dailyPlan, snapshot.dailyPlan, false);
  else removeStorage(keys.dailyPlan, false);
}

function requestPersistentStorage() {
  navigator.storage?.persist?.().catch((error) => console.warn("Persistent storage request failed", error));
}

function initializeAnalytics() {
  const measurementId = String(config.analyticsMeasurementId || "").trim();
  if (!/^G-[A-Z0-9]+$/i.test(measurementId)) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", measurementId);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(script);
}

function trackEvent(name, parameters = {}) {
  window.gtag?.("event", name, parameters);
  window.studyCloud?.trackEvent(name, parameters);
}

function createCloudSnapshot(updatedAt = Date.now()) {
  return {
    version: 4,
    updatedAt,
    banks: Object.fromEntries(Object.keys(BANKS).map((bank) => [bank, readBankSnapshot(bank)]))
  };
}

function applyCloudSnapshot(snapshot) {
  if (!snapshot) return;
  const banks = snapshot.version === 4 && snapshot.banks
    ? snapshot.banks
    : snapshot.version === 3 && snapshot.progress && !Array.isArray(snapshot.progress)
      ? { "jp-business-law": snapshot }
      : null;
  if (!banks) return;
  clearInterval(state.mockTimer);
  for (const [bank, bankSnapshot] of Object.entries(banks)) {
    if (BANKS[bank]) writeBankSnapshot(bank, bankSnapshot);
  }
  hydrateStudyState();
  state.mock = null;
  if (state.questions.length) {
    elements.progressDialog.open && elements.progressDialog.close();
    if (!restoreActiveMock()) buildDeck();
  }
}

function cloudPresence() {
  return {
    bank: state.bank,
    mode: state.mode,
    questionId: currentQuestion()?.id || null
  };
}

function parseList(value, separator = ",") {
  return String(value || "")
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSelection(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(values.map(Number).filter(Number.isInteger))].sort((left, right) => left - right);
}

function selectionsEqual(left, right) {
  const a = normalizeSelection(left);
  const b = normalizeSelection(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function questionAccepts(question, selected) {
  if (question.allCredit) return true;
  return question.answerSets.some((answerSet) => selectionsEqual(answerSet, selected));
}

function answerLabel(question) {
  if (question.allCredit) return state.bank === "tw-bar-first" ? "一律給分" : "全員正解";
  return question.answerSets.map((answerSet) => answerSet.join("＋")).join("／");
}

function isMultipleQuestion(question) {
  return question.answerSets.some((answerSet) => answerSet.length > 1);
}

function normalizeQuestion(row) {
  const answer = parseList(row.answer).map(Number).filter(Number.isInteger);
  const allCredit = String(row.answer_sets || "").trim() === "*";
  const answerSets = allCredit
    ? []
    : String(row.answer_sets || "").trim()
      ? parseList(row.answer_sets, "|").map((set) => parseList(set, "+").map(Number).filter(Number.isInteger)).filter((set) => set.length)
      : answer.map((choice) => [choice]);
  return {
    id: row.id?.trim(),
    chapter: row.chapter?.trim(),
    title: row.title?.trim() || "",
    question: row.question?.trim(),
    options: String(row.options || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    answer,
    answerSets,
    allCredit,
    explanation: row.explanation?.trim() || "",
    lawRefs: parseList(row.law_refs),
    lawUrls: String(row.law_urls || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    tags: parseList(row.tags),
    confidence: row.confidence?.trim() || "mid",
    status: row.status?.trim() || "ok",
    lawAsOf: row.law_as_of?.trim() || "unknown",
    sourceTier: row.source_tier?.trim() || "supplemental-secondary",
    questionTextSource: row.question_text_source?.trim() || "unknown",
    answerSource: row.answer_source?.trim() || "unknown",
    explanationSource: row.explanation_source?.trim() || "unknown",
    explanationUrl: row.explanation_url?.trim() || "",
    lawReferenceSource: row.law_reference_source?.trim() || "none",
    reviewStatus: row.review_status?.trim() || "not-individually-reviewed",
    reviewedAt: row.reviewed_at?.trim() || "",
    reviewResult: row.review_result?.trim() || "",
    sourceUrl: row.source_url?.trim() || "",
    answerUrl: row.answer_url?.trim() || ""
  };
}

function normalizeAiMockData(data) {
  if (!Array.isArray(data?.exams)) return [];
  return data.exams.map((exam) => ({
    id: String(exam.id || "").trim(),
    title: String(exam.title || "").trim(),
    description: String(exam.description || "").trim(),
    seed: String(exam.seed || exam.id || "ai-mock"),
    questions: Array.isArray(exam.questions) ? exam.questions.map((question) => ({
      id: String(question.id || "").trim(),
      chapter: String(question.chapter || "").trim(),
      title: String(question.title || "AI予想問題").trim(),
      question: String(question.question || "").trim(),
      options: Array.isArray(question.options) ? question.options.map((option) => String(option).trim()).filter(Boolean) : [],
      answer: Array.isArray(question.answer) ? question.answer.map(Number).filter(Number.isInteger) : [],
      answerSets: Array.isArray(question.answer) ? question.answer.map(Number).filter(Number.isInteger).map((choice) => [choice]) : [],
      allCredit: false,
      explanation: String(question.explanation || "").trim(),
      lawRefs: Array.isArray(question.lawRefs) ? question.lawRefs.map(String) : [],
      lawUrls: [],
      tags: ["AI予想", ...(Array.isArray(question.tags) ? question.tags.map(String) : [])],
      confidence: "high",
      status: "ok",
      lawAsOf: "2025-12-01（成立法基準）",
      sourceTier: "ai-original-primary",
      sourceUrl: String(question.sourceUrl || "").trim(),
      answerUrl: ""
    })).filter((question) => question.id && question.chapter && question.question && question.options.length >= 2 && question.answer.length) : []
  })).filter((exam) => exam.id && exam.title && exam.questions.length);
}

function currentBankConfig() {
  return BANKS[state.bank] || {
    label: "日本ビジネス法務",
    language: "ja",
    questionsCsvUrl: config.questionsCsvUrl,
    chaptersCsvUrl: config.chaptersCsvUrl,
    aiMocksUrl: config.aiMocksUrl,
    useLocalCsvCache: true
  };
}

async function fetchCsv(url, cacheName, useLocalCache = true) {
  const refresh = new URLSearchParams(location.search).get("refresh") === "1";
  const cache = readStorage(STORAGE_KEYS.csvCache, {});
  const cached = useLocalCache ? cache[cacheName] : null;
  const maxAge = Number(config.cacheHours || 24) * 60 * 60 * 1000;

  if (!refresh && cached && Date.now() - cached.savedAt < maxAge) {
    return cached.text;
  }

  try {
    const response = await fetch(url, { cache: refresh ? "reload" : "default" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (useLocalCache) {
      cache[cacheName] = { text, savedAt: Date.now() };
      writeStorage(STORAGE_KEYS.csvCache, cache);
    }
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

let loadSequence = 0;
let appEventsBound = false;

async function loadData() {
  const sequence = ++loadSequence;
  const bank = state.bank;
  const bankConfig = currentBankConfig();
  elements.statusPanel.hidden = false;
  elements.studyPanel.hidden = true;
  elements.emptyPanel.hidden = true;
  updateBankUi();
  try {
    const [questionsText, chaptersText, aiMocksResponse] = await Promise.all([
      fetchCsv(bankConfig.questionsCsvUrl, `${bank}-questions`, bankConfig.useLocalCsvCache !== false),
      fetchCsv(bankConfig.chaptersCsvUrl, `${bank}-chapters`, bankConfig.useLocalCsvCache !== false),
      bankConfig.aiMocksUrl ? fetch(bankConfig.aiMocksUrl).then((response) => {
        if (!response.ok) throw new Error(`AI mock HTTP ${response.status}`);
        return response.json();
      }) : Promise.resolve({ exams: [] })
    ]);
    if (sequence !== loadSequence || bank !== state.bank) return;

    state.questions = parseCsv(questionsText)
      .map(normalizeQuestion)
      .filter((question) => question.id && question.chapter && question.question && question.options.length >= 2 && (question.answer.length || question.allCredit));

    state.chapters = new Map(parseCsv(chaptersText).map((row) => [row.chapter?.trim(), row.name?.trim()]));
    state.aiMockExams = normalizeAiMockData(aiMocksResponse);
    migrateLegacyHistory();
    renderLoveNotes();
    populateChapters();
    if (!appEventsBound) {
      bindEvents();
      registerServiceWorker();
      appEventsBound = true;
    }
    if (!restoreActiveMock()) buildDeck();
  } catch (error) {
    if (sequence !== loadSequence) return;
    console.error(error);
    elements.statusPanel.innerHTML = `<span>${state.bank === "tw-bar-first" ? "題庫載入失敗，請重新整理。" : "読み込みに失敗しました。もう一度お試しください。"}</span>`;
  }
}

function updateBankUi() {
  const taiwan = state.bank === "tw-bar-first";
  const bankConfig = currentBankConfig();
  document.documentElement.lang = taiwan ? "zh-Hant" : "ja";
  document.title = taiwan ? "台灣司法官／律師第一試題庫" : "ビジネス実務法務検定 2級";
  elements.siteTitle.replaceChildren(document.createTextNode(taiwan ? "台灣司法官／律師 " : "ビジネス実務法務検定 "), Object.assign(document.createElement("span"), { textContent: taiwan ? "第一試" : "2級" }));
  elements.bankSwitch.setAttribute("aria-label", taiwan ? "選擇題庫" : "題庫を選ぶ");
  elements.bankSwitch.querySelectorAll("[data-bank]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.bank === state.bank);
    button.setAttribute("aria-pressed", String(button.dataset.bank === state.bank));
  });
  elements.chapterPriorityNote.hidden = taiwan;
  elements.openAiMockButton.hidden = !bankConfig.aiMocksUrl;
  elements.sourceLink.textContent = taiwan ? "查看官方試題" : "出題を確認";
  elements.answerSourceLink.textContent = taiwan ? "查看官方答案" : "公式答案を確認";
  elements.explanationSourceLink.textContent = taiwan ? "查看第三方完整解析" : "外部解説を確認";
  document.querySelector("#chapterSelectLabel").textContent = taiwan ? "選擇科目" : "章を選ぶ";
  document.querySelector('[data-mode="today"]').textContent = taiwan ? "今日" : "今日";
  document.querySelector('[data-mode="random"]').textContent = taiwan ? "隨機" : "ランダム";
  document.querySelector('[data-mode="all"]').textContent = taiwan ? "全部" : "すべて";
  document.querySelector('[data-mode="due"]').textContent = taiwan ? "只看複習" : "復習のみ";
  elements.openMockButton.textContent = taiwan ? "40 題練習模考" : "模擬試験";
  elements.showAnswerButton.textContent = taiwan ? "作答" : "回答する";
  elements.studyToolbar.setAttribute("aria-label", taiwan ? "出題條件" : "出題条件");
  document.querySelector("#todaySummaryLabel").textContent = taiwan ? "今日學習" : "今日の学習";
  document.querySelector("#todayNewLabel").childNodes[0].nodeValue = taiwan ? "新題 " : "新規 ";
  document.querySelector("#todayDueLabel").childNodes[0].nodeValue = taiwan ? "複習 " : "復習 ";
  document.querySelector("#todayWeakLabel").childNodes[0].nodeValue = taiwan ? "弱項 " : "苦手 ";
  document.querySelector("#answerPanelLabel").textContent = taiwan ? "官方答案" : "解説";
  document.querySelector("#lawSectionLabel").textContent = taiwan ? "相關法源／法規入口" : "根拠条文";
  elements.reportButton.textContent = taiwan ? "回報本題" : "この問題を報告";
  elements.progressButton.setAttribute("aria-label", taiwan ? "顯示學習進度" : "進捗を表示");
  elements.progressButton.lastElementChild.textContent = taiwan ? "已作答" : "回答済み";
  elements.showAllButton.textContent = taiwan ? "查看全部題目" : "すべての問題を見る";
  document.querySelector("#progressDialogTitle").textContent = taiwan ? "學習進度" : "進捗";
  elements.exportButton.textContent = taiwan ? "匯出備份" : "データを書き出す";
  document.querySelector(".import-label").childNodes[0].nodeValue = taiwan ? "匯入備份" : "データを読み込む";
  document.querySelector("#backupNote").textContent = taiwan
    ? "兩套題庫的紀錄會一起備份；各題庫進度彼此獨立。"
    : "記録はこの端末に二重保存されます。別ブラウザや機種変更には引き継がれないため、定期的に書き出してください。";
  elements.resetButton.textContent = taiwan ? "重設此題庫紀錄" : "学習記録をリセット";
  document.querySelector("#mockDialogTitle").textContent = taiwan ? "40 題練習模考" : "模擬試験";
  document.querySelector("#mockDialogDescription").textContent = taiwan
    ? "從本題庫隨機抽 40 題，作答時間 90 分鐘，70 分作為練習通過線。這是練習模考，不等同正式一試的 300 題配置。"
    : "このアプリでは40問を90分で解答し、70点以上を練習上の合格と判定します。過去9回から精選された分野別問題数を参考に章別配分を調整し、事例・組合せ型を優先します。配分は練習用です。";
  elements.startMockButton.textContent = taiwan ? "開始練習模考" : "模擬試験を開始";
  elements.ratingBar.setAttribute("aria-label", taiwan ? "自我評估" : "自己評価");
  const notebookTexts = taiwan ? ["不會", "不確定", "會"] : ["わからない", "あいまい", "わかる"];
  document.querySelectorAll(".notebook-button").forEach((button, index) => { button.children[1].textContent = notebookTexts[index]; });
  elements.ratingBar.querySelectorAll("button").forEach((button, index) => {
    button.replaceChildren(Object.assign(document.createElement("span"), { textContent: String(index + 1) }), document.createTextNode(notebookTexts[index]));
  });
}

async function switchBank(bank) {
  if (!BANKS[bank] || bank === state.bank) return;
  if (state.mode === "mock" && !state.mock?.submitted) {
    showToast(state.bank === "tw-bar-first" ? "請先完成目前的模考" : "模擬試験を終了してください");
    return;
  }
  clearInterval(state.mockTimer);
  state.bank = bank;
  localStorage.setItem(BANK_KEY, bank);
  STORAGE_KEYS = storageKeysForBank(bank);
  hydrateStudyState();
  state.mock = null;
  state.mode = "today";
  state.chapter = "all";
  state.selectedAnswer = [];
  state.flipped = false;
  elements.mockResultPanel.hidden = true;
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === "today"));
  await loadData();
}

function populateChapters() {
  const availableChapters = new Set(state.questions.map((question) => question.chapter));
  elements.chapterSelect.replaceChildren(new Option(state.bank === "tw-bar-first" ? "全部科目" : "すべて", "all"));
  for (const [id, name] of state.chapters) {
    if (availableChapters.has(id)) elements.chapterSelect.add(new Option(formatChapterName(id, name), id));
  }
}

function formatChapterName(chapter, name) {
  if (state.bank === "tw-bar-first") return name;
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

function migrateNotebookCategories() {
  let changed = false;
  for (const progress of Object.values(state.progress)) {
    if (!progress?.answeredAt || NOTEBOOK_LABELS[progress.notebook]) continue;
    progress.notebook = progress.quality >= 5 ? "known" : progress.quality >= 3 ? "uncertain" : "unknown";
    changed = true;
  }
  if (changed) writeStorage(STORAGE_KEYS.progress, state.progress, false);
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

function updateNotebookCounts() {
  document.querySelectorAll("[data-notebook-count]").forEach((element) => {
    element.textContent = state.questions.filter((question) => state.progress[question.id]?.notebook === element.dataset.notebookCount).length;
  });
}

function buildDeck() {
  let deck = state.questions.filter((question) => state.chapter === "all" || question.chapter === state.chapter);
  if (DIRECT_QUESTION_ID) {
    const directQuestion = state.questions.find((question) => question.id === DIRECT_QUESTION_ID);
    if (directQuestion) {
      state.deck = [directQuestion];
      state.index = 0;
      state.flipped = false;
      state.selectedAnswer = [];
      render();
      return;
    }
  }
  const now = Date.now();

  if (state.mode === "today") {
    const parts = todayParts(deck);
    deck = [...parts.due, ...parts.weak, ...parts.fresh];
  } else if (state.mode === "due") {
    deck = deck.filter((question) => state.progress[question.id]?.due <= now);
  } else if (state.mode === "weak") {
    deck = deck.filter((question) => state.progress[question.id]?.weak);
  } else if (NOTEBOOK_MODES[state.mode]) {
    deck = deck.filter((question) => state.progress[question.id]?.notebook === NOTEBOOK_MODES[state.mode]);
  } else if (state.mode === "random") {
    deck = shuffle(deck);
  }

  state.deck = deck;
  state.index = 0;
  state.flipped = false;
  state.selectedAnswer = [];
  render();
}

function currentQuestion() {
  return state.deck[state.index];
}

function render() {
  elements.statusPanel.hidden = true;
  updateProgressSummary();
  updateTodaySummary();
  updateNotebookCounts();

  if (!state.deck.length) {
    elements.studyPanel.hidden = true;
    elements.ratingBar.hidden = true;
    elements.emptyPanel.hidden = false;
    elements.emptyMessage.textContent = state.bank === "tw-bar-first"
      ? (state.mode === "today" ? "今天的學習已完成" : state.mode === "due" ? "今天沒有待複習題目" : "目前沒有題目")
      : (state.mode === "today" ? "今日の学習は完了しました" : state.mode === "due" ? "今日の復習は完了しました" : "まだ問題がありません");
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
  state.pendingAttempt = null;
  state.flipped = mockReview;
  state.selectedAnswer = mockActive || mockReview ? normalizeSelection(state.mock?.answers[question.id]) : [];
  elements.questionId.textContent = question.id;
  elements.questionTitle.textContent = question.title;
  elements.questionTitle.hidden = !question.title;
  elements.questionText.textContent = question.question;
  elements.cardPosition.textContent = `${state.index + 1} / ${state.deck.length}`;
  elements.chapterName.textContent = state.chapters.get(question.chapter) || question.chapter;
  elements.answerPanel.hidden = !mockReview;
  elements.flipHint.hidden = mockReview;
  const multiple = isMultipleQuestion(question);
  const selectionPrompt = state.bank === "tw-bar-first"
    ? (multiple ? "本題可複選；選完後按作答" : "請選擇答案")
    : "選択肢を選んでください";
  elements.flipHint.textContent = mockActive
    ? (state.bank === "tw-bar-first" && multiple ? "本題可複選；選完後按下一題" : "選択すると回答が保存されます")
    : selectionPrompt;
  elements.showAnswerButton.hidden = mockReview;
  elements.showAnswerButton.textContent = state.bank === "tw-bar-first"
    ? (mockActive ? "下一題" : "作答")
    : (mockActive ? "次の問題" : "回答する");
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
    const acceptedChoices = new Set(question.answerSets.flat());
    item.classList.toggle("is-selected", mockActive && state.selectedAnswer.includes(answer));
    item.classList.toggle("is-answer", mockReview && acceptedChoices.has(answer));
    item.classList.toggle("is-wrong", mockReview && state.selectedAnswer.includes(answer) && !acceptedChoices.has(answer));
    item.append(button);
    return item;
  }));

  elements.answerText.textContent = "";
  elements.answerText.classList.remove("is-wrong");
  const hasTaiwanExplanation = state.bank === "tw-bar-first" && question.explanationSource !== "official-answer-only";
  document.querySelector("#answerPanelLabel").textContent = state.bank === "tw-bar-first"
    ? (hasTaiwanExplanation ? "官方答案與解析" : "官方答案")
    : "解説";
  elements.explanationText.hidden = state.bank === "tw-bar-first" && !hasTaiwanExplanation;
  elements.explanationText.textContent = question.explanation || (state.bank === "tw-bar-first" ? "" : "解説は登録されていません。");
  renderLaws(question.lawRefs, question.lawUrls);
  elements.lawAsOf.textContent = state.bank === "tw-bar-first"
    ? (question.lawAsOf.startsWith("ROC-") ? `作答基準：民國 ${question.lawAsOf.slice(4)} 年度` : "作答年度：未確認")
    : (question.lawAsOf === "unknown" ? "法令基準日：未確認" : `法令基準日：${question.lawAsOf}`);
  elements.sourceTier.textContent = SOURCE_TIER_LABELS[question.sourceTier] || question.sourceTier;
  renderProvenance(question);
  elements.sourceLink.hidden = !question.sourceUrl;
  elements.sourceLink.href = question.sourceUrl || "#";
  elements.answerSourceLink.hidden = !question.answerUrl;
  elements.answerSourceLink.href = question.answerUrl || "#";
  elements.explanationSourceLink.hidden = !question.explanationUrl;
  elements.explanationSourceLink.href = question.explanationUrl || "#";
  elements.reportButton.textContent = state.reported.has(question.id)
    ? (state.bank === "tw-bar-first" ? "已回報" : "報告用情報を共有済み")
    : (state.bank === "tw-bar-first" ? "回報本題" : "この問題を報告");
  elements.previousButton.disabled = state.deck.length < 2;
  elements.nextButton.disabled = state.deck.length < 2;
  elements.mockStatus.hidden = !mockActive;
  if (mockActive) updateMockStatus();
  if (mockReview) {
    const isCorrect = questionAccepts(question, state.selectedAnswer);
    elements.answerText.textContent = state.bank === "tw-bar-first"
      ? (isCorrect ? `答對：${answerLabel(question)}` : `答錯。正確答案：${answerLabel(question)}`)
      : (isCorrect ? `正解です：${answerLabel(question)}` : `不正解。正解：${answerLabel(question)}`);
    elements.answerText.classList.toggle("is-wrong", !isCorrect);
  }
  elements.questionCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderLaws(lawRefs, lawUrls = []) {
  elements.lawSection.hidden = lawRefs.length === 0;
  elements.lawLinks.replaceChildren(...lawRefs.map((lawRef, index) => {
    const link = document.createElement("a");
    const lawName = lawRef.replace(/\s*第\d+条.*$/, "").trim();
    const lawId = E_GOV_LAW_IDS[lawName];
    link.textContent = lawRef;
    link.href = lawUrls[index] || (lawId ? `https://laws.e-gov.go.jp/law/${lawId}` : "https://laws.e-gov.go.jp/");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }));
}

function renderProvenance(question) {
  const taiwan = state.bank === "tw-bar-first";
  elements.provenanceDisclosure.hidden = !taiwan;
  elements.provenanceDisclosure.open = false;
  if (!taiwan) {
    elements.provenanceDetails.replaceChildren();
    return;
  }
  const questionSource = question.questionTextSource === "moex-official-pdf"
    ? "考選部官方試題 PDF 抽取"
    : "LawPlayer 公開題庫頁面結構化轉錄；可由下方考選部官方 PDF 對照";
  const explanationSource = question.explanationSource === "reviewed-sources"
    ? `本站 AI 專門 agent 於 ${question.reviewedAt} 回讀考選部題目，並依上列法源逐題核對；不是考選部官方解析或人類律師署名內容`
    : question.explanationSource === "third-party-detailed-pdf"
      ? "第三方「114年律師高考一試詳解」PDF；含法條、破題思路與逐選項分析，非考選部官方解析，本站未逐題複核全文"
      : question.explanationSource === "ai-generated"
        ? "本站使用 gpt-5.6-luna 依題目、考選部官方答案與來源 packet 產生；未經律師逐題審核，請依不確定性說明判讀"
      : question.explanationSource === "official-answer-only"
        ? "目前沒有逐題法理解析；本站只顯示考選部官方答案"
        : "來源未標記";
  const lawSourceLabels = {
    "reviewed-sources": "本站 AI（Codex）逐題核對後列出的法源",
    "question-keyword-match": "依題目文字關鍵字自動配對；不代表已確認為答案依據",
    "subject-question-range-guess": "系統依考科與題號範圍推測；未逐題確認，信心低，只提供可能相關的法規入口",
    "public-page-related-articles": "LawPlayer 頁面附帶的相關條文；本站未逐題查核",
    "ai-source-packet": "AI 僅能引用題目 packet 既有來源；連結由 validator 白名單帶入，未經律師逐題審核",
    none: "未提供"
  };
  const rows = [
    ["題目文字", questionSource],
    ["正確答案", "考選部官方答案 PDF；本站判分唯一依據"],
    ["解析狀態", explanationSource],
    ["法規連結", lawSourceLabels[question.lawReferenceSource] || "來源未標記"]
  ];
  if (question.reviewResult) rows.push(["抽查結果", question.reviewResult]);
  elements.provenanceDetails.replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement("p");
    const heading = document.createElement("strong");
    heading.textContent = `${label}：`;
    row.append(heading, document.createTextNode(value));
    return row;
  }));
}

function selectOption(answer) {
  if (state.flipped || !currentQuestion()) return;
  if (answer < 1 || answer > currentQuestion().options.length) return;
  const question = currentQuestion();
  if (isMultipleQuestion(question)) {
    state.selectedAnswer = state.selectedAnswer.includes(answer)
      ? state.selectedAnswer.filter((choice) => choice !== answer)
      : normalizeSelection([...state.selectedAnswer, answer]);
  } else {
    state.selectedAnswer = [answer];
  }
  if (state.mode === "mock") {
    if (state.selectedAnswer.length) state.mock.answers[question.id] = [...state.selectedAnswer];
    else delete state.mock.answers[question.id];
    persistActiveMock();
    updateMockStatus();
  }
  [...elements.optionsList.children].forEach((item, index) => item.classList.toggle("is-selected", state.selectedAnswer.includes(index + 1)));
  elements.showAnswerButton.disabled = state.selectedAnswer.length === 0;
  elements.flipHint.textContent = state.bank === "tw-bar-first"
    ? `已選：${state.selectedAnswer.join("、")}${isMultipleQuestion(question) ? "（可複選）" : ""}`
    : `選択肢 ${state.selectedAnswer.join("、")} を選択中`;
}

function submitAnswer() {
  if (state.flipped || !currentQuestion()) return;
  if (state.mode === "mock") {
    moveCard(1);
    return;
  }
  if (state.selectedAnswer.length === 0) {
    showToast(state.bank === "tw-bar-first" ? "請選擇答案" : "選択肢を選んでください");
    return;
  }
  state.flipped = true;
  const question = currentQuestion();
  [...elements.optionsList.children].forEach((item, index) => {
    const answer = index + 1;
    item.classList.remove("is-selected");
    const acceptedChoices = new Set(question.answerSets.flat());
    item.classList.toggle("is-answer", acceptedChoices.has(answer));
    item.classList.toggle("is-wrong", state.selectedAnswer.includes(answer) && !acceptedChoices.has(answer));
    item.querySelector("button").disabled = true;
  });
  const isCorrect = questionAccepts(question, state.selectedAnswer);
  state.pendingAttempt = {
    questionId: question.id,
    previous: state.progress[question.id] ? { ...state.progress[question.id] } : null,
    historyIndex: state.history.length
  };
  recordAttempt(question, isCorrect, isCorrect ? 3 : 2, state.mode);
  updateProgressSummary();
  updateTodaySummary();
  trackEvent("answer_submitted", { questionId: question.id, correct: isCorrect, mode: state.mode, chapter: question.chapter });
  elements.answerText.textContent = state.bank === "tw-bar-first"
    ? (isCorrect ? `答對：${answerLabel(question)}` : `答錯。正確答案：${answerLabel(question)}`)
    : (isCorrect ? `正解です：${answerLabel(question)}` : `不正解。正解：${answerLabel(question)}`);
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

function rateCurrent(quality, notebook) {
  const question = currentQuestion();
  if (!question || !state.flipped) return;
  const isCorrect = questionAccepts(question, state.selectedAnswer);
  const replacement = state.pendingAttempt?.questionId === question.id ? state.pendingAttempt : null;
  recordAttempt(question, isCorrect, isCorrect ? quality : 2, state.mode, replacement, notebook);
  state.pendingAttempt = null;
  updateProgressSummary();
  updateTodaySummary();
  updateNotebookCounts();
  const correctCount = state.history.filter((item) => item.correct).length;
  if (isCorrect && correctCount % 10 === 0) showToast(`正解${correctCount}問。${encouragementForToday()}`, 3600);
  else showToast(state.bank === "tw-bar-first"
    ? `已存到「${{ unknown: "不會", uncertain: "不確定", known: "會" }[notebook]}」`
    : `「${NOTEBOOK_LABELS[notebook]}」ノートに保存しました`);

  if (state.mode === "today" || state.mode === "due" || state.mode === "weak" || NOTEBOOK_MODES[state.mode]) {
    state.deck.splice(state.index, 1);
    if (state.index >= state.deck.length) state.index = 0;
    render();
  } else {
    moveCard(1);
  }
}

function recordAttempt(question, isCorrect, reviewQuality, mode, replacement = null, notebook = null) {
  const emptyProgress = { repetitions: 0, interval: 0, ease: 2.5 };
  const previous = replacement ? (replacement.previous || emptyProgress) : (state.progress[question.id] || emptyProgress);
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
  const priorHistory = replacement ? state.history.slice(0, replacement.historyIndex) : state.history;
  const recentForQuestion = priorHistory.filter((item) => item.id === question.id).slice(-1);
  const consecutiveCorrect = isCorrect && recentForQuestion[0]?.correct ? 2 : Number(isCorrect);
  state.progress[question.id] = {
    repetitions,
    interval,
    ease: Number(ease.toFixed(2)),
    due: Date.now() + interval * DAY_MS,
    answeredAt: Date.now(),
    quality: reviewQuality,
    notebook: notebook || previous.notebook || null,
    correct: isCorrect,
    weak: !isCorrect || reviewQuality < 3 || Boolean(previous.weak && consecutiveCorrect < 2),
    attempts,
    correctCount
  };
  const historyEntry = { id: question.id, at: Date.now(), correct: isCorrect, quality: reviewQuality, notebook: notebook || previous.notebook || null, mode };
  if (replacement) state.history[replacement.historyIndex] = historyEntry;
  else state.history.push(historyEntry);
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
    elements.reportButton.textContent = state.bank === "tw-bar-first" ? "已回報" : "報告用情報を共有済み";
    showToast(state.bank === "tw-bar-first" ? (navigator.share ? "已分享" : "題目資訊已複製") : (navigator.share ? "共有しました" : "問題情報をコピーしました"));
  } catch (error) {
    if (error.name !== "AbortError") showToast(state.bank === "tw-bar-first" ? "分享失敗" : "共有に失敗しました");
  }
}

function updateProgressSummary() {
  const answered = state.questions.filter((question) => state.progress[question.id]?.answeredAt).length;
  elements.progressCount.textContent = `${answered} / ${state.questions.length}`;
}

function openProgress() {
  const answered = state.questions.filter((question) => state.progress[question.id]);
  const due = answered.filter((question) => state.progress[question.id].due <= Date.now()).length;
  const correct = state.history.filter((item) => item.correct).length;
  const accuracy = state.history.length ? Math.round(correct / state.history.length * 100) : 0;
  const labels = state.bank === "tw-bar-first"
    ? ["已作答", "累計正確率", "今日複習", "不會", "不確定", "會"]
    : ["回答済み", "累積正答率", "今日の復習", "わからない", "あいまい", "わかる"];
  const stats = [
    [answered.length, labels[0]],
    [`${accuracy}%`, labels[1]],
    [due, labels[2]],
    [answered.filter((question) => state.progress[question.id].notebook === "unknown").length, labels[3]],
    [answered.filter((question) => state.progress[question.id].notebook === "uncertain").length, labels[4]],
    [answered.filter((question) => state.progress[question.id].notebook === "known").length, labels[5]]
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
    const answered = questions.filter((question) => state.progress[question.id]?.answeredAt).length;
    rows.push({ chapter, name, accuracy, answered, total: questions.length });
  }
  const heading = document.createElement("h3");
  heading.textContent = state.bank === "tw-bar-first" ? "科目進度" : "章別の到達度";
  const header = document.createElement("div");
  header.className = "chapter-progress-header";
  header.replaceChildren(
    Object.assign(document.createElement("span"), { textContent: state.bank === "tw-bar-first" ? "科目" : "章" }),
    Object.assign(document.createElement("span"), { textContent: state.bank === "tw-bar-first" ? "正確率" : "正答率" }),
    Object.assign(document.createElement("span"), { textContent: state.bank === "tw-bar-first" ? "已作答" : "回答済み" })
  );
  elements.chapterProgress.replaceChildren(heading, header, ...rows.map((row) => {
    const item = document.createElement("div");
    const priority = CHAPTER_PRIORITIES[row.chapter];
    item.className = `chapter-progress-row${priority ? ` is-${priority.level}` : ""}`;
    item.replaceChildren(
      Object.assign(document.createElement("span"), { textContent: formatChapterName(row.chapter, row.name) }),
      Object.assign(document.createElement("span"), { textContent: `${row.accuracy}%` }),
      Object.assign(document.createElement("span"), { textContent: `${row.answered}/${row.total}` })
    );
    return item;
  }));
}

function renderMockHistory() {
  const heading = document.createElement("h3");
  heading.textContent = state.bank === "tw-bar-first" ? "練習模考" : "模擬試験";
  const results = state.mockResults.slice(-3).reverse();
  elements.mockHistory.replaceChildren(heading, ...results.map((result) => {
    const item = document.createElement("p");
    const label = result.kind === "ai" ? (result.title || "AI予想模試") : (state.bank === "tw-bar-first" ? "練習模考" : "模擬試験");
    item.textContent = state.bank === "tw-bar-first"
      ? `${new Date(result.at).toLocaleDateString("zh-TW")}　${label}　${result.score} 分　${result.score >= MOCK_PASS_SCORE ? "通過練習線" : "需要複習"}`
      : `${new Date(result.at).toLocaleDateString("ja-JP")}　${label}　${result.score}点　${result.score >= MOCK_PASS_SCORE ? "合格圏" : "要復習"}`;
    return item;
  }));
}

function exportData() {
  const blob = new Blob([JSON.stringify({
    version: 3,
    exportedAt: new Date().toISOString(),
    banks: Object.fromEntries(Object.keys(BANKS).map((bank) => [bank, readBankSnapshot(bank)]))
  }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bijihou2-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importData(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const banks = data.version === 3 && data.banks
      ? data.banks
      : [1, 2].includes(data.version) && data.progress && !Array.isArray(data.progress)
        ? { "jp-business-law": data }
        : null;
    if (!banks) throw new Error("Invalid backup");
    if (!window.confirm(state.bank === "tw-bar-first" ? "要用備份資料取代目前的學習紀錄嗎？" : "現在の進捗を読み込んだデータで置き換えますか？")) return;
    for (const [bank, snapshot] of Object.entries(banks)) {
      if (BANKS[bank]) writeBankSnapshot(bank, snapshot);
    }
    hydrateStudyState();
    migrateLegacyHistory();
    elements.progressDialog.close();
    buildDeck();
    showToast(state.bank === "tw-bar-first" ? "備份已匯入" : "データを読み込みました");
  } catch {
    showToast(state.bank === "tw-bar-first" ? "匯入失敗" : "読み込みに失敗しました");
  } finally {
    elements.importInput.value = "";
  }
}

function resetData() {
  const bankLabel = currentBankConfig().label;
  const message = state.bank === "tw-bar-first"
    ? `只刪除「${bankLabel}」的學習紀錄。日本題庫不受影響。此操作無法復原，確定嗎？`
    : `「${bankLabel}」の学習記録だけを削除します。台湾題庫には影響しません。元に戻せません。よろしいですか？`;
  if (!window.confirm(message)) return;
  clearInterval(state.mockTimer);
  ["progress", "history", "reported", "mockResults", "activeMock", "dailyPlan"]
    .forEach((key) => removeStorage(STORAGE_KEYS[key]));
  state.progress = {};
  state.history = [];
  state.reported = new Set();
  state.mockResults = [];
  state.dailyPlan = null;
  state.mock = null;
  state.mode = "today";
  state.chapter = "all";
  elements.studyToolbar.hidden = false;
  elements.loveNotes.hidden = false;
  elements.chapterSelect.disabled = false;
  elements.chapterSelect.value = "all";
  elements.mockResultPanel.hidden = true;
  elements.progressDialog.close();
  buildDeck();
  showToast(state.bank === "tw-bar-first" ? "此題庫的學習紀錄已刪除" : "この題庫の学習記録を削除しました");
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

function questionMap() {
  const questions = [...state.questions, ...state.aiMockExams.flatMap((exam) => exam.questions)];
  return new Map(questions.map((question) => [question.id, question]));
}

function seededHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededOrder(questions, seed) {
  return [...questions].sort((left, right) => seededHash(`${seed}:${left.id}`) - seededHash(`${seed}:${right.id}`) || left.id.localeCompare(right.id));
}

function createAiMockQuestions(examId) {
  const exam = state.aiMockExams.find((item) => item.id === examId);
  if (!exam) return [];
  const groups = new Map();
  for (const question of state.questions) {
    if (!groups.has(question.chapter)) groups.set(question.chapter, []);
    groups.get(question.chapter).push(question);
  }
  const allocations = allocateMockCounts(groups, Math.min(MOCK_QUESTION_COUNT, state.questions.length));
  const selected = [...exam.questions];
  const aiCounts = new Map();
  for (const question of exam.questions) aiCounts.set(question.chapter, (aiCounts.get(question.chapter) || 0) + 1);
  for (const [chapter, target] of allocations) {
    const needed = Math.max(0, target - (aiCounts.get(chapter) || 0));
    selected.push(...seededOrder(groups.get(chapter) || [], `${exam.seed}:${chapter}`).slice(0, needed));
  }
  return seededOrder(selected, exam.seed).slice(0, MOCK_QUESTION_COUNT);
}

function renderAiMockChoices() {
  elements.aiMockList.replaceChildren(...state.aiMockExams.map((exam, index) => {
    const label = document.createElement("label");
    label.className = "ai-mock-option";
    const input = Object.assign(document.createElement("input"), {
      type: "radio",
      name: "aiMockExam",
      value: exam.id,
      checked: index === 0
    });
    const text = document.createElement("span");
    text.replaceChildren(
      Object.assign(document.createElement("strong"), { textContent: exam.title }),
      Object.assign(document.createElement("span"), { textContent: exam.description })
    );
    label.replaceChildren(input, text);
    return label;
  }));
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

function startMock({ kind = "standard", examId = null } = {}) {
  const exam = kind === "ai" ? state.aiMockExams.find((item) => item.id === examId) : null;
  const questions = exam ? createAiMockQuestions(examId) : createMockQuestions();
  if (questions.length !== MOCK_QUESTION_COUNT) {
    showToast("模試データを読み込めませんでした");
    return;
  }
  state.mock = {
    questionIds: questions.map((question) => question.id),
    answers: {},
    startedAt: Date.now(),
    durationMs: MOCK_DURATION_MS,
    kind,
    examId,
    title: exam?.title || "模擬試験",
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
  state.selectedAnswer = [];
  elements.mockDialog.close();
  if (elements.aiMockDialog.open) elements.aiMockDialog.close();
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
  const byId = questionMap();
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
  elements.mockTypeLabel.textContent = state.mock.kind === "ai" ? state.mock.title : "模擬試験";
  elements.mockAnswered.textContent = `${Object.keys(state.mock.answers).length} / ${state.mock.questionIds.length} 回答`;
}

function finishMock(autoSubmit = false) {
  if (!state.mock || state.mock.submitted) return;
  const unanswered = state.mock.questionIds.length - Object.keys(state.mock.answers).length;
  if (!autoSubmit && unanswered && !window.confirm(`未回答が${unanswered}問あります。採点しますか？`)) return;
  clearInterval(state.mockTimer);
  if (elements.progressDialog.open) elements.progressDialog.close();
  if (elements.mockDialog.open) elements.mockDialog.close();
  if (elements.aiMockDialog.open) elements.aiMockDialog.close();
  const byId = questionMap();
  const questions = state.mock.questionIds.map((id) => byId.get(id));
  let correct = 0;
  const chapters = {};
  for (const question of questions) {
    const selected = normalizeSelection(state.mock.answers[question.id]);
    const isCorrect = questionAccepts(question, selected);
    correct += Number(isCorrect);
    if (!chapters[question.chapter]) chapters[question.chapter] = { correct: 0, total: 0 };
    chapters[question.chapter].correct += Number(isCorrect);
    chapters[question.chapter].total += 1;
    recordAttempt(question, isCorrect, isCorrect ? 3 : 2, "mock");
  }
  const score = Math.round(correct / questions.length * 100);
  const result = {
    at: Date.now(),
    score,
    correct,
    total: questions.length,
    chapters,
    kind: state.mock.kind || "standard",
    examId: state.mock.examId || null,
    title: state.mock.title || "模擬試験"
  };
  state.mock.submitted = true;
  state.mock.result = result;
  state.mockResults.push(result);
  writeStorage(STORAGE_KEYS.mockResults, state.mockResults);
  removeStorage(STORAGE_KEYS.activeMock);
  trackEvent("mock_completed", { score, correct, mode: state.mock.kind === "ai" ? "ai_mock" : "mock", metadata: { total: questions.length, examId: state.mock.examId || null } });
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
  elements.mockResultTitle.textContent = result.kind === "ai" ? `${result.title} 診断` : (result.score >= MOCK_PASS_SCORE ? "合格圏です" : "復習が必要です");
  elements.mockResultScore.textContent = `${result.score}点`;
  elements.mockLoveNote.textContent = result.score >= MOCK_PASS_SCORE
    ? "合格圏、おめでとう。彼氏もきっと誇らしいよ ♥"
    : "点数より、ここまで続けた君がすごい。彼氏はずっと味方だよ。";
  const level = result.score >= 85 ? "合格安全圏" : result.score >= 70 ? "合格圏" : result.score >= 55 ? "合格まであと一歩" : "基礎固め優先";
  const weakChapters = Object.entries(result.chapters)
    .filter(([, value]) => value.correct < value.total)
    .sort((left, right) => left[1].correct / left[1].total - right[1].correct / right[1].total)
    .slice(0, 3)
    .map(([chapter]) => (state.chapters.get(chapter) || chapter).replace(/^第\d+章\s*/, ""));
  elements.mockDiagnosis.replaceChildren(
    Object.assign(document.createElement("strong"), { textContent: `現在地：${level}` }),
    Object.assign(document.createElement("span"), { textContent: weakChapters.length ? `優先復習：${weakChapters.join("・")}` : "全分野で正解しました。" })
  );
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
  const byId = questionMap();
  state.deck = state.mock.questionIds
    .map((id) => byId.get(id))
    .filter((question) => !questionAccepts(question, state.mock.answers[question.id]));
  state.mode = "mock-review";
  state.index = 0;
  elements.studyToolbar.hidden = false;
  elements.loveNotes.hidden = false;
  elements.chapterSelect.disabled = false;
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
  elements.bankSwitch.querySelectorAll("[data-bank]").forEach((button) => button.addEventListener("click", () => switchBank(button.dataset.bank)));
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
  elements.ratingBar.querySelectorAll("[data-quality]").forEach((button) => button.addEventListener("click", () => rateCurrent(Number(button.dataset.quality), button.dataset.notebook)));
  elements.progressButton.addEventListener("click", openProgress);
  elements.closeProgressButton.addEventListener("click", () => elements.progressDialog.close());
  elements.exportButton.addEventListener("click", exportData);
  elements.importInput.addEventListener("change", () => importData(elements.importInput.files[0]));
  elements.resetButton.addEventListener("click", resetData);
  elements.showAllButton.addEventListener("click", showAllQuestions);
  elements.openMockButton.addEventListener("click", () => {
    if (state.mode === "mock") showToast("模擬試験を実施中です");
    else elements.mockDialog.showModal();
  });
  elements.closeMockButton.addEventListener("click", () => elements.mockDialog.close());
  elements.startMockButton.addEventListener("click", () => startMock());
  elements.openAiMockButton.addEventListener("click", () => {
    if (state.mode === "mock") {
      showToast("模擬試験を実施中です");
      return;
    }
    renderAiMockChoices();
    elements.aiMockDialog.showModal();
  });
  elements.closeAiMockButton.addEventListener("click", () => elements.aiMockDialog.close());
  elements.startAiMockButton.addEventListener("click", () => {
    const examId = elements.aiMockList.querySelector("input:checked")?.value;
    if (examId) startMock({ kind: "ai", examId });
  });
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
  window.addEventListener("storage", (event) => {
    if (!STUDY_STORAGE_KEYS.includes(event.key)) return;
    hydrateStudyState();
    updateProgressSummary();
    updateTodaySummary();
    updateNotebookCounts();
  });
  window.addEventListener("keydown", (event) => {
    if (elements.progressDialog.open || elements.mockDialog.open || elements.aiMockDialog.open) return;
    if (event.key === "ArrowLeft") moveCard(-1);
    if (event.key === "ArrowRight") moveCard(1);
    if (/^[1-5]$/.test(event.key) && !state.flipped) selectOption(Number(event.key));
    else if (["1", "2", "3"].includes(event.key)) {
      const rating = {
        "1": { quality: 2, notebook: "unknown" },
        "2": { quality: 3, notebook: "uncertain" },
        "3": { quality: 5, notebook: "known" }
      }[event.key];
      rateCurrent(rating.quality, rating.notebook);
    }
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service worker registration failed", error));
  }
}

async function initializeApp() {
  await restoreDurableStorage();
  hydrateStudyState();
  requestPersistentStorage();
  initializeAnalytics();
  await window.studyCloud?.initialize({
    getSnapshot: createCloudSnapshot,
    applySnapshot: applyCloudSnapshot,
    getPresence: cloudPresence
  });
  await loadData();
}

initializeApp();

const STORAGE_KEYS = {
  progress: "bijihou2.progress.v1",
  reported: "bijihou2.reported.v1",
  csvCache: "bijihou2.csv-cache.v2"
};

const DAY_MS = 24 * 60 * 60 * 1000;
const config = window.APP_CONFIG;
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
  mode: "all",
  chapter: "all",
  flipped: false,
  selectedAnswer: null,
  progress: readStorage(STORAGE_KEYS.progress, {}),
  reported: new Set(readStorage(STORAGE_KEYS.reported, []))
};

const elements = {
  statusPanel: document.querySelector("#statusPanel"),
  studyPanel: document.querySelector("#studyPanel"),
  emptyPanel: document.querySelector("#emptyPanel"),
  emptyMessage: document.querySelector("#emptyMessage"),
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
  sourceLink: document.querySelector("#sourceLink"),
  reportButton: document.querySelector("#reportButton"),
  flipHint: document.querySelector("#flipHint"),
  badges: document.querySelector("#badges"),
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
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  showAllButton: document.querySelector("#showAllButton"),
  toast: document.querySelector("#toast")
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
    populateChapters();
    bindEvents();
    buildDeck();
    registerServiceWorker();
  } catch (error) {
    console.error(error);
    elements.statusPanel.innerHTML = "<span>読み込みに失敗しました。もう一度お試しください。</span>";
  }
}

function populateChapters() {
  elements.chapterSelect.replaceChildren(new Option("すべて", "all"));
  for (const [id, name] of state.chapters) {
    elements.chapterSelect.add(new Option(name, id));
  }
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function buildDeck() {
  let deck = state.questions.filter((question) => state.chapter === "all" || question.chapter === state.chapter);
  const now = Date.now();

  if (state.mode === "due") {
    deck = deck.filter((question) => !state.progress[question.id] || state.progress[question.id].due <= now);
  } else if (state.mode === "weak") {
    deck = deck.filter((question) => state.progress[question.id]?.weak);
  } else if (state.mode === "low") {
    deck = deck.filter((question) => question.confidence === "low");
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

  if (!state.deck.length) {
    elements.studyPanel.hidden = true;
    elements.ratingBar.hidden = true;
    elements.emptyPanel.hidden = false;
    elements.emptyMessage.textContent = state.mode === "due" ? "今日の復習は完了しました" : "まだ問題がありません";
    return;
  }

  elements.emptyPanel.hidden = true;
  elements.studyPanel.hidden = false;
  renderCard();
}

function renderCard() {
  const question = currentQuestion();
  state.flipped = false;
  state.selectedAnswer = null;
  elements.questionId.textContent = question.id;
  elements.questionTitle.textContent = question.title;
  elements.questionTitle.hidden = !question.title;
  elements.questionText.textContent = question.question;
  elements.cardPosition.textContent = `${state.index + 1} / ${state.deck.length}`;
  elements.chapterName.textContent = state.chapters.get(question.chapter) || question.chapter;
  elements.answerPanel.hidden = true;
  elements.flipHint.hidden = false;
  elements.flipHint.textContent = "選択肢を選んでください";
  elements.showAnswerButton.hidden = false;
  elements.showAnswerButton.disabled = true;
  elements.ratingBar.hidden = true;

  elements.optionsList.replaceChildren(...question.options.map((option, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-choice";
    button.textContent = option;
    button.setAttribute("aria-label", `選択肢 ${index + 1}: ${option}`);
    button.addEventListener("click", () => selectOption(index + 1));
    item.append(button);
    return item;
  }));

  elements.answerText.textContent = "";
  elements.answerText.classList.remove("is-wrong");
  elements.explanationText.textContent = question.explanation || "解説は登録されていません。";
  renderLaws(question.lawRefs);
  elements.sourceLink.hidden = !question.sourceUrl;
  elements.sourceLink.href = question.sourceUrl || "#";
  renderBadges(question);
  elements.previousButton.disabled = state.deck.length < 2;
  elements.nextButton.disabled = state.deck.length < 2;
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

function renderBadges(question) {
  const badges = [];
  if (question.confidence === "low") badges.push(["要確認", "low"]);
  if (state.reported.has(question.id)) badges.push(["報告済み", "reported"]);
  elements.badges.replaceChildren(...badges.map(([text, className]) => {
    const badge = document.createElement("span");
    badge.className = `badge ${className}`;
    badge.textContent = text;
    return badge;
  }));
}

function selectOption(answer) {
  if (state.flipped || !currentQuestion()) return;
  if (answer < 1 || answer > currentQuestion().options.length) return;
  state.selectedAnswer = answer;
  [...elements.optionsList.children].forEach((item, index) => item.classList.toggle("is-selected", index + 1 === answer));
  elements.showAnswerButton.disabled = false;
  elements.flipHint.textContent = `選択肢 ${answer} を選択中`;
}

function submitAnswer() {
  if (state.flipped || !currentQuestion()) return;
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
  const previous = state.progress[question.id] || { repetitions: 0, interval: 0, ease: 2.5 };
  let repetitions = previous.repetitions;
  let interval = previous.interval;
  let ease = previous.ease;

  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.max(1, Math.round(interval * ease));
  }

  ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  state.progress[question.id] = {
    repetitions,
    interval,
    ease: Number(ease.toFixed(2)),
    due: Date.now() + interval * DAY_MS,
    answeredAt: Date.now(),
    quality,
    correct: isCorrect,
    weak: !isCorrect || quality === 2 ? true : previous.weak && quality < 5
  };
  writeStorage(STORAGE_KEYS.progress, state.progress);
  updateProgressSummary();
  showToast("進捗を保存しました");

  if (state.mode === "due" || state.mode === "weak") {
    state.deck.splice(state.index, 1);
    if (state.index >= state.deck.length) state.index = 0;
    render();
  } else {
    moveCard(1);
  }
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
  const text = `問題ID: ${question.id}\n${question.title}\n${question.question}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "問題報告", text });
      showToast("共有しました");
    } else {
      await copyText(text);
      showToast("問題情報をコピーしました");
    }
    state.reported.add(question.id);
    writeStorage(STORAGE_KEYS.reported, [...state.reported]);
    renderBadges(question);
  } catch (error) {
    if (error.name !== "AbortError") showToast("共有に失敗しました");
  }
}

function updateProgressSummary() {
  const answered = state.questions.filter((question) => state.progress[question.id]).length;
  elements.progressCount.textContent = `${answered} / ${state.questions.length}`;
}

function openProgress() {
  const answered = state.questions.filter((question) => state.progress[question.id]);
  const weak = answered.filter((question) => state.progress[question.id].weak).length;
  const due = state.questions.filter((question) => !state.progress[question.id] || state.progress[question.id].due <= Date.now()).length;
  const reported = state.questions.filter((question) => state.reported.has(question.id)).length;
  const stats = [
    [answered.length, "学習済み"],
    [due, "今日の復習"],
    [weak, "苦手問題"],
    [reported, "報告済み"]
  ];
  elements.progressStats.replaceChildren(...stats.map(([value, label]) => {
    const item = document.createElement("div");
    item.className = "stat";
    item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    return item;
  }));
  elements.progressDialog.showModal();
}

function exportData() {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), progress: state.progress, reported: [...state.reported] }, null, 2)], { type: "application/json" });
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
    if (data.version !== 1 || typeof data.progress !== "object" || !Array.isArray(data.reported)) throw new Error("Invalid backup");
    state.progress = data.progress;
    state.reported = new Set(data.reported);
    writeStorage(STORAGE_KEYS.progress, state.progress);
    writeStorage(STORAGE_KEYS.reported, [...state.reported]);
    elements.progressDialog.close();
    buildDeck();
    showToast("データを読み込みました");
  } catch {
    showToast("読み込みに失敗しました");
  } finally {
    elements.importInput.value = "";
  }
}

function selectMode(mode) {
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === mode));
  buildDeck();
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 1800);
}

function bindEvents() {
  elements.chapterSelect.addEventListener("change", (event) => {
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
  elements.showAllButton.addEventListener("click", () => selectMode("all"));
  window.addEventListener("keydown", (event) => {
    if (elements.progressDialog.open) return;
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

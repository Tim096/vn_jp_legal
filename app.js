const STORAGE_KEYS = {
  progress: "bijihou2.progress.v1",
  reported: "bijihou2.reported.v1",
  csvCache: "bijihou2.csv-cache.v1"
};

const DAY_MS = 24 * 60 * 60 * 1000;
const config = window.APP_CONFIG;

const state = {
  questions: [],
  chapters: new Map(),
  deck: [],
  index: 0,
  mode: "all",
  chapter: "all",
  flipped: false,
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
  elements.questionId.textContent = question.id;
  elements.questionTitle.textContent = question.title;
  elements.questionTitle.hidden = !question.title;
  elements.questionText.textContent = question.question;
  elements.cardPosition.textContent = `${state.index + 1} / ${state.deck.length}`;
  elements.chapterName.textContent = state.chapters.get(question.chapter) || question.chapter;
  elements.answerPanel.hidden = true;
  elements.flipHint.hidden = false;
  elements.showAnswerButton.hidden = false;
  elements.ratingBar.hidden = true;

  elements.optionsList.replaceChildren(...question.options.map((option) => {
    const item = document.createElement("li");
    item.textContent = option;
    return item;
  }));

  elements.answerText.textContent = `正解：${question.answer.join("、")}`;
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
    link.textContent = lawRef;
    link.href = `https://laws.e-gov.go.jp/search/elawsSearch/elaws_search/lsg0100/search?searchType=2&searchLawName=${encodeURIComponent(lawRef)}`;
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

function flipCard() {
  if (state.flipped || !currentQuestion()) return;
  state.flipped = true;
  const question = currentQuestion();
  [...elements.optionsList.children].forEach((item, index) => {
    item.classList.toggle("is-answer", question.answer.includes(index + 1));
  });
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
    weak: quality === 2 ? true : previous.weak && quality < 5
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
  elements.questionCard.addEventListener("click", (event) => {
    if (!event.target.closest("a, button")) flipCard();
  });
  elements.questionCard.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
      event.preventDefault();
      flipCard();
    }
  });
  elements.showAnswerButton.addEventListener("click", flipCard);
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
    if (["1", "2", "3"].includes(event.key)) rateCurrent({ "1": 2, "2": 3, "3": 5 }[event.key]);
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service worker registration failed", error));
  }
}

loadData();

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";

const projectDir = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const outputDir = resolve(projectDir, "pipeline", "output", "taiwan-bar");
const officialIndexUrl = "https://wwwc.moex.gov.tw/main/Exam/wHandExamQandA_CSV.ashx";
const lawPlayerBase = "https://lawplayer.com/exam/judicial-officer";
const reviewedOverrides = JSON.parse(await readFile(resolve(projectDir, "pipeline", "taiwan-bar-reviewed-overrides.json"), "utf8"));
const humanExplanations = JSON.parse(await readFile(resolve(projectDir, "pipeline", "taiwan-bar-human-explanations.json"), "utf8"));
const humanExplanationById = new Map(humanExplanations.questions.map((question) => [question.id, question]));
const humanCorrectionText = (note) => Array.isArray(note)
  ? note.map((item) => typeof item === "string" ? item : item.note).filter(Boolean).join("；")
  : String(note || "").trim();
const requestedYears = process.argv.find((argument) => argument.startsWith("--years="))?.split("=")[1]
  ?.split(",").map((year) => year.trim()).filter(Boolean) || null;
const probeOnly = process.argv.includes("--probe");

const papers = [
  {
    id: "tw01",
    slug: "comprehensive-law-1-criminal",
    title: "綜合法學（一）：刑法、刑事訴訟法、法律倫理",
    match: (subject) => /綜合法學\(一\).*刑法/.test(subject)
  },
  {
    id: "tw02",
    slug: "comprehensive-law-1-constitutional",
    title: "綜合法學（一）：憲法、行政法、國際公法、國際私法",
    match: (subject) => /綜合法學\(一\).*憲法/.test(subject)
  },
  {
    id: "tw03",
    slug: "comprehensive-law-2-civil",
    title: "綜合法學（二）：民法、民事訴訟法",
    match: (subject) => /綜合法學\(二\).*民法/.test(subject)
  },
  {
    id: "tw04",
    slug: "綜合法學二-商法強執證交法學英文",
    title: "綜合法學（二）：商法、強制執行法、證券交易法、法學英文",
    match: (subject) => /綜合法學\(二\).*公司法/.test(subject)
  }
];

const taiwanLaws = {
  "中華民國憲法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0000001",
  "中華民國憲法增修條文": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0000002",
  "行政程序法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030055",
  "行政訴訟法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030154",
  "憲法訴訟法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030159",
  "中華民國刑法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=C0000001",
  "刑事訴訟法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=C0010001",
  "民法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=B0000001",
  "民事訴訟法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=B0010001",
  "公司法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0080001",
  "保險法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0390002",
  "票據法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0380028",
  "強制執行法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=B0010004",
  "證券交易法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0400001",
  "法官法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030243",
  "律師法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0020006",
  "公務員服務法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=S0020038",
  "法院組織法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0010053",
  "涉外民事法律適用法": "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=B0000007"
};
const lawAliases = { "刑法": "中華民國刑法", "Criminal Act": "中華民國刑法" };

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, "")) || [];
  return rows.filter((cells) => cells.some(Boolean)).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])));
}

function extractNuxtData(html) {
  const match = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("LawPlayer __NUXT_DATA__ not found");
  const flat = JSON.parse(match[1]);
  const memo = new Map();

  function hydrateReference(reference) {
    if (typeof reference !== "number") return reference;
    if (memo.has(reference)) return memo.get(reference);
    const node = flat[reference];
    if (node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) {
      if (["Reactive", "ShallowReactive", "Ref", "ShallowRef"].includes(node[0])) return hydrateReference(node[1]);
      if (node[0] === "Date") return node[1];
      if (node[0] === "Set") return node.slice(1).map(hydrateReference);
      if (node[0] === "Map") {
        const result = {};
        memo.set(reference, result);
        for (let index = 1; index < node.length; index += 2) result[hydrateReference(node[index])] = hydrateReference(node[index + 1]);
        return result;
      }
      const result = [];
      memo.set(reference, result);
      result.push(...node.map(hydrateReference));
      return result;
    }
    const result = {};
    memo.set(reference, result);
    for (const [key, value] of Object.entries(node)) result[key] = hydrateReference(value);
    return result;
  }

  const questions = [];
  for (let index = 0; index < flat.length; index += 1) {
    const node = flat[index];
    if (!node || Array.isArray(node) || typeof node !== "object") continue;
    if (!("questionNumber" in node) || !("content" in node) || !("correctAnswer" in node)) continue;
    questions.push(hydrateReference(index));
  }
  return questions;
}

function normalizeAnswer(value) {
  if (Array.isArray(value)) return value.flatMap(normalizeAnswer);
  const text = String(value ?? "").toUpperCase();
  if (/一律給分|送分/.test(text)) return [1, 2, 3, 4, 5];
  return [...new Set([...text].filter((character) => /[A-E]/.test(character)).map((character) => character.charCodeAt(0) - 64))];
}

function answerEntry(value) {
  const answer = normalizeAnswer(value);
  return { allCredit: /一律給分|送分/.test(String(value ?? "")), sets: answer.length ? [answer] : [] };
}

function alternativeAnswerEntry(value) {
  const sets = String(value ?? "").split("或")
    .map((part) => normalizeAnswer(part.replaceAll("複選", "")))
    .filter((answer) => answer.length);
  return { allCredit: false, sets };
}

function normalizeOptions(question) {
  if (Array.isArray(question.options)) {
    return question.options.map((option) => typeof option === "string" ? option : (option?.text || option?.content || ""))
      .map((option) => String(option).replace(/^\s*\([A-E]\)\s*/, "").trim()).filter(Boolean);
  }
  const content = String(question.content || "");
  return [...content.matchAll(/\(([A-E])\)([\s\S]*?)(?=\([A-E]\)|$)/g)].map((match) => match[2].trim());
}

function normalizeQuestionText(question) {
  const content = String(question.content || "").trim();
  const optionStart = content.search(/\s*\(A\)/);
  return (optionStart >= 0 ? content.slice(0, optionStart) : content).trim();
}

function flattenText(value) {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenText);
  if (typeof value === "object") return Object.values(value).flatMap(flattenText);
  return [];
}

function normalizeRelatedArticles(value) {
  const texts = flattenText(value).map((item) => item.trim()).filter(Boolean);
  const refs = texts.filter((item) => /法|條|釋字|判決|裁判/.test(item) && !/^https?:/.test(item));
  const urls = texts.filter((item) => /^https?:\/\//.test(item));
  return { refs: [...new Set(refs)], urls: [...new Set(urls)] };
}

function defaultLawNames(paperId, questionNumber) {
  if (paperId === "tw01") return questionNumber <= 35 ? ["中華民國刑法"] : questionNumber <= 60 ? ["刑事訴訟法"] : ["法官法", "律師法"];
  if (paperId === "tw02") return questionNumber <= 20 ? ["中華民國憲法", "中華民國憲法增修條文"]
    : questionNumber <= 55 ? ["行政程序法", "行政訴訟法"] : questionNumber > 65 ? ["涉外民事法律適用法"] : [];
  if (paperId === "tw03") return questionNumber <= 50 ? ["民法"] : ["民事訴訟法"];
  if (paperId === "tw04") return questionNumber <= 20 ? ["公司法"] : questionNumber <= 30 ? ["保險法"]
    : questionNumber <= 40 ? ["票據法"] : questionNumber <= 50 ? ["強制執行法"] : questionNumber <= 60 ? ["證券交易法"] : [];
  return [];
}

function lawReferences(question) {
  const text = `${question.question}\n${question.options.join("\n")}`;
  const matched = [];
  for (const [name, url] of Object.entries(taiwanLaws)) {
    const aliases = [name, ...Object.entries(lawAliases).filter(([, target]) => target === name).map(([alias]) => alias)];
    const alias = aliases.sort((left, right) => right.length - left.length).find((candidate) => text.includes(candidate));
    if (!alias) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const article = text.match(new RegExp(`${escaped}\\s*第\\s*([0-9一二三四五六七八九十百]+\\s*條(?:\\s*之\\s*[0-9]+)?)`))?.[1];
    matched.push({ ref: article ? `${name}第 ${article.replace(/\s+/g, " ")}` : name, url });
  }
  return matched.filter((item, index, items) => item.url && items.findIndex((candidate) => candidate.url === item.url) === index);
}

async function fetchText(url) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": "vn-jp-legal-personal-study-importer/1.0" } });
    if (response.ok) return response.text();
    if (attempt === 4 || ![429, 502, 503, 504].includes(response.status)) throw new Error(`${url}: HTTP ${response.status}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500 * attempt));
  }
  throw new Error(`${url}: unavailable`);
}

async function fetchBytes(url) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": "vn-jp-legal-personal-study-importer/1.0" } });
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
    if (attempt === 4 || ![429, 502, 503, 504].includes(response.status)) throw new Error(`${url}: HTTP ${response.status}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500 * attempt));
  }
  throw new Error(`${url}: unavailable`);
}

function selectOfficialRows(rows) {
  const candidates = rows.filter((row) => row["試題型態"] === "測驗題"
    && /司法官|律師/.test(row["考試名稱"])
    && /^(司法官及律師|司法官|律師)/.test(row["類科組別"])
    && /綜合法學/.test(row["科目全名"]));
  const years = [...new Set(candidates.map((row) => row["考試年度"]))]
    .filter((year) => !requestedYears || requestedYears.includes(year))
    .sort((left, right) => Number(left) - Number(right));
  const selected = [];
  for (const year of years) {
    for (const paper of papers) {
      const matches = candidates.filter((row) => row["考試年度"] === year && paper.match(row["科目全名"]));
      const row = matches.sort((left, right) => {
        const priority = (value) => value === "司法官及律師" ? 0 : value === "司法官" ? 1 : 2;
        return priority(left["類科組別"]) - priority(right["類科組別"]);
      })[0];
      if (row) selected.push({ year, paper, row });
    }
  }
  return selected;
}

async function officialAnswers(url, key) {
  const tempPath = resolve(tmpdir(), `vn-jp-legal-${key}.pdf`);
  await writeFile(tempPath, await fetchBytes(url));
  try {
    const text = execFileSync("pdftotext", ["-layout", tempPath, "-"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    const normalizedText = text.replace(/[Ａ-Ｅ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xFEE0));
    const expected = Number(normalizedText.match(/(?:單選題數|題\s*數)[：:]\s*(\d+)題/)?.[1] || 0);
    const answers = normalizedText.split(/\r?\n/).filter((line) => /^\s*答案\s+/.test(line))
      .flatMap((line) => line.replace(/^\s*答案\s+/, "").trim().split(/\s+/).filter(Boolean).map(answerEntry));
    const compact = normalizedText.replace(/\s+/g, "");
    for (const match of compact.matchAll(/第(\d+)題答([A-E或]+?)者均給分/g)) answers[Number(match[1]) - 1] = alternativeAnswerEntry(match[2]);
    for (const match of compact.matchAll(/第(\d+)題答([A-E或]+?)給分/g)) answers[Number(match[1]) - 1] = alternativeAnswerEntry(match[2]);
    for (const match of compact.matchAll(/第(\d+)題複選([A-E或複選]+?)給分/g)) answers[Number(match[1]) - 1] = alternativeAnswerEntry(match[2]);
    for (const match of compact.matchAll(/第(\d+)題一律給分/g)) answers[Number(match[1]) - 1] = { allCredit: true, sets: [] };
    if (!answers.length || answers.some((answer) => !answer.allCredit && !answer.sets.length)) {
      const empty = answers.map((answer, index) => answer.allCredit || answer.sets.length ? null : index + 1).filter(Boolean);
      throw new Error(`${key}: official answer parse failed (expected ${expected}, parsed ${answers.length}, empty ${empty.join(",")})`);
    }
    return answers;
  } finally {
    await rm(tempPath, { force: true });
  }
}

async function officialQuestions(url, key) {
  const tempPath = resolve(tmpdir(), `vn-jp-legal-${key}-questions.pdf`);
  await writeFile(tempPath, await fetchBytes(url));
  try {
    let text = execFileSync("pdftotext", ["-layout", tempPath, "-"], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
    text = text.replace(/[Ａ-Ｅ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xFEE0))
      .replace(/\f/g, "\n")
      .split(/\r?\n/)
      .filter((line) => !/^\s*(?:代號：|頁次：|第一試試題|類\s*科：|科\s*目：|考試時間：|座號：|※注意：)/.test(line))
      .join("\n");
    const starts = [...text.matchAll(/^ {0,2}(\d{1,3}) {2,}(.+)$/gm)]
      .filter((match) => Number(match[1]) >= 1 && Number(match[1]) <= 200);
    const parsed = [];
    for (let index = 0; index < starts.length; index += 1) {
      const match = starts[index];
      const next = starts[index + 1];
      const block = `${match[2]}\n${text.slice(match.index + match[0].length, next?.index ?? text.length)}`;
      const markers = [...block.matchAll(/[]/g)];
      if (markers.length < 4) continue;
      const question = block.slice(0, markers[0].index).replace(/\s+/g, " ").trim();
      const options = markers.slice(0, 5).map((marker, markerIndex) => {
        const start = marker.index + marker[0].length;
        const end = markers[markerIndex + 1]?.index ?? block.length;
        return block.slice(start, end).replace(/\s+/g, " ").trim();
      });
      if (question && options.every(Boolean)) parsed.push({ number: Number(match[1]), question, options });
    }
    const byNumber = new Map();
    for (const question of parsed) if (!byNumber.has(question.number)) byNumber.set(question.number, question);
    return [...byNumber.values()].sort((left, right) => left.number - right.number);
  } finally {
    await rm(tempPath, { force: true });
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  const officialRows = parseCsv(await fetchText(officialIndexUrl));
  const selectedRows = selectOfficialRows(officialRows);
  if (!selectedRows.length) throw new Error("No Taiwan bar first-stage rows found");
  const questions = [];
  const papersReport = [];

  for (const { year, paper, row } of selectedRows) {
    const pageUrl = `${lawPlayerBase}/${year}-${paper.slug}`;
    const html = await fetchText(pageUrl);
    let pageQuestions = extractNuxtData(html)
      .map((question) => ({
        raw: question,
        number: Number(question.questionNumber),
        question: normalizeQuestionText(question),
        options: normalizeOptions(question),
        answer: normalizeAnswer(question.correctAnswer),
        textSource: "public-page-transcription"
      }))
      .filter((question) => question.number && question.question && question.options.length >= 2 && question.answer.length)
      .sort((left, right) => left.number - right.number);
    const answers = await officialAnswers(row["測驗式試題答案網址"], `${year}-${paper.id}`);
    const needsFallback = pageQuestions.length !== answers.length
      || pageQuestions.some((question, index) => question.number !== index + 1
        || ![4, 5].includes(question.options.length)
        || (!answers[index]?.allCredit && answers[index]?.sets?.flat().some((answer) => answer > question.options.length)));
    if (needsFallback) {
      const fallback = await officialQuestions(row["試題網址"], `${year}-${paper.id}`);
      const byNumber = new Map(pageQuestions.map((question) => [question.number, question]));
      for (const question of fallback) {
        const current = byNumber.get(question.number);
        const officialEntry = answers[question.number - 1];
        const invalidCurrent = !current || ![4, 5].includes(current.options.length)
          || (!officialEntry?.allCredit && officialEntry?.sets?.flat().some((answer) => answer > current.options.length));
        if (invalidCurrent && question.options.length >= 4) {
          byNumber.set(question.number, { ...question, raw: current?.raw || {}, answer: officialEntry?.sets?.[0] || [], textSource: "moex-official-pdf" });
        }
      }
      pageQuestions = [...byNumber.values()].sort((left, right) => left.number - right.number);
    }
    if (pageQuestions.length !== answers.length || pageQuestions.some((question, index) => question.number !== index + 1)) {
      throw new Error(`${year}-${paper.id}: incomplete questions (extracted ${pageQuestions.length}, official answers ${answers.length})`);
    }
    const mismatch = [];
    for (const question of pageQuestions) {
      const officialEntry = answers[question.number - 1];
      const officialSets = officialEntry.sets;
      if (!officialEntry.allCredit && officialSets.flat().some((answer) => answer > question.options.length)) {
        throw new Error(`${year}-${paper.id}-${question.number}: official answer exceeds ${question.options.length} options`);
      }
      if (!officialEntry.allCredit && !officialSets.some((set) => set.join(",") === question.answer.join(","))) mismatch.push(question.number);
      const related = normalizeRelatedArticles(question.raw.relatedArticles);
      const normalized = {
        id: `tw-${year}-${paper.id}-${String(question.number).padStart(3, "0")}`,
        chapter: paper.id,
        title: `${year} 年・第 ${question.number} 題`,
        question: question.question,
        options: question.options,
        answer: officialEntry.allCredit ? question.options.map((_, index) => index + 1) : (officialSets[0] || question.answer),
        answer_sets: officialEntry.allCredit ? "*" : officialSets.map((set) => set.join("+")).join("|"),
        explanation: "",
        law_refs: related.refs,
        law_urls: related.urls,
        tags: [year, ...flattenText(question.raw.topics).filter((item) => typeof item === "string")],
        confidence: "high",
        status: "ok",
        law_as_of: `ROC-${year}`,
        source_tier: "official-primary",
        question_text_source: question.textSource || "public-page-transcription",
        answer_source: "moex-official-answer-pdf",
        explanation_source: "official-answer-only",
        law_reference_source: related.refs.length ? "public-page-related-articles" : "none",
        review_status: "not-individually-reviewed",
        reviewed_at: "",
        review_result: "",
        source_url: row["試題網址"],
        answer_url: row["測驗式試題答案網址"],
        explanation_url: "",
        page_url: pageUrl
      };
      const transcription = reviewedOverrides.transcription_questions?.[normalized.id];
      if (transcription) {
        normalized.question = transcription.question;
        normalized.options = transcription.options;
        normalized.question_text_source = "moex-official-pdf-reviewed-transcription";
        normalized.review_result = transcription.review_result;
      }
      if (!normalized.law_refs.length) {
        const references = lawReferences(normalized);
        normalized.law_refs = references.map((item) => item.ref);
        normalized.law_urls = references.map((item) => item.url);
        if (references.length) normalized.law_reference_source = "question-keyword-match";
        else {
          const guessedLawNames = defaultLawNames(paper.id, question.number);
          normalized.law_refs = guessedLawNames.map((name) => `可能相關：${name}`);
          normalized.law_urls = guessedLawNames.map((name) => taiwanLaws[name]);
          if (guessedLawNames.length) normalized.law_reference_source = "subject-question-range-guess";
        }
      }
      const reviewed = reviewedOverrides.questions[normalized.id] || reviewedOverrides.expert_questions?.[normalized.id];
      if (reviewed) {
        normalized.explanation = reviewed.explanation;
        normalized.law_refs = reviewed.law_refs;
        normalized.law_urls = reviewed.law_urls;
        normalized.explanation_source = "reviewed-sources";
        normalized.law_reference_source = "reviewed-sources";
        normalized.review_status = reviewedOverrides.questions[normalized.id] ? "random-sample-reviewed" : "specialist-agent-reviewed";
        normalized.reviewed_at = reviewedOverrides.reviewed_at;
        normalized.review_result = reviewed.review_result;
      }
      const human = humanExplanationById.get(normalized.id);
      if (human) {
        normalized.explanation = human.explanation;
        normalized.explanation_source = human.explanation_source;
        normalized.explanation_url = human.explanation_url;
        normalized.review_status = human.review_status || "external-human-source-not-individually-reviewed";
        normalized.reviewed_at = humanExplanations.generated_at || "";
        const correction = humanCorrectionText(human.correction_note);
        normalized.review_result = `人類解析來源：${human.source_name}${human.source_author ? `；作者／帳號：${human.source_author}` : ""}${correction ? `；來源勘誤／提醒：${correction}` : ""}`;
      }
      questions.push(normalized);
    }
    papersReport.push({
      year,
      paper: paper.id,
      subject: row["科目全名"],
      officialAnswerCount: answers.length,
      extractedCount: pageQuestions.length,
      answerMismatches: mismatch,
      sourceUrl: row["試題網址"],
      answerUrl: row["測驗式試題答案網址"],
      pageUrl
    });
    process.stdout.write(`${year} ${paper.id}: ${pageQuestions.length}/${answers.length}, mismatches=${mismatch.length}\n`);
    if (probeOnly) break;
  }

  await writeFile(resolve(outputDir, "report.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), papers: papersReport }, null, 2)}\n`, "utf8");
  await writeFile(resolve(outputDir, "questions.json"), `${JSON.stringify(questions, null, 2)}\n`, "utf8");
  const sampled = questions.map((question) => ({
    question,
    hash: createHash("sha256").update(`${reviewedOverrides.seed}:${question.id}`).digest("hex")
  })).sort((left, right) => left.hash.localeCompare(right.hash)).slice(0, Object.keys(reviewedOverrides.questions).length);
  const reviewedIds = new Set(Object.keys(reviewedOverrides.questions));
  if (sampled.some(({ question }) => !reviewedIds.has(question.id))) throw new Error("Reviewed overrides do not match deterministic random sample");
  await writeFile(resolve(outputDir, `audit-${reviewedOverrides.reviewed_at}.json`), `${JSON.stringify({
    reviewedAt: reviewedOverrides.reviewed_at,
    seed: reviewedOverrides.seed,
    method: "SHA-256(seed:id), ascending, first 8",
    officialQuestionCheck: "Compared against each linked MOEX official question PDF",
    sample: sampled.map(({ question, hash }) => ({
      id: question.id,
      hash,
      officialAnswer: question.answer_sets,
      reviewResult: question.review_result,
      explanationSource: question.explanation_source,
      lawReferences: question.law_refs,
      lawUrls: question.law_urls
    }))
  }, null, 2)}\n`, "utf8");
  const columns = ["id", "chapter", "title", "question", "options", "answer", "answer_sets", "explanation", "law_refs", "law_urls", "tags", "confidence", "status", "law_as_of", "source_tier", "question_text_source", "answer_source", "explanation_source", "law_reference_source", "review_status", "reviewed_at", "review_result", "source_url", "answer_url", "explanation_url", "page_url"];
  const csv = [columns.join(","), ...questions.map((question) => columns.map((column) => {
    const value = Array.isArray(question[column]) ? question[column].join(column === "options" || column === "law_urls" ? "\n" : ",") : question[column];
    return csvEscape(value);
  }).join(","))].join("\n");
  await writeFile(resolve(outputDir, "questions.csv"), `${csv}\n`, "utf8");
  if (!requestedYears && !probeOnly) {
    await writeFile(resolve(projectDir, "data", "taiwan-bar-questions.csv"), `${csv}\n`, "utf8");
  }
  process.stdout.write(`wrote ${questions.length} questions to ${basename(outputDir)}\n`);
}

await run();

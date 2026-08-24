import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MONDAI_BASE_URL = "https://shikakumondai.com/business-houmu-2nd";
const DOJO_URL = "https://shikaku-dojo.lb-product.com/bijihou-2/quiz";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");

function decodeHtml(value) {
  const entities = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: "\"" };
  return String(value || "")
    .replace(/<!--\s*-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === "#") {
        const hex = entity[1].toLowerCase() === "x";
        return String.fromCodePoint(Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
      }
      return entities[entity.toLowerCase()] ?? match;
    })
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function first(html, pattern, label) {
  const match = html.match(pattern);
  if (!match) throw new Error(`Missing ${label}`);
  return decodeHtml(match[1]);
}

function all(html, pattern) {
  return [...html.matchAll(pattern)].map((match) => decodeHtml(match[1]));
}

function extractAssignedJson(html, assignment) {
  const assignmentIndex = html.indexOf(assignment);
  if (assignmentIndex < 0) throw new Error(`Missing JavaScript assignment: ${assignment}`);
  const start = assignmentIndex + assignment.length;
  const opening = html[start];
  const closing = opening === "[" ? "]" : opening === "{" ? "}" : null;
  if (!closing) throw new Error(`Invalid JSON opening token after ${assignment}`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") inString = true;
    else if (character === opening) depth += 1;
    else if (character === closing) {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1));
    }
  }
  throw new Error(`Unclosed JSON assignment: ${assignment}`);
}

function normalizeQuestion(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(",") : String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "vn-jp-legal-study-importer/1.0" } });
  if (!response.ok) throw new Error(`Source request failed: HTTP ${response.status} ${url}`);
  return response.text();
}

function parseMondaiPage(html, chapterNumber, sourceUrl) {
  const chapter = `ch${String(chapterNumber).padStart(2, "0")}`;
  const articles = [...html.matchAll(/<article class="rd-q">([\s\S]*?)<\/article>/g)].map((match) => match[1]);
  if (!articles.length) throw new Error(`No questions found: ${sourceUrl}`);

  const questions = articles.map((article, index) => {
    const title = first(article, /<span class="rd-q-topic">([\s\S]*?)<\/span>/, "title");
    const stem = first(article, /<p class="rd-stem">([\s\S]*?)<\/p>/, "question stem");
    const statementsBlock = article.match(/<ul class="rd-sts">([\s\S]*?)<\/ul>/)?.[1] || "";
    const statements = all(statementsBlock, /<li>([\s\S]*?)<\/li>/g);
    const choicesBlock = article.match(/<ol class="rd-choices">([\s\S]*?)<\/ol>/)?.[1] || "";
    const options = all(choicesBlock, /<li value="\d+">([\s\S]*?)<\/li>/g);
    const answerText = first(article, /<p class="rd-correct">([\s\S]*?)<\/p>/, "answer");
    const answer = Number(answerText.match(/正解：\s*(\d+)/)?.[1]);
    const explanation = first(article, /<p class="rd-lesson">([\s\S]*?)<\/p>/, "explanation").replace(/^解説/, "").trim();
    const lawRefs = [...new Set(all(article, /<p class="rd-cite"><b>([\s\S]*?)<\/b>/g))];
    if (!options.length || !Number.isInteger(answer)) throw new Error(`Invalid choices at ${chapter} question ${index + 1}`);

    return {
      id: `${chapter}-${String(index + 1).padStart(4, "0")}`,
      chapter,
      title,
      question: [stem, ...statements].join("\n"),
      options,
      answer: [answer],
      explanation,
      law_refs: lawRefs,
      tags: [],
      needs_review: false,
      reason: null,
      confidence: ["ch04", "ch05", "ch06"].includes(chapter) ? "mid" : "high",
      status: "ok",
      source_url: sourceUrl
    };
  });

  const quizSchema = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => {
      try { return JSON.parse(match[1]); } catch { return null; }
    })
    .find((item) => item?.["@type"] === "Quiz");
  if (!quizSchema || !Array.isArray(quizSchema.hasPart) || quizSchema.hasPart.length !== questions.length) {
    throw new Error(`JSON-LD count mismatch: ${sourceUrl}`);
  }
  questions.forEach((question, index) => {
    const acceptedAnswer = quizSchema.hasPart[index]?.acceptedAnswer?.text;
    if (acceptedAnswer !== question.options[question.answer[0] - 1]) {
      throw new Error(`Answer mismatch at ${chapter} question ${index + 1}`);
    }
  });
  return questions;
}

function parseDojoPage(html) {
  const rawQuestions = extractAssignedJson(html, "const allQuestions = ");
  const lawSources = extractAssignedJson(html, "const LAW_SOURCES = ");
  if (!Array.isArray(rawQuestions) || rawQuestions.length !== 300) {
    throw new Error(`Unexpected 資格道場 count: ${rawQuestions.length}`);
  }

  const questions = rawQuestions.map((question) => {
    const isTrueFalse = question.format === "marubatsu";
    const options = isTrueFalse ? ["○", "×"] : question.choices;
    const answer = isTrueFalse ? (question.correct_answer ? 1 : 2) : Number(question.correct_choice) + 1;
    if (!Array.isArray(options) || !options.length || !Number.isInteger(answer)) {
      throw new Error(`Invalid 資格道場 question ${question.id}`);
    }

    return {
      id: `dojo-${question.id}`,
      chapter: "supplement",
      title: isTrueFalse ? "資格道場 ○×問題" : "資格道場 四択問題",
      question: question.body,
      options,
      answer: [answer],
      explanation: question.explanation || "",
      law_refs: (lawSources[String(question.id)] || []).map((item) => item.label),
      tags: ["資格道場"],
      needs_review: false,
      reason: null,
      confidence: "mid",
      status: "ok",
      source_url: DOJO_URL
    };
  });

  const referenceBlock = html.match(/<ol class="quiz-ref-list"[\s\S]*?>([\s\S]*?)<\/ol>/)?.[1] || "";
  const referenceMarker = '<li style="margin-bottom:22px;';
  const referenceEntries = referenceBlock.split(referenceMarker).slice(1).map((entry) => `${referenceMarker}${entry}`);
  if (referenceEntries.length !== rawQuestions.length) {
    throw new Error(`資格道場 reference count mismatch: ${referenceEntries.length}`);
  }
  rawQuestions.forEach((rawQuestion, index) => {
    const displayedAnswer = first(referenceEntries[index], /正解：([\s\S]*?)<\/p>/, `資格道場 answer ${rawQuestion.id}`);
    const expected = rawQuestion.format === "marubatsu"
      ? (rawQuestion.correct_answer ? "○" : "×")
      : rawQuestion.choices[Number(rawQuestion.correct_choice)];
    if (!displayedAnswer.includes(expected)) {
      throw new Error(`資格道場 answer mismatch at question ${rawQuestion.id}`);
    }
  });
  return questions;
}

const mondaiPages = await Promise.all(Array.from({ length: 16 }, async (_, index) => {
  const chapterNumber = index + 1;
  const sourceUrl = `${MONDAI_BASE_URL}/chapter-${chapterNumber}`;
  return parseMondaiPage(await fetchText(sourceUrl), chapterNumber, sourceUrl);
}));
const mondaiQuestions = mondaiPages.flat();
const dojoQuestions = parseDojoPage(await fetchText(DOJO_URL));

const seen = new Map();
const mondaiStatements = new Map();
const duplicates = [];
const combined = [];
for (const question of mondaiQuestions) {
  const fingerprint = normalizeQuestion(question.question);
  const existing = seen.get(fingerprint);
  if (existing) {
    duplicates.push({ removed_id: question.id, kept_id: existing.id, reason: "same_question", question: question.question });
    continue;
  }
  seen.set(fingerprint, question);
  combined.push(question);
  question.question.split("\n").slice(1).forEach((statement) => {
    const statementFingerprint = normalizeQuestion(statement.replace(/^[アイウエオカキクケコサシスセソ]\s*[．.、]/, ""));
    if (statementFingerprint && !mondaiStatements.has(statementFingerprint)) mondaiStatements.set(statementFingerprint, question);
  });
}

for (const question of dojoQuestions) {
  const fingerprint = normalizeQuestion(question.question);
  const existing = seen.get(fingerprint) || mondaiStatements.get(fingerprint);
  if (existing) {
    duplicates.push({
      removed_id: question.id,
      kept_id: existing.id,
      reason: seen.has(fingerprint) ? "same_question" : "matches_source1_statement",
      question: question.question
    });
    continue;
  }
  seen.set(fingerprint, question);
  combined.push(question);
}

const outputDir = resolve(scriptDir, "output");
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "shikakumondai.json"), `${JSON.stringify(mondaiQuestions, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDir, "shikaku-dojo.json"), `${JSON.stringify(dojoQuestions, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDir, "duplicates.json"), `${JSON.stringify(duplicates, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDir, "all.json"), `${JSON.stringify(combined, null, 2)}\n`, "utf8")
]);

const columns = ["id", "chapter", "title", "question", "options", "answer", "explanation", "law_refs", "tags", "confidence", "status", "source_url"];
const csv = [
  columns.join(","),
  ...combined.map((question) => columns.map((column) => csvCell(column === "options" ? question.options.join("\n") : question[column])).join(","))
].join("\n");
await writeFile(resolve(projectDir, "data", "questions.csv"), `${csv}\n`, "utf8");

const chapterIds = [...new Set(combined.map((question) => question.chapter))];
const counts = Object.fromEntries(chapterIds.map((chapter) => [chapter, combined.filter((question) => question.chapter === chapter).length]));
console.log(JSON.stringify({ source1: mondaiQuestions.length, source2: dojoQuestions.length, duplicates: duplicates.length, imported: combined.length, chapters: counts }, null, 2));

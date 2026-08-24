import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceUrl = process.argv[2] || "https://shikakumondai.com/business-houmu-2nd/chapter-4";
const chapter = process.argv[3] || "ch04";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, "..");

function decodeHtml(value) {
  const entities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\""
  };
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

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(",") : String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`Source request failed: HTTP ${response.status}`);
const html = await response.text();
const articles = [...html.matchAll(/<article class="rd-q">([\s\S]*?)<\/article>/g)].map((match) => match[1]);
if (!articles.length) throw new Error("No questions found in source HTML");

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

  if (!options.length || !Number.isInteger(answer)) throw new Error(`Invalid choices at question ${index + 1}`);

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
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  })
  .find((item) => item?.["@type"] === "Quiz");

if (!quizSchema || !Array.isArray(quizSchema.hasPart) || quizSchema.hasPart.length !== questions.length) {
  throw new Error("JSON-LD question count does not match extracted HTML");
}

questions.forEach((question, index) => {
  const schemaQuestion = quizSchema.hasPart[index];
  const acceptedAnswer = schemaQuestion?.acceptedAnswer?.text;
  const extractedAnswer = question.options[question.answer[0] - 1];
  if (acceptedAnswer !== extractedAnswer) {
    throw new Error(`Answer mismatch at question ${index + 1}: JSON-LD and visible HTML disagree`);
  }
});

const outputDir = resolve(scriptDir, "output");
await mkdir(outputDir, { recursive: true });
const jsonPath = resolve(outputDir, `${chapter}.json`);
await writeFile(jsonPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");

const columns = ["id", "chapter", "title", "question", "options", "answer", "explanation", "law_refs", "tags", "confidence", "status", "source_url"];
const rows = questions.map((question) => ({
  ...question,
  options: question.options.join("\n")
}));
const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
const csvPath = resolve(projectDir, "data", "questions.csv");
await writeFile(csvPath, `${csv}\n`, "utf8");

console.log(`Extracted ${questions.length} questions from ${sourceUrl}`);
console.log(`Cross-checked ${questions.length} answers against source JSON-LD`);
console.log(`JSON: ${jsonPath}`);
console.log(`CSV:  ${csvPath}`);

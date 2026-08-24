import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPaths = process.argv.slice(2);

if (!inputPaths.length) {
  console.error("Usage: node pipeline/validate.mjs <questions.json> [more.json]");
  process.exit(2);
}

const errors = [];
const warnings = [];
const questions = [];

for (const inputPath of inputPaths) {
  const absolutePath = resolve(inputPath);
  try {
    const parsed = JSON.parse(await readFile(absolutePath, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("root must be a JSON array");
    parsed.forEach((question, index) => questions.push({ ...question, __source: `${inputPath}[${index}]` }));
  } catch (error) {
    errors.push(`${inputPath}: ${error.message}`);
  }
}

const seenIds = new Map();
const seenQuestions = new Map();
const chapterCounts = new Map();
const explanationLengths = [];
const lawPattern = /^[ぁ-んァ-ヶ一-龥々〆ヵヶー・（）()]+第\d+条(?:の\d+)*(?:第\d+項)?(?:第\d+号)?(?:[イロハ])?(?:ただし書)?$/;

for (const question of questions) {
  const source = question.__source;
  const requiredStrings = ["id", "chapter", "question"];
  for (const field of requiredStrings) {
    if (typeof question[field] !== "string" || !question[field].trim()) errors.push(`${source}: ${field} is required`);
  }

  if (!Array.isArray(question.options) || ![2, 4, 5].includes(question.options.length)) {
    errors.push(`${source}: options.length must be 2, 4, or 5`);
  } else if (question.options.some((option) => typeof option !== "string" || !option.trim())) {
    errors.push(`${source}: every option must be a non-empty string`);
  }

  if (!Array.isArray(question.answer) || !question.answer.length || question.answer.some((answer) => !Number.isInteger(answer))) {
    errors.push(`${source}: answer must be a non-empty integer array`);
  } else if (Array.isArray(question.options) && question.answer.some((answer) => answer < 1 || answer > question.options.length)) {
    errors.push(`${source}: answer index is outside options range`);
  }

  if (!Array.isArray(question.law_refs)) {
    errors.push(`${source}: law_refs must be an array`);
  } else {
    for (const lawRef of question.law_refs) {
      if (typeof lawRef !== "string" || !lawPattern.test(lawRef.replace(/\s/g, ""))) warnings.push(`${source}: suspicious law_ref "${lawRef}"`);
    }
  }

  if (question.needs_review === true && (typeof question.reason !== "string" || !question.reason.trim())) {
    errors.push(`${source}: reason is required when needs_review is true`);
  }

  if (question.law_as_of !== "unknown" && !/^\d{4}-\d{2}-\d{2}$/.test(question.law_as_of || "")) {
    errors.push(`${source}: law_as_of must be YYYY-MM-DD or unknown`);
  }

  if (!["checked-secondary", "supplemental-secondary"].includes(question.source_tier)) {
    errors.push(`${source}: invalid source_tier`);
  }

  if (seenIds.has(question.id)) errors.push(`${source}: duplicate id also found at ${seenIds.get(question.id)}`);
  else seenIds.set(question.id, source);

  const normalized = String(question.question || "").normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "");
  if (normalized && seenQuestions.has(normalized)) warnings.push(`${source}: possible duplicate question also found at ${seenQuestions.get(normalized)}`);
  else if (normalized) seenQuestions.set(normalized, source);

  if (question.chapter) chapterCounts.set(question.chapter, (chapterCounts.get(question.chapter) || 0) + 1);
  if (typeof question.explanation === "string" && question.explanation.trim()) explanationLengths.push([source, question.explanation.trim().length]);
}

for (const [chapter, count] of chapterCounts) {
  if (count < 5) warnings.push(`${chapter}: only ${count} question(s); check for missing extraction`);
}

if (explanationLengths.length >= 5) {
  const sorted = explanationLengths.map(([, length]) => length).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  for (const [source, length] of explanationLengths) {
    if (length < Math.max(10, median * 0.25)) warnings.push(`${source}: explanation is unusually short (${length} chars; median ${median})`);
    if (length > median * 4) warnings.push(`${source}: explanation is unusually long (${length} chars; median ${median})`);
  }
}

for (const message of errors) console.error(`ERROR ${message}`);
for (const message of warnings) console.warn(`WARN  ${message}`);
console.log(`Checked ${questions.length} question(s): ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);

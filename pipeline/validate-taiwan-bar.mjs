import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDir = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const outputDir = resolve(projectDir, "pipeline", "output", "taiwan-bar");
const questions = JSON.parse(await readFile(resolve(outputDir, "questions.json"), "utf8"));
const report = JSON.parse(await readFile(resolve(outputDir, "report.json"), "utf8"));
const audit = JSON.parse(await readFile(resolve(outputDir, "audit-2026-08-28.json"), "utf8"));
const generatedCsv = await readFile(resolve(outputDir, "questions.csv"), "utf8");
const productionCsv = await readFile(resolve(projectDir, "data", "taiwan-bar-questions.csv"), "utf8");
const publishedAi = (await readFile(resolve(projectDir, "pipeline", "output", "taiwan-bar-ai", "published.jsonl"), "utf8"))
  .trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const errors = [];

if (generatedCsv !== productionCsv) errors.push("production CSV differs from generated CSV");
if (report.papers.length !== 60) errors.push(`expected 60 papers, got ${report.papers.length}`);
if (questions.length !== report.papers.reduce((sum, paper) => sum + paper.officialAnswerCount, 0)) errors.push("question total differs from official answer total");
const publishedAiIds = new Set(publishedAi.map((result) => result.id));
if (publishedAiIds.size !== publishedAi.length) errors.push("duplicate id in published AI explanations");

const ids = new Set();
const years = new Set();
const papers = new Map();
for (const question of questions) {
  if (ids.has(question.id)) errors.push(`duplicate id: ${question.id}`);
  ids.add(question.id);
  const match = question.id.match(/^tw-(\d{3})-(tw0[1-4])-(\d{3})$/);
  if (!match) errors.push(`invalid id: ${question.id}`);
  else {
    years.add(match[1]);
    const key = `${match[1]}-${match[2]}`;
    papers.set(key, (papers.get(key) || 0) + 1);
  }
  if (!question.question || !Array.isArray(question.options) || ![4, 5].includes(question.options.length)) errors.push(`invalid content: ${question.id}`);
  if (question.explanation_source !== "official-answer-only" && !question.explanation) errors.push(`missing explanation: ${question.id}`);
  if (!/^(public-page-transcription|moex-official-pdf|moex-official-pdf-reviewed-transcription)$/.test(question.question_text_source)) errors.push(`invalid question_text_source: ${question.id}`);
  if (question.answer_source !== "moex-official-answer-pdf") errors.push(`invalid answer_source: ${question.id}`);
  if (!/^(official-answer-only|reviewed-sources|third-party-detailed-pdf|human-third-party-114exam|human-third-party-facebook|ai-generated)$/.test(question.explanation_source)) errors.push(`invalid explanation_source: ${question.id}`);
  if (!/^(none|question-keyword-match|subject-question-range-guess|public-page-related-articles|reviewed-sources|ai-source-packet)$/.test(question.law_reference_source)) errors.push(`invalid law_reference_source: ${question.id}`);
  if (question.review_status === "random-sample-reviewed") {
    if (question.explanation_source !== "reviewed-sources" || question.law_reference_source !== "reviewed-sources" || question.reviewed_at !== "2026-08-28" || !question.review_result) {
      errors.push(`incomplete reviewed provenance: ${question.id}`);
    }
  } else if (question.review_status === "specialist-agent-reviewed") {
    if (question.explanation_source !== "reviewed-sources" || question.law_reference_source !== "reviewed-sources" || question.reviewed_at !== "2026-08-28" || !question.review_result) {
      errors.push(`incomplete specialist review provenance: ${question.id}`);
    }
  } else if (question.review_status === "ai-generated-unreviewed") {
    if (question.explanation_source !== "ai-generated" || question.confidence !== "low") errors.push(`invalid AI provenance: ${question.id}`);
  } else if (question.review_status === "external-human-source-not-individually-reviewed") {
    if (!question.explanation_source.startsWith("human-third-party-") || !question.explanation_url || !question.explanation.includes("人類")) {
      errors.push(`invalid human provenance: ${question.id}`);
    }
  } else if (question.review_status !== "not-individually-reviewed") errors.push(`invalid review_status: ${question.id}`);
  if (question.explanation_source === "official-answer-only" && question.explanation) errors.push(`official-answer-only must not contain explanation: ${question.id}`);
  if (question.explanation_source === "third-party-detailed-pdf" && (!question.id.startsWith("tw-114-") || !/^https:\/\/exam-blindspot-decoder\.github\.io\/114exam\/.+\.pdf$/.test(question.explanation_url))) {
    errors.push(`invalid detailed explanation source: ${question.id}`);
  }
  if (question.explanation_source === "human-third-party-114exam" && (!question.id.startsWith("tw-114-") || !/^https:\/\/exam-blindspot-decoder\.github\.io\/114exam\/.+\.pdf$/.test(question.explanation_url))) {
    errors.push(`invalid 114exam human source: ${question.id}`);
  }
  if (question.explanation_source === "human-third-party-facebook" && (!/^tw-11[0-3]-/.test(question.id) || !/^https:\/\/(?:www\.)?facebook\.com\//.test(question.explanation_url))) {
    errors.push(`invalid Facebook human source: ${question.id}`);
  }
  if (!/^ROC-\d{3}$/.test(question.law_as_of)) errors.push(`invalid law_as_of: ${question.id}`);
  if (!/^https:\/\/[^/]+\.moex\.gov\.tw\//.test(question.source_url)) errors.push(`invalid official question URL: ${question.id}`);
  if (!/^https:\/\/[^/]+\.moex\.gov\.tw\//.test(question.answer_url)) errors.push(`invalid official answer URL: ${question.id}`);
  if (question.law_refs.length !== question.law_urls.length) errors.push(`law link mismatch: ${question.id}`);
  if (question.answer_sets !== "*") {
    const sets = question.answer_sets.split("|").map((set) => set.split("+").map(Number));
    if (!sets.length || sets.some((set) => !set.length || set.some((choice) => !Number.isInteger(choice) || choice < 1 || choice > question.options.length))) {
      errors.push(`invalid answer set: ${question.id}`);
    }
  }
}

const aiQuestionIds = new Set(questions.filter((question) => question.explanation_source === "ai-generated").map((question) => question.id));
if (aiQuestionIds.size !== publishedAiIds.size
  || [...aiQuestionIds].some((id) => !publishedAiIds.has(id))
  || [...publishedAiIds].some((id) => !aiQuestionIds.has(id))) {
  errors.push("questions.json AI explanations differ from published.jsonl");
}

if (audit.seed !== "tw-bar-audit-2026-08-28-v1" || audit.method !== "SHA-256(seed:id), ascending, first 8") errors.push("invalid audit method");
if (!Array.isArray(audit.sample) || audit.sample.length !== 8) errors.push(`expected 8 audited questions, got ${audit.sample?.length ?? 0}`);
const auditedIds = new Set(audit.sample?.map((item) => item.id));
const auditedQuestions = questions.filter((question) => auditedIds.has(question.id));
if (auditedQuestions.length !== 8 || auditedQuestions.some((question) => question.review_status !== "random-sample-reviewed" && !question.explanation_source.startsWith("human-third-party-"))) {
  errors.push("reviewed questions differ from audit sample");
}

for (let year = 101; year <= 115; year += 1) {
  if (!years.has(String(year))) errors.push(`missing year: ${year}`);
  for (let paper = 1; paper <= 4; paper += 1) {
    const key = `${year}-tw0${paper}`;
    const official = report.papers.find((item) => `${item.year}-${item.paper}` === key)?.officialAnswerCount;
    if (!official || papers.get(key) !== official) errors.push(`paper count mismatch: ${key}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  const multi = questions.filter((question) => question.answer_sets.includes("+")).length;
  const alternatives = questions.filter((question) => question.answer_sets.includes("|")).length;
  const allCredit = questions.filter((question) => question.answer_sets === "*").length;
  const sourceReviewed = questions.filter((question) => question.explanation_source === "reviewed-sources").length;
  const externalDetailed = questions.filter((question) => question.explanation_source === "third-party-detailed-pdf" || question.explanation_source.startsWith("human-third-party-")).length;
  const aiGenerated = questions.filter((question) => question.explanation_source === "ai-generated").length;
  console.log(`Taiwan bar first-stage valid: ${questions.length} questions, ${report.papers.length} papers, 101-115, multi=${multi}, alternatives=${alternatives}, all-credit=${allCredit}, reviewed=${sourceReviewed}, external-detailed=${externalDetailed}, ai-generated=${aiGenerated}`);
}

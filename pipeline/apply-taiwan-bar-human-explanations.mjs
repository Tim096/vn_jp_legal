import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDir = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const outputDir = resolve(projectDir, "pipeline", "output", "taiwan-bar");
const aiOutputDir = resolve(projectDir, "pipeline", "output", "taiwan-bar-ai");
const inputPath = resolve(process.argv[2] || resolve(projectDir, "pipeline", "taiwan-bar-human-explanations.json"));
const questions = JSON.parse(await readFile(resolve(outputDir, "questions.json"), "utf8"));
const humanData = JSON.parse(await readFile(inputPath, "utf8"));
const byId = new Map(questions.map((question) => [question.id, question]));
const humanIds = new Set();
const correctionText = (note) => Array.isArray(note)
  ? note.map((item) => typeof item === "string" ? item : item.note).filter(Boolean).join("；")
  : String(note || "").trim();

for (const result of humanData.questions || []) {
  if (humanIds.has(result.id)) throw new Error(`Duplicate human explanation: ${result.id}`);
  humanIds.add(result.id);
  const question = byId.get(result.id);
  if (!question) throw new Error(`Unknown question: ${result.id}`);
  if (result.human_written !== true) throw new Error(`Human source not confirmed: ${result.id}`);
  if (!/^https:\/\//.test(result.explanation_url || "")) throw new Error(`Missing source URL: ${result.id}`);
  if (String(result.explanation || "").trim().length < 40) throw new Error(`Explanation too short: ${result.id}`);
  question.explanation = String(result.explanation).trim();
  question.explanation_source = result.explanation_source;
  question.explanation_url = result.explanation_url;
  question.review_status = result.review_status || "external-human-source-not-individually-reviewed";
  question.reviewed_at = humanData.generated_at || "";
  const correction = correctionText(result.correction_note);
  question.review_result = `人類解析來源：${result.source_name}${result.source_author ? `；作者／帳號：${result.source_author}` : ""}${correction ? `；來源勘誤／提醒：${correction}` : ""}`;
}

const publishedPath = resolve(aiOutputDir, "published.jsonl");
const published = (await readFile(publishedPath, "utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
  .filter((result) => !humanIds.has(result.id));

const columns = ["id", "chapter", "title", "question", "options", "answer", "answer_sets", "explanation", "law_refs", "law_urls", "tags", "confidence", "status", "law_as_of", "source_tier", "question_text_source", "answer_source", "explanation_source", "law_reference_source", "review_status", "reviewed_at", "review_result", "source_url", "answer_url", "explanation_url", "page_url"];
const csvEscape = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csv = [columns.join(","), ...questions.map((question) => columns.map((column) => {
  const value = Array.isArray(question[column])
    ? question[column].join(column === "options" || column === "law_urls" ? "\n" : ",")
    : question[column];
  return csvEscape(value);
}).join(","))].join("\n");

await writeFile(resolve(outputDir, "questions.json"), `${JSON.stringify(questions, null, 2)}\n`, "utf8");
await writeFile(resolve(outputDir, "questions.csv"), `${csv}\n`, "utf8");
await writeFile(resolve(projectDir, "data", "taiwan-bar-questions.csv"), `${csv}\n`, "utf8");
await writeFile(publishedPath, `${published.map(JSON.stringify).join("\n")}\n`, "utf8");
process.stdout.write(`Applied ${humanIds.size} human explanations; ${published.length} AI explanations remain published.\n`);

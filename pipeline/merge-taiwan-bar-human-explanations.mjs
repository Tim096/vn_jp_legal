import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDir = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const sources = [
  "taiwan-bar-human-explanations-110-111.json",
  "taiwan-bar-human-explanations-112-113.json",
  "taiwan-bar-human-explanations-114.json"
];
const questions = [];
for (const source of sources) {
  try {
    const data = JSON.parse(await readFile(resolve(projectDir, "pipeline", source), "utf8"));
    const rows = Array.isArray(data) ? data : data.questions;
    questions.push(...rows.map((question) => ({
      ...question,
      explanation: question.explanation_source === "human-third-party-facebook" && !String(question.explanation).startsWith("來源：")
        ? `來源：全人法學中心 Facebook 公開貼文中的人類作者詳解（非 AI、非考選部官方解析）。\n\n${String(question.explanation).trim()}`
        : String(question.explanation).trim()
    })));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const ids = new Set();
for (const question of questions) {
  if (ids.has(question.id)) throw new Error(`Duplicate human explanation: ${question.id}`);
  ids.add(question.id);
  if (question.human_written !== true) throw new Error(`Human source not confirmed: ${question.id}`);
  if (!/^https:\/\//.test(question.explanation_url || "")) throw new Error(`Missing source URL: ${question.id}`);
  if (String(question.explanation || "").trim().length < 40) throw new Error(`Explanation too short: ${question.id}`);
}

questions.sort((left, right) => left.id.localeCompare(right.id));
await writeFile(resolve(projectDir, "pipeline", "taiwan-bar-human-explanations.json"), `${JSON.stringify({
  version: 1,
  generated_at: "2026-08-29",
  questions
}, null, 2)}\n`, "utf8");
process.stdout.write(`Merged ${questions.length} human explanations from ${sources.length} source files.\n`);

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDir = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const questionsPath = resolve(projectDir, "pipeline/output/taiwan-bar/questions.json");
const outputDir = resolve(projectDir, "pipeline/output/taiwan-bar-ai");
const packetsPath = resolve(outputDir, "source-packets.jsonl");
const reportPath = resolve(outputDir, "source-packets-report.json");
const apiUrl = "https://twlawbot.com/api/exam-questions";
const pageUrl = "https://twlawbot.com/lawyer-exam";

const chapterBySubject = new Map([
  ["刑法、刑事訴訟法、法律倫理", "tw01"],
  ["憲法、行政法、國際公法、國際私法", "tw02"],
  ["民法、民事訴訟法", "tw03"],
  ["公司法、保險法、票據法、證券交易法、強制執行法、法學英文", "tw04"],
  ["公司法、保險法、票據法、證券交易法、強制執行法、海商法、法學英文", "tw04"]
]);
const querySubjects = [
  "刑法、刑事訴訟法、法律倫理",
  "憲法、行政法、國際公法、國際私法",
  "民法、民事訴訟法",
  "公司法、保險法、票據法、證券交易法、強制執行法、法學英文"
];

function normalize(text) {
  return String(text || "").normalize("NFKC").replace(/[\s　]+/g, "").replace(/[，,；;：:。．]/g, "");
}

function answerValue(answer) {
  return String(answer || "").split(/[,+]/).map((item) => item.trim().charCodeAt(0) - 64).join("+");
}

async function fetchYear(year) {
  const subjects = year === 102
    ? [...querySubjects, "公司法、保險法、票據法、證券交易法、強制執行法、海商法、法學英文"]
    : querySubjects;
  const byId = new Map();
  for (const subject of subjects) {
    const url = new URL(apiUrl);
    url.searchParams.set("action", "questions");
    url.searchParams.set("count", "400");
    url.searchParams.set("shuffle", "false");
    url.searchParams.set("years", String(year));
    url.searchParams.set("subjects", subject);
    const response = await fetch(url, { headers: { Referer: pageUrl, Origin: "https://twlawbot.com" } });
    if (!response.ok) throw new Error(`TaiLexi ${year} ${subject}: HTTP ${response.status}`);
    const data = await response.json();
    for (const question of data.questions || []) byId.set(String(question.id), question);
  }
  return [...byId.values()];
}

const localQuestions = JSON.parse(await readFile(questionsPath, "utf8"));
const localById = new Map(localQuestions.map((question) => [question.id, question]));
const packets = [];
const mismatches = [];
const unmapped = [];
const fetchedCounts = {};
const retrievedAt = new Date().toISOString();

for (let year = 102; year <= 115; year += 1) {
  const remoteQuestions = await fetchYear(year);
  fetchedCounts[year] = remoteQuestions.length;
  for (const remote of remoteQuestions) {
    const chapter = chapterBySubject.get(remote.subject);
    if (!chapter) {
      unmapped.push({ year, originalId: remote.originalId, subject: remote.subject, reason: "unknown subject" });
      continue;
    }
    const id = `tw-${year}-${chapter}-${String(remote.originalId).padStart(3, "0")}`;
    const local = localById.get(id);
    if (!local) {
      unmapped.push({ id, year, originalId: remote.originalId, subject: remote.subject, reason: "local question missing" });
      continue;
    }
    const textMatches = normalize(local.question) === normalize(remote.questionText);
    const answerMatches = local.answer_sets.split("|").includes(answerValue(remote.answer));
    if (!textMatches || !answerMatches) mismatches.push({ id, text_matches: textMatches, answer_matches: answerMatches, local_answer: local.answer_sets, remote_answer: remote.answer });
    if (!textMatches || !answerMatches) continue;
    packets.push({
      id,
      source_type: "third-party-question-law-map",
      source_name: "TaiLexi AI",
      source_url: pageUrl,
      remote_id: String(remote.id),
      has_explanation: Boolean(remote.hasExplanation),
      explanation_preview: String(remote.explanationPreview || ""),
      mapping_checks: { text_matches: textMatches, answer_matches: answerMatches },
      retrieved_at: retrievedAt,
      sources: (remote.lawReferences || []).map((reference, index) => ({
        source_id: `tailexi-law-${index + 1}`,
        ref: `${reference.law}${reference.article}`,
        url: reference.url,
        excerpt: reference.content,
        provenance: "tailexi-public-api",
        verification_status: "third-party-mapped-current-law"
      }))
    });
  }
}

packets.sort((left, right) => left.id.localeCompare(right.id));
await mkdir(outputDir, { recursive: true });
await writeFile(packetsPath, `${packets.map(JSON.stringify).join("\n")}\n`, "utf8");
await writeFile(reportPath, `${JSON.stringify({
  generated_at: retrievedAt,
  remote_questions: Object.values(fetchedCounts).reduce((sum, count) => sum + count, 0),
  packets: packets.length,
  packets_with_law_sources: packets.filter((packet) => packet.sources.length).length,
  packets_with_explanation_preview: packets.filter((packet) => packet.explanation_preview).length,
  rejected_mappings: mismatches.length,
  text_mismatches: mismatches.filter((item) => !item.text_matches).length,
  answer_mismatches: mismatches.filter((item) => !item.answer_matches).length,
  mismatches,
  unmapped,
  fetched_counts: fetchedCounts
}, null, 2)}\n`, "utf8");

console.log(`Imported ${packets.length} source packets; law sources=${packets.filter((packet) => packet.sources.length).length}; mismatches=${mismatches.length}; unmapped=${unmapped.length}`);

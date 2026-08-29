import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDir = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const inputPath = resolve(projectDir, "pipeline/output/taiwan-bar-ai/source-packets.jsonl");
const outputPath = resolve(projectDir, "pipeline/output/taiwan-bar-ai/source-packets-audit.json");
const seed = "tw-bar-source-audit-v1";
const limit = Number(process.argv.find((value) => value.startsWith("--limit="))?.split("=")[1] || 20);

function hash(value) {
  return createHash("sha256").update(`${seed}:${value}`).digest("hex");
}

function decodeHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)));
}

function normalize(text) {
  return String(text || "").replace(/(^|\n)\s*\d+[　\s]+/g, "$1").normalize("NFKC").replace(/[\s　]+/g, "");
}

const packets = (await readFile(inputPath, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse)
  .filter((packet) => packet.sources.length && packet.mapping_checks.text_matches && packet.mapping_checks.answer_matches);
const target = packets.find((packet) => packet.id === "tw-115-tw03-052");
const random = packets.filter((packet) => packet.id !== target?.id).sort((left, right) => hash(left.id).localeCompare(hash(right.id))).slice(0, Math.max(0, limit - (target ? 1 : 0)));
const selected = target ? [target, ...random] : random;
const checks = [];

for (const packet of selected) {
  const source = [...packet.sources].sort((left, right) => hash(`${packet.id}:${left.source_id}`).localeCompare(hash(`${packet.id}:${right.source_id}`)))[0];
  try {
    const response = await fetch(source.url);
    const pageText = decodeHtml(await response.text());
    const matched = response.ok && normalize(pageText).includes(normalize(source.excerpt));
    const officialDatabase = new URL(source.url).hostname === "law.moj.gov.tw";
    checks.push({
      id: packet.id,
      source_id: source.source_id,
      ref: source.ref,
      url: source.url,
      http_status: response.status,
      official_text_contains_excerpt: matched,
      result: matched ? "passed" : response.ok && !officialDatabase ? "inconclusive-dynamic-or-format" : "failed",
      mapping_checks: packet.mapping_checks
    });
  } catch (error) {
    checks.push({ id: packet.id, source_id: source.source_id, ref: source.ref, url: source.url, error: error.message, official_text_contains_excerpt: false, mapping_checks: packet.mapping_checks });
  }
}

const passed = checks.filter((check) => check.result === "passed").length;
const inconclusive = checks.filter((check) => check.result === "inconclusive-dynamic-or-format").length;
const failed = checks.filter((check) => check.result === "failed" || check.error).length;
await writeFile(outputPath, `${JSON.stringify({ generated_at: new Date().toISOString(), seed, selected: checks.length, passed, inconclusive, failed, checks }, null, 2)}\n`, "utf8");
console.log(`Audited ${checks.length} mapped law excerpts: passed=${passed}, inconclusive=${inconclusive}, failed=${failed}`);
if (failed) process.exitCode = 1;

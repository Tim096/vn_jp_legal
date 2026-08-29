import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectDir = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const outputDir = resolve(projectDir, 'pipeline', 'output', 'taiwan-bar');
const aiOutputDir = resolve(projectDir, 'pipeline', 'output', 'taiwan-bar-ai');
const input = resolve(process.argv[2] || resolve(aiOutputDir, 'accepted.jsonl'));
const replacePublished = process.argv.includes('--replace');
const questions = JSON.parse(await readFile(resolve(outputDir, 'questions.json'), 'utf8'));
const reviewedOverrides = JSON.parse(await readFile(resolve(projectDir, 'pipeline', 'taiwan-bar-reviewed-overrides.json'), 'utf8'));
for (const question of questions) {
  const transcription = reviewedOverrides.transcription_questions?.[question.id];
  if (!transcription) continue;
  question.question = transcription.question;
  question.options = transcription.options;
  question.question_text_source = 'moex-official-pdf-reviewed-transcription';
}
const results = (await readFile(input, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const publishedPath = resolve(aiOutputDir, 'published.jsonl');
let published = [];
if (!replacePublished) {
  try {
    published = (await readFile(publishedPath, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const mergedById = new Map(published.map((result) => [result.id, result]));
for (const result of results) mergedById.set(result.id, result);
const mergedResults = [...mergedById.values()].map((result) => ({
  ...result,
  issue: String(result.issue || '').trim(),
  rule: String(result.rule || '').trim(),
  application: String(result.application || '').trim(),
  conclusion: String(result.conclusion || '').trim(),
  historical_law_note: String(result.historical_law_note || '').trim(),
  current_law_note: String(result.current_law_note || '').trim(),
  uncertainty: String(result.uncertainty || '').trim(),
  option_analysis: result.option_analysis.map((item) => ({ ...item, reason: String(item.reason || '').trim() })),
})).sort((left, right) => left.id.localeCompare(right.id));
const publishedIds = new Set(mergedResults.map((result) => result.id));
const shardDir = resolve(aiOutputDir, 'shards');
const requestById = new Map();
for (const name of (await readdir(shardDir)).filter((name) => /^part-\d+\.jsonl$/.test(name))) {
  const requests = (await readFile(resolve(shardDir, name), 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  for (const request of requests) requestById.set(request.id, request);
}
const byId = new Map(questions.map((question) => [question.id, question]));
const seen = new Set();

for (const question of questions) {
  if (publishedIds.has(question.id) || !['ai-generated', 'official-answer-only'].includes(question.explanation_source)) continue;
  const request = requestById.get(question.id);
  if (!request) throw new Error(`Cannot restore stale AI explanation without request metadata: ${question.id}`);
  question.explanation = '';
  question.law_refs = request.source_packet.map(({ ref }) => ref);
  question.law_urls = request.source_packet.map(({ url }) => url);
  question.confidence = 'high';
  question.explanation_source = 'official-answer-only';
  question.law_reference_source = request.source_packet.length ? 'ai-source-packet' : 'none';
  question.review_status = 'not-individually-reviewed';
  question.reviewed_at = '';
  question.review_result = '';
  question.explanation_url = '';
}

function formatExplanation(result) {
  const options = result.option_analysis.map(({ option, correct, reason }) =>
    `${option}${correct ? '（官方答案）' : '（非官方答案）'}：${reason}`,
  ).join('\n');
  return [
    `爭點：${result.issue}`,
    `規則：${result.rule}`,
    `本題判斷：${result.application}`,
    `逐項分析：\n${options}`,
    `歷史法提醒：${result.historical_law_note}`,
    `現行法提醒：${result.current_law_note}`,
    `不確定性：${result.uncertainty}`,
  ].join('\n\n');
}

for (const result of mergedResults) {
  if (seen.has(result.id)) throw new Error(`Duplicate result: ${result.id}`);
  seen.add(result.id);
  const question = byId.get(result.id);
  if (!question) throw new Error(`Unknown question: ${result.id}`);
  if (String(question.answer_sets) !== String(result.official_answer)) {
    throw new Error(`Official answer mismatch: ${result.id}`);
  }
  if (question.explanation_source !== 'official-answer-only' && question.explanation_source !== 'ai-generated') {
    throw new Error(`Refusing to replace non-AI explanation: ${result.id}`);
  }
  question.explanation = formatExplanation(result);
  question.law_refs = result.law_sources.map(({ ref }) => ref);
  question.law_urls = result.law_sources.map(({ url }) => url);
  question.confidence = result.confidence;
  question.explanation_source = 'ai-generated';
  question.law_reference_source = result.law_sources.length ? 'ai-source-packet' : 'none';
  question.review_status = 'ai-generated-unreviewed';
  question.reviewed_at = '';
  question.review_result = '';
  question.explanation_url = '';
}

const columns = ['id', 'chapter', 'title', 'question', 'options', 'answer', 'answer_sets', 'explanation', 'law_refs', 'law_urls', 'tags', 'confidence', 'status', 'law_as_of', 'source_tier', 'question_text_source', 'answer_source', 'explanation_source', 'law_reference_source', 'review_status', 'reviewed_at', 'review_result', 'source_url', 'answer_url', 'explanation_url', 'page_url'];
const csvEscape = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csv = [columns.join(','), ...questions.map((question) => columns.map((column) => {
  const value = Array.isArray(question[column])
    ? question[column].join(column === 'options' || column === 'law_urls' ? '\n' : ',')
    : question[column];
  return csvEscape(value);
}).join(','))].join('\n');

await writeFile(resolve(outputDir, 'questions.json'), `${JSON.stringify(questions, null, 2)}\n`, 'utf8');
await writeFile(resolve(outputDir, 'questions.csv'), `${csv}\n`, 'utf8');
await writeFile(resolve(projectDir, 'data', 'taiwan-bar-questions.csv'), `${csv}\n`, 'utf8');
await writeFile(publishedPath, `${mergedResults.map(JSON.stringify).join('\n')}\n`, 'utf8');
console.log(`Applied ${mergedResults.length} cumulative AI explanations (${results.length} rows in this input) without replacing human-reviewed content.`);

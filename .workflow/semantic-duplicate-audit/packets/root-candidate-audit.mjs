import { readFile, writeFile } from "node:fs/promises";

const primary = JSON.parse(await readFile("pipeline/output/shikakumondai.json", "utf8"));
const supplemental = JSON.parse(await readFile("pipeline/output/shikaku-dojo.json", "utf8"));

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^[アイウエオカキクケコサシスセソ]\s*[．.、]/, "")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function trigrams(value) {
  const result = new Set();
  for (let index = 0; index <= value.length - 3; index += 1) result.add(value.slice(index, index + 3));
  return result;
}

function dice(left, right) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const gram of left) if (right.has(gram)) overlap += 1;
  return (2 * overlap) / (left.size + right.size);
}

function lawTokens(question) {
  return new Set((question.law_refs || []).map((item) => normalize(item)));
}

function lawOverlap(left, right) {
  if (!left.size || !right.size) return false;
  for (const a of left) {
    for (const b of right) {
      if (a.includes(b) || b.includes(a)) return true;
    }
  }
  return false;
}

const primarySegments = primary.flatMap((question) => {
  const parts = question.question.split("\n");
  const candidates = parts.length > 1 ? parts.slice(1) : parts;
  return candidates.map((text) => ({
    id: question.id,
    text,
    grams: trigrams(normalize(text)),
    explanationGrams: trigrams(normalize(question.explanation)),
    laws: lawTokens(question)
  }));
});

const candidates = supplemental.map((question) => {
  const grams = trigrams(normalize(question.question));
  const explanationGrams = trigrams(normalize(question.explanation));
  const laws = lawTokens(question);
  let best = null;
  for (const primaryQuestion of primarySegments) {
    const questionScore = dice(grams, primaryQuestion.grams);
    const explanationScore = dice(explanationGrams, primaryQuestion.explanationGrams);
    const sameLaw = lawOverlap(laws, primaryQuestion.laws);
    const score = questionScore + (sameLaw ? 0.08 : 0) + Math.min(0.12, explanationScore * 0.2);
    if (!best || score > best.score) {
      best = {
        dojo_id: question.id,
        primary_id: primaryQuestion.id,
        score: Number(score.toFixed(4)),
        question_score: Number(questionScore.toFixed(4)),
        explanation_score: Number(explanationScore.toFixed(4)),
        same_law: sameLaw,
        dojo_question: question.question,
        primary_statement: primaryQuestion.text
      };
    }
  }
  return best;
}).sort((left, right) => right.score - left.score);

await writeFile(
  ".workflow/semantic-duplicate-audit/results/root-candidates.json",
  `${JSON.stringify(candidates, null, 2)}\n`,
  "utf8"
);

console.log(JSON.stringify({
  compared: candidates.length,
  score_080: candidates.filter((item) => item.score >= 0.8).length,
  score_065: candidates.filter((item) => item.score >= 0.65).length,
  score_050: candidates.filter((item) => item.score >= 0.5).length,
  top: candidates.slice(0, 15).map(({ dojo_id, primary_id, score, question_score, same_law }) => ({ dojo_id, primary_id, score, question_score, same_law }))
}, null, 2));

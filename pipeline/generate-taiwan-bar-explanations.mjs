import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const projectDir = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const questionsPath = resolve(projectDir, "pipeline/output/taiwan-bar/questions.json");
const outputDir = resolve(projectDir, "pipeline/output/taiwan-bar-ai");
const seed = arg("seed") || "tw-bar-ai-pilot-v1";
const limit = Number(arg("limit") || 80);
const validatePath = arg("validate");
const packetsPath = arg("source-packets");
const acceptedOutputPath = arg("accepted-output");
const rejectedOutputPath = arg("rejected-output");
const full = process.argv.includes("--full");
const includeAiGenerated = process.argv.includes("--include-ai-generated");

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || "";
}

function numberOf(question) {
  return Number(question.id.split("-").at(-1));
}

function answerLabel(value) {
  if (value === "*") return "全部選項均給分";
  return value.split("|").map((set) => set.split("+").map((item) => String.fromCharCode(64 + Number(item))).join("+"))
    .join(" 或 ");
}

function classify(question) {
  const text = `${question.question}\n${question.options.join("\n")}`;
  const reasons = [];
  if (/[+|]/.test(question.answer_sets) || question.answer_sets === "*") reasons.push("複數、替代或全部給分答案");
  if (question.options.length === 5) reasons.push("五選項");
  if (/承上題|題組/.test(text)) reasons.push("題組依賴");
  if (/最高法院|最高行政法院|憲法法庭|大法官|決議|判例|裁定|判決/.test(text)) reasons.push("實務見解");
  if (Number(question.tags[0]) <= 110) reasons.push("較早年度法規版本");
  if (question.chapter === "tw04" && numberOf(question) > 60) reasons.push("法學英文");
  if (/何者錯誤|何者不正確|何者有誤/.test(text)) reasons.push("反向設問");
  return { tier: reasons.some((reason) => /題組|實務|較早年度|複數|五選項/.test(reason)) ? "strong-review" : "cheap", reasons };
}

function stableHash(question) {
  return createHash("sha256").update(`${seed}:${question.chapter}:${question.id}`).digest("hex");
}

function selectBalanced(questions) {
  const perChapter = Math.max(1, Math.floor(limit / 4));
  const selected = [];
  for (const chapter of ["tw01", "tw02", "tw03", "tw04"]) {
    const candidates = questions.filter((question) => question.chapter === chapter)
      .sort((left, right) => stableHash(left).localeCompare(stableHash(right)));
    const risky = candidates.filter((question) => classify(question).tier === "strong-review");
    const cheap = candidates.filter((question) => classify(question).tier === "cheap");
    const riskyCount = Math.ceil(perChapter / 2);
    selected.push(...risky.slice(0, riskyCount), ...cheap.slice(0, perChapter - riskyCount));
  }
  return selected.slice(0, limit);
}

async function readJsonLines(path) {
  if (!path) return [];
  const text = await readFile(resolve(projectDir, path), "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function sourcePacket(question, explicit) {
  const sources = explicit?.sources?.length ? explicit.sources : question.law_refs.map((ref, index) => ({
    source_id: `candidate-${index + 1}`,
    ref,
    url: question.law_urls[index] || "",
    excerpt: "",
    provenance: question.law_reference_source || "unknown",
    verification_status: "inferred-unverified"
  }));
  return sources.map((source, index) => ({
    source_id: source.source_id || `source-${index + 1}`,
    ref: String(source.ref || "").trim(),
    url: String(source.url || "").trim(),
    excerpt: String(source.excerpt || "").trim(),
    provenance: String(source.provenance || "unknown").trim(),
    verification_status: source.verification_status || (source.excerpt ? "text-verified" : "inferred-unverified")
  })).filter((source) => source.ref && /^https:\/\//.test(source.url));
}

function buildTask(question, explicitPacket) {
  const classification = classify(question);
  const sources = sourcePacket(question, explicitPacket);
  const options = question.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join("\n");
  const allCreditInstruction = question.answer_sets === "*"
    ? "本題官方答案為全部給分。correct 欄位仍須全部為 true 以符合判分，但解析必須明說全部給分不代表每個選項在法律上均正確；逐項 reason 要分開寫實質法律判斷與官方給分例外。"
    : "";
  return {
    id: question.id,
    stage: "draft",
    model_tier: classification.tier,
    risk_reasons: classification.reasons,
    official_answer: question.answer_sets,
    source_packet: sources,
    prompt: [
      allCreditInstruction,
      "你是台灣司法官／律師第一試的解析草稿助理。只輸出 JSON，不要 Markdown。",
      "考選部官方答案不可更改。必須寫爭點、規則、涵攝及每一選項的理由，不能只把正確答案換句話說。",
      "law_sources 只能填 source_packet 既有的 source_id；不得自行產生法條名稱、條號或 URL。",
      "text-verified 才是已逐題核對法源。其他 verification_status 都只能標成未逐題核對；confidence 必須為 low，uncertainty 必須明說來源與限制。",
      "source_packet 為空時仍可寫概念解析，但 law_sources 必須為空、confidence 必須為 low，uncertainty 必須包含『未完成法源核對』。",
      "舊年度題目須區分應試年度法與現行法；無資料時明說未核對。source_type 固定為 ai-generated；explanation_source_label 固定為 AI 產生（未經律師逐題審核）。",
      `題目 ID：${question.id}`,
      `應試年度：民國 ${question.tags[0]} 年`,
      `考選部官方答案：${answerLabel(question.answer_sets)}（資料值：${question.answer_sets}）`,
      `題目：${question.question}`,
      `選項：\n${options}`,
      `source_packet：\n${JSON.stringify(sources, null, 2)}`,
      "禁止使用泛用模板、提及『由官方答案反推』或為湊字數重複 rule/application；application 必須逐題涵攝具體事實，option_analysis 每項只說明該選項的關鍵差異。",
      "輸出欄位：id, official_answer, issue, rule, application, option_analysis, law_sources, historical_law_note, current_law_note, uncertainty, confidence, source_type, explanation_source_label。",
      "option_analysis 依 A、B、C、D、E 順序，每項含 option、correct、reason；law_sources 每項只含 source_id、supports；confidence 只能是 high、medium、low。"
    ].join("\n\n")
  };
}

function validateResult(result, question, sources) {
  const errors = [];
  if (!question) return ["unknown id"];
  if (result.official_answer !== question.answer_sets) errors.push("official answer changed");
  if (result.source_type !== "ai-generated") errors.push("source_type must be ai-generated");
  if (result.explanation_source_label !== "AI 產生（未經律師逐題審核）") errors.push("invalid explanation source label");
  for (const field of ["issue", "rule", "application"]) if (!String(result[field] || "").trim()) errors.push(`missing ${field}`);
  if (!Array.isArray(result.option_analysis) || result.option_analysis.length !== question.options.length) errors.push("option coverage mismatch");
  if (Array.isArray(result.option_analysis)) {
    const questionText = String(question.question || "").normalize("NFKC");
    const expected = question.options.map((_, index) => String.fromCharCode(65 + index));
    const acceptedChoices = question.answer_sets === "*"
      ? new Set(question.options.map((_, index) => index + 1))
      : new Set(String(question.answer_sets).split(/[+|]/).map(Number));
    const asksForIncorrect = /(?:何者|何項|何種|何人|哪一項|那一項|哪一文句|那一文句|何一文句)[^？?。]{0,25}(?:錯誤|不正確|有誤|違反|違法|不合法|不適法|不是|非屬|非|不屬於|不具有|不符合|不符|不妥|不會|不能|不得)/.test(questionText)
      || /(?:不得|不能|不會)[^？?。]{0,20}(?:何者|何項|何種|哪一項|那一項|哪一文句|那一文句)/.test(questionText)
      || /(?:which|what)[^?.]{0,60}\b(?:NOT|INCORRECT|FALSE)\b/i.test(questionText)
      || /\bEXCEPT\b[^?.]{0,20}[?.]?$/i.test(questionText.trim());
    const asksForFalseStatement = /(?:何者|何項|哪一項|那一項)[^？?。]{0,12}(?:錯誤|不正確|有誤)/.test(questionText)
      || /(?:which|what)[^?.]{0,60}\b(?:INCORRECT|FALSE)\b/i.test(questionText);
    const isCombinationQuestion = question.options.filter((option) => (String(option).match(/[①-⑳]/g) || []).length >= 2).length >= 2;
    if (expected.some((option, index) => result.option_analysis[index]?.option !== option)) errors.push("option order mismatch");
    if (result.option_analysis.some((item, index) => Boolean(item.correct) !== acceptedChoices.has(index + 1))) errors.push("option correctness flags differ from official answer");
    if (result.option_analysis.some((item) => !String(item.reason || "").trim())) errors.push("empty option reason");
    if (question.answer_sets === "*" && result.option_analysis.some((item) => !/(?:一律|全部|全數).{0,8}給分|官方.{0,12}給分/.test(String(item.reason || "")))) {
      errors.push("all-credit option reason does not disclose official scoring exception");
    }
    if (question.answer_sets !== "*" && (!asksForIncorrect || isCombinationQuestion) && result.option_analysis.some((item) => {
      const reason = String(item.reason || "").trim()
        .replace(/^[A-E]\s*[.、：:]?\s*/, "")
        .replace(/^(?:該|本項)?\s*(?:敘述|選項|所述)?\s*(?:為|是)?\s*/, "");
      const statementIsIncorrect = !item.correct;
      return statementIsIncorrect ? /^(正確|無誤)/.test(reason) : /^(錯誤|不正確|有誤|錯在)/.test(reason);
    })) errors.push("option reason polarity contradicts question and official answer");
    if (question.answer_sets !== "*" && asksForFalseStatement && !isCombinationQuestion && result.option_analysis.some((item) => {
      const reason = String(item.reason || "").trim()
        .replace(/^[A-E]\s*[.、：:]?\s*/, "")
        .replace(/^(?:該|本項)?\s*(?:敘述|選項|所述)?\s*(?:為|是)?\s*/, "");
      const statementIsIncorrect = item.correct;
      return statementIsIncorrect ? /^(正確|無誤)/.test(reason) : /^(錯誤|不正確|有誤|錯在)/.test(reason);
    })) errors.push("reverse-question reason polarity contradicts official answer");
    if (isCombinationQuestion && result.option_analysis.some((item, index) => {
      if (!item.correct) return false;
      const marks = [...new Set(String(question.options[index] || "").match(/[①-⑳]/g) || [])];
      const reason = String(item.reason || "");
      return marks.some((mark) => !reason.includes(mark));
    })) errors.push("selected combination reason does not address every component");
  }
  if (!Array.isArray(result.law_sources)) errors.push("law_sources must be an array");
  const allowed = new Map(sources.map((source) => [source.source_id, source]));
  if (Array.isArray(result.law_sources)) {
    if (result.law_sources.some((source) => !allowed.has(source.source_id) || !String(source.supports || "").trim())) errors.push("law source not in source packet");
    const usesUnverified = result.law_sources.some((source) => allowed.get(source.source_id)?.verification_status !== "text-verified");
    if (usesUnverified && (result.confidence !== "low" || !/第三方|推測|未逐題核對|未核對|未完成法源核對/.test(result.uncertainty || ""))) errors.push("unverified source disclosure missing");
  }
  if (!sources.length && ((result.law_sources || []).length || result.confidence !== "low" || !/未完成法源核對/.test(result.uncertainty || ""))) errors.push("no-source disclosure missing");
  if (!/^(high|medium|low)$/.test(result.confidence || "")) errors.push("invalid confidence");
  if (Number(question.tags[0]) <= 114 && !String(result.historical_law_note || "").trim()) errors.push("missing historical law note");
  const body = `${result.issue || ""}${result.rule || ""}${result.application || ""}${result.conclusion || ""}${(result.option_analysis || []).map((item) => item.reason || "").join("")}`;
  if (String(result.rule || "").trim() === "應以相關法規的構成要件、適用主體、程序時點及法律效果逐項判斷，不能以抽象結論取代要件涵攝。") {
    errors.push("generic filler text");
  }
  if (question.answer_sets === "*" && !/(?:\u4e0d\u7b49\u540c(?:\u65bc)?|\u4e0d\u4ee3\u8868|\u4e0d\u80fd\u628a|\u4e0d\u5f97\u628a).{0,80}(?:\u5404\u9805|\u5168\u90e8|\u5168\u9078|\u5168\u6578|\u6240\u6709).{0,80}(?:\u5747\u70ba\u6b63\u78ba|\u5747\u70ba\u6cd5\u5f8b\u4e0a\u6b63\u78ba|\u5747\u6b63\u78ba|\u90fd\u6b63\u78ba|\u7121\u722d\u8b70|\u6cd5\u5f8b\u4e0a\u5747\u6b63\u78ba|\u9010\u9805\u6b63\u8aa4)/.test(body)) {
    errors.push("all-credit explanation conflates official scoring with substantive correctness");
  }
  if (body.length < 220) errors.push("explanation too short");
  if ([
    "本題的判斷要把題幹事實、法律要件、程序階段與法律效果逐項對照",
    "判斷時須把題幹事實、法律要件與法律效果逐一對照",
    "應先辨識題幹中的角色、程序階段與時間順序",
    "不能只抓住單一關鍵字，也不能把不同制度的法律效果互相替代",
    "不能僅由答案字母反推理由",
    "判斷時先確認法律關係與請求或抗辯的構成要件",
    "題幹已提供的事實應逐項套入上述要件",
    "依此比對，官方答案集合",
    "判斷應先確認法律關係，再依主體、行為、期間、程序與例外要件逐項檢驗",
    "把題幹事實套入要件後，官方答案集合",
    "將題幹事實與構成要件逐項對照，本項",
    "中各法律要件與效果的對照",
    "差異在於其要件、程序或法律效果未能與題幹相符",
    "差異在於其要件或效果與題幹相符",
    "分別落在題目要求的正確或成立範圍",
    "本段只使用 packet 摘錄可支持的方向",
    "應將C項視為題目要求的正確敘述",
    "題幹要求判斷主體、行為與法律效果的連結",
    "題幹的時間順序、身分及程序位置均會影響結論",
    "因此不能只看選項結論，必須辨識其具體法律要件",
    "這些規則要與題幹的主體、時間或程序位置相互核對",
    "符合答案方向",
    "題示法源未支持該項所採的法律前提",
    "其他選項分別在法律主體、成立要件、程序、期限或效果上",
    "應逐一核對主體、要件、程序、期限及法律效果"
  ].some((phrase) => body.includes(phrase)) || /應將[A-E]項視為題目要求的(?:正確|錯誤)敘述/.test(body)) errors.push("generic filler text");
  const application = String(result.application || "");
  const optionReasons = (result.option_analysis || []).map((item) => String(item.reason || ""));
  if (/選項逐項為/.test(application)) errors.push("application repeats question options instead of applying law");
  if (optionReasons.some((reason) => /相符或不符|結合本題.{0,120}該項與題目所問法律效果/.test(reason))) {
    errors.push("option reason gives no concrete legal determination");
  }
  if (question.answer_sets !== "*" && /官方答案資料值為|相符性，須依本題事實判斷|此項取捨與官方答案集合一致|應依題目所涉法律規範檢驗主體|各選項理由已就其文字與題幹要件的差異分別說明|題幹先確定的事實是|本題的法律判斷要把這些事實中的主體、行為、時間及程序位置套入|來源規範設的是|本題不是把答案字母當成理由|只是該涵攝結果|關鍵法律命題是選項所設定的主體、行為與法律效果|本項命題把來源規範的要件或效果改變了|規定「」/.test(body)) {
    errors.push("explanation defers to official answer instead of giving legal reasoning");
  }
  if (/本題tw-\d{3}-tw\d{2}-\d{3}的(?:法律規則|涵攝)|須將題示主體、行為、時間與程序套入規則|依各選項主張的法律效果逐一判斷|在本題事實下，該法律效果(?:不)?成立/.test(body)) {
    errors.push("explanation uses a mechanical legal-effect template");
  }
  if (/(?:的爭點是|的爭點集中於).{0,260}(?:必須|須)(?:界定|定位|釐清|區分)(?:法律關係|主體|請求|各選項)|(?:規範判斷要|應依其制度|適用規範時).{0,180}(?:主體資格|行為主體|法律關係).{0,180}(?:成立要件|法律要件|程序時點)|(?:題示內容|題示事實|事實摘要).{0,500}逐項(?:比較|比對)選項.{0,180}(?:判分|官方答案)|(?:本列保留官方判分|才能理解判分|僅是官方核對基準|本列法源仍未逐題核實)|專屬法律規則|具體事實涵攝|之規範焦點為.{0,500}應依該題涉及|的事實涵攝是.{0,500}題幹所示人物|的核心規範是.{0,500}本案須依該題|題幹明確設定.{0,500}本題事實直接決定|專屬法理|特別法具體規則|具體涵攝|依前述要件，官方答案|本題法規判斷須確認|具體法律規則：本題適用|依題示人物、標的、行為及時間先後|依題示人物、標的及程序階段判斷選項|本案(?:刑事|行政|民事)事實是.{0,500}；(?:依|由)(?:行為人的分工|處分作成機關|當事人身分)/.test(body)) {
    errors.push("explanation restates the question without substantive legal analysis");
  }
  return errors;
}

function enrich(result, sources) {
  const byId = new Map(sources.map((source) => [source.source_id, source]));
  return { ...result, law_sources: result.law_sources.map(({ source_id: id, supports }) => ({
    source_id: id,
    ref: byId.get(id).ref,
    url: byId.get(id).url,
    supports,
    provenance: byId.get(id).provenance,
    verification_status: byId.get(id).verification_status
  })) };
}

function substantiveSentences(result) {
  return [result.issue, result.rule, result.application]
    .flatMap((field) => String(field || '').split(/[。！？!?]/))
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 20);
}

async function prepare() {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
  const questions = JSON.parse(await readFile(questionsPath, "utf8"));
  const packets = new Map((await readJsonLines(packetsPath)).map((packet) => [packet.id, packet]));
  const candidates = questions.filter((question) => question.explanation_source === "official-answer-only"
    || (includeAiGenerated && question.explanation_source === "ai-generated"));
  const selected = full ? [...candidates].sort((left, right) => stableHash(left).localeCompare(stableHash(right))) : selectBalanced(candidates);
  const tasks = selected.map((question) => buildTask(question, packets.get(question.id)));
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "requests.jsonl"), `${tasks.map(JSON.stringify).join("\n")}\n`, "utf8");
  await writeFile(resolve(outputDir, "manifest.json"), `${JSON.stringify({
    generated_at: new Date().toISOString(), seed, mode: full ? "full" : "pilot", requested: full ? candidates.length : limit, selected: tasks.length,
    cheap: tasks.filter((task) => task.model_tier === "cheap").length,
    strong_review: tasks.filter((task) => task.model_tier === "strong-review").length,
    inferred_source_packets: tasks.filter((task) => task.source_packet.some((source) => source.verification_status === "inferred-unverified")).length,
    third_party_mapped_source_packets: tasks.filter((task) => task.source_packet.some((source) => source.verification_status === "third-party-mapped-current-law")).length,
    verified_source_packets: tasks.filter((task) => task.source_packet.some((source) => source.verification_status === "text-verified")).length,
    ids: tasks.map((task) => task.id)
  }, null, 2)}\n`, "utf8");
  console.log(`Prepared ${tasks.length} tasks: cheap=${tasks.filter((task) => task.model_tier === "cheap").length}, strong-review=${tasks.filter((task) => task.model_tier === "strong-review").length}`);
}

async function validate() {
  const questions = JSON.parse(await readFile(questionsPath, "utf8"));
  const byId = new Map(questions.map((question) => [question.id, question]));
  const packets = new Map((await readJsonLines(packetsPath)).map((packet) => [packet.id, packet]));
  const results = await readJsonLines(validatePath);
  const partMatch = String(validatePath).match(/(?:^|[\\/])(?:luna-(?:full|reviewed)-)?part-(\d{3})\.jsonl$/);
  const batchErrors = [];
  const expectedSourcesById = new Map();
  if (partMatch) {
    const expected = await readJsonLines(`pipeline/output/taiwan-bar-ai/shards/part-${partMatch[1]}.jsonl`);
    for (const request of expected) expectedSourcesById.set(request.id, request.source_packet || []);
    const expectedIds = new Set(expected.map(({ id }) => id));
    const resultIds = results.map(({ id }) => id);
    const actualIds = new Set(resultIds);
    const duplicates = [...actualIds].filter((id) => resultIds.filter((candidate) => candidate === id).length > 1);
    const missing = [...expectedIds].filter((id) => !actualIds.has(id));
    const extra = [...actualIds].filter((id) => !expectedIds.has(id));
    if (results.length !== expected.length) batchErrors.push(`expected ${expected.length} rows, got ${results.length}`);
    if (duplicates.length) batchErrors.push(`duplicate ids: ${duplicates.join(', ')}`);
    if (missing.length) batchErrors.push(`missing ids: ${missing.join(', ')}`);
    if (extra.length) batchErrors.push(`extra ids: ${extra.join(', ')}`);
  }
  const sentenceOwners = new Map();
  for (const result of results) {
    for (const sentence of new Set(substantiveSentences(result))) {
      if (!sentenceOwners.has(sentence)) sentenceOwners.set(sentence, new Set());
      sentenceOwners.get(sentence).add(result.id);
    }
  }
  const repeatedThreshold = Math.max(5, Math.ceil(results.length * 0.5));
  const repeatedSentences = new Set([...sentenceOwners]
    .filter(([, owners]) => owners.size >= repeatedThreshold)
    .map(([sentence]) => sentence));
  const accepted = [];
  const rejected = [];
  if (batchErrors.length) rejected.push({ id: "__batch__", errors: batchErrors });
  for (const result of batchErrors.length ? [] : results) {
    const question = byId.get(result.id);
    const embeddedSources = (result.law_sources || []).filter((source) => source.ref && /^https:\/\//.test(source.url || ""));
    const explicitPacket = packets.get(result.id);
    const sources = expectedSourcesById.get(result.id)
      || (explicitPacket?.sources?.length ? sourcePacket(question, explicitPacket)
        : embeddedSources.length ? embeddedSources : question ? sourcePacket(question) : []);
    const errors = validateResult(result, question, sources);
    if (substantiveSentences(result).some((sentence) => repeatedSentences.has(sentence))) errors.push("batch-repeated filler sentence");
    if (errors.length) rejected.push({ id: result.id, errors });
    else accepted.push(enrich(result, sources));
  }
  const acceptedPath = acceptedOutputPath ? resolve(projectDir, acceptedOutputPath) : resolve(outputDir, "accepted.jsonl");
  const rejectedPath = rejectedOutputPath ? resolve(projectDir, rejectedOutputPath) : resolve(outputDir, "rejected.json");
  await Promise.all([
    mkdir(dirname(acceptedPath), { recursive: true }),
    mkdir(dirname(rejectedPath), { recursive: true })
  ]);
  await writeFile(acceptedPath, accepted.length ? `${accepted.map(JSON.stringify).join("\n")}\n` : "", "utf8");
  await writeFile(rejectedPath, `${JSON.stringify(rejected, null, 2)}\n`, "utf8");
  console.log(`Validated ${results.length}: accepted=${accepted.length}, rejected=${rejected.length}`);
  if (rejected.length) process.exitCode = 1;
}

if (validatePath) await validate();
else await prepare();

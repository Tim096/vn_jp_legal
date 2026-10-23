import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const makeNode = () => ({ textContent: '', firstChild: { textContent: '' }, hidden: false, open: false, value: 'all', children: [],
  classList: { toggle() {}, add() {}, remove() {} }, append(...items) { this.children.push(...items); },
  replaceChildren(...items) { this.children = items; }, setAttribute() {}, addEventListener() {},
  querySelectorAll() { return []; }, showModal() { this.open = true; }, close() { this.open = false; }, scrollIntoView() {} });
const nodes = new Map();
const node = selector => { if (!nodes.has(selector)) nodes.set(selector, makeNode()); return nodes.get(selector); };
const oldKey = 'bijihou2.progress.v1';
const oldRecord = JSON.stringify({ 'ch01-0001': { answeredAt: 4, attempts: 7, correct: true, notebook: 'known' } });
const storage = new Map([[oldKey, oldRecord]]);
const context = vm.createContext({ console, Date, Math, URLSearchParams, Map, Set,
  window: {}, navigator: {}, location: { search: '?bank=jp-ibt-cbt-4' },
  setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  document: { querySelector: node, querySelectorAll: () => [], createElement: makeNode, createTextNode: text => ({ textContent: text }) },
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) } });
for (const path of ['../config.js','../data/jp-field-map.js','../data/study-topics.js','../study-coach.js','../weakness.js']) vm.runInContext(await read(path),context);
vm.runInContext((await read('../app.js')).replace(/\ninitializeApp\(\);\s*$/, ''),context);
const run = code => vm.runInContext(code,context);
context.raw = JSON.parse(await read('./output/whr-2026/mock4.json'));
run(String.raw`state.questions = raw.map(q => normalizeQuestion({ ...q, options: q.options.join('\n'), question_underlines: JSON.stringify(q.question_underlines) }));
render = () => {}; renderMockResult = () => {}; updateProgressSummary = () => {}; updateTodaySummary = () => {}; updateNotebookCounts = () => {};
state.progress = {}; state.history = []; state.chapters = new Map();`);
const coach = context.window.StudyCoach, mapping = context.window.JP_FIELD_MAP.banks['jp-ibt-cbt-4'];
const questions = run('state.questions');
const result = coach.diagnostic(questions, {}, mapping, items => [...items]);
assert.equal(result.questions.length, 40);
assert.equal(new Set(result.questions.map(q => q.id)).size,40);
const fields = Array.from({length:6}, (_,i) => result.questions.filter(q => mapping[q.id] === i).length);
assert.ok(fields.every(n => n >= 4));
const first = questions[0].id;
assert.equal(coach.diagnostic(questions, { history: [{ id:first }] }, mapping, x => x).questions.length,0);
assert.equal(coach.diagnostic(questions, { progress: { [first]: { answeredAt:1 } } }, mapping, x=>x).questions.length,0);
assert.equal(coach.diagnostic(questions.map(q=>({...q,options:['○','×']})),{},mapping,x=>x).questions.length,0);
assert.equal(coach.diagnosticPool([{...questions[0], allCredit:true}],{},mapping).length,0);
assert.equal(coach.diagnostic(questions,{},Object.fromEntries(questions.map(q=>[q.id,0])),x=>x).questions.length,0);
run('state.field = 1; state.mode = "all"; buildDeck();');
assert.ok(run('state.deck').every(q=>mapping[q.id]===1));
run('state.progress[state.deck[0].id] = { weak:true, answeredAt:1 }; state.mode="weak"; buildDeck();');
assert.equal(run('state.deck.length'),1);
run('state.progress = {}; state.field="all"; startMock({kind:"diagnostic"});');
assert.equal(run('state.mock.kind'),'diagnostic');
assert.equal(run('state.deck.length'),40);
const ids = JSON.stringify(run('state.mock.questionIds'));
run('state.mock.answers[state.mock.questionIds[0]] = questionMap().get(state.mock.questionIds[0]).answer; persistActiveMock(); state.mock=null;');
assert.equal(run('restoreActiveMock()'),true);
assert.equal(JSON.stringify(run('state.mock.questionIds')),ids,'reload preserves diagnostic paper');
run('finishMock(true);');
assert.equal(run('state.mockResults.at(-1).kind'),'diagnostic');
assert.equal(run('state.mockResults.at(-1).total'),40);
assert.equal(run('state.mockResults.at(-1).correct'),1);
assert.equal(run('state.history.length'),1,'unanswered questions do not create false practice answers');
assert.equal(storage.get(oldKey),oldRecord,'legacy bank records must be byte-for-byte unchanged');
// The legacy Japanese bank must also keep skipped diagnostic questions out of progress.
run('state.bank="jp-business-law"; STORAGE_KEYS=storageKeysForBank(state.bank); hydrateStudyState(); state.mock={kind:"diagnostic", questionIds:state.questions.map(q=>q.id), answers:{}, submitted:false}; finishMock(true);');
assert.equal(run('state.history.length'),0);
assert.equal(run('Object.keys(state.progress).length'),1);
assert.equal(storage.get(oldKey),oldRecord);
assert.equal(run('state.mockResults.at(-1).kind'),'diagnostic');
run('renderMockHistory();');
assert.deepEqual(nodes.get('#mockHistory').children.filter(n=>n.textContent.includes('·')).map(n=>n.textContent),
  ['実力診断 · 未回答問題','練習模試 · AI練習']);
console.log(JSON.stringify({ unique:40, fieldCounts:fields, complex:result.complex, filters:true, unseenShortageBlocked:true,
  reloadPreservesPaper:true, diagnosisSeparate:true, legacyProgressUnchanged:true },null,2));

// New topics are an overlay; every original ID has metadata and every book link resolves.
const topics = context.window.STUDY_TOPICS;
assert.equal(Object.values(topics.banks).reduce((n,b)=>n+Object.keys(b).length,0),1118);
const materialIds = new Set(JSON.parse(await read('../data/whr-2026-materials.json')).items.map(item=>item.id));
for (const bank of Object.keys(topics.banks)) {
  assert.deepEqual(Object.keys(topics.banks[bank]).sort(),Object.keys(context.window.JP_FIELD_MAP.banks[bank]).sort());
  for (const m of Object.values(topics.banks[bank])) assert.ok(m.topicIds.every(id=>topics.topics[id]));
}
for (const books of Object.values(topics.books)) for (const book of books) assert.ok(materialIds.has(book.id));

const now = Date.now(), q = questions.slice(0,15), meta = Object.fromEntries(q.map(item=>[item.id,{topicIds:['test']}])) ;
const snapshot = {progress:{},history:[]};
q.slice(0,4).forEach(item=>snapshot.progress[item.id]={due:now-100,answeredAt:now-86400000,weak:true});
q.slice(4,8).forEach(item=>snapshot.progress[item.id]={due:now+100,answeredAt:now-86400000,weak:true});
snapshot.history.push({id:q[0].id,at:now,answered:true});
const personal = coach.adaptive(q,snapshot,meta,now);
assert.equal(personal.length,10);
assert.equal(new Set(personal.map(q=>q.id)).size,10);
assert.ok(!personal.some(item=>item.id===q[0].id),'exclude questions answered today');
assert.ok(personal.some(item=>!snapshot.progress[item.id]),'retain new questions');
assert.equal(coach.topicStats(q,{progress:{}},meta)[0].answered,0,'unanswered is not wrong');
assert.equal(coach.topicStats(q,{progress:{[q[0].id]:{answeredAt:2,correct:false}},history:[{id:q[0].id,at:2,correct:false,mode:'mock'}]},meta)[0].answered,0,'ambiguous old mocks excluded');
assert.equal(coach.topicStats(q,{progress:{},history:[{id:q[0].id,at:2,correct:true,answered:true,mode:'all'}]},meta)[0].correct,1,'history-only records count');

context.hard = JSON.parse(await read('../data/ai-hard-mocks-2026.json'));
run('state.bank="jp-ibt-cbt-4"; STORAGE_KEYS=storageKeysForBank(state.bank); state.aiMockExams=normalizeAiMockData(hard); state.progress={}; state.history=[];');
const normalized = run('state.aiMockExams[0].questions');
assert.equal(normalized.length,12);
for (const question of normalized) {
  assert.equal(run(`questionAccepts(questionMap().get('${question.id}'),${JSON.stringify(question.answer)})`),true);
  if (question.answer.length>1) assert.equal(run(`questionAccepts(questionMap().get('${question.id}'),[${question.answer[0]}])`),false,'partial multiple selection must be wrong');
}
const mixed = run('createAiMockQuestions("ai-hard-2026-01")');
assert.equal(mixed.length,40); assert.equal(new Set(mixed.map(q=>q.id)).size,40);
assert.equal(mixed.filter(q=>q.id.startsWith('aihard26-')).length,12,'keep every new question');
for (let i=0;i<6;i++) assert.ok(mixed.filter(q=>mapping[q.id]===i).length>=4);
run('state.mode="hard"; state.topic="all"; buildDeck();');
assert.equal(run('state.deck.length'),12);
run('recordAttempt(state.deck[0],false,2,"hard"); state.progress[state.deck[0].id].errorReason="exception"; recordAttempt(state.deck[0],false,2,"hard",{previous:null,historyIndex:0},"unknown");');
assert.equal(run('state.history.length'),1);
assert.equal(run('state.history[0].errorReason'),'exception');
assert.equal(run('state.progress[state.deck[0].id].errorReason'),'exception');
vm.runInContext(await read('../supabase/functions/_shared/study-snapshot.js'),context);
const merged = run('mergeStudySnapshots({version:4,updatedAt:1,banks:{"jp-ibt-cbt-4":{progress:{},history:[]}}},{version:4,updatedAt:2,banks:{"jp-ibt-cbt-4":{progress:state.progress,history:state.history}}})');
assert.equal(merged.banks['jp-ibt-cbt-4'].history[0].errorReason,'exception');
console.log(JSON.stringify({topicCoverage:1118,adaptiveUnique:10,hardNew:12,adaptiveMock:40,multipleAnswers:true,errorReasonSync:true}));

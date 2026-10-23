import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import vm from 'node:vm';

const source = await readFile(new URL('../supabase/functions/study-api/index.ts',import.meta.url),'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261023000000_learner_device_sessions.sql',import.meta.url),'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const legacyToken = 'a'.repeat(64);
const learner = {id:'test-learner',account:'isolated-test',display_name:'Isolated test',token_hash:hash(legacyToken)};
const sessions = [], payload = {version:4,banks:{'jp-business-law':{progress:{old:{answeredAt:1}},history:[]}}};
const before = JSON.stringify(payload);
const service = {from(table) {
  let field,value,update,insert;
  const query = {
    select() {return query;}, eq(k,v) {field=k;value=v;return query;},
    update(data) {update=data;return query;}, insert(data) {insert=data;return query;},
    async maybeSingle() {
      if (table==='learners') return {data:learner[field]===value ? {...learner}:null,error:null};
      return {data:sessions.find(s=>s[field]===value) || null,error:null};
    },
    async single() {assert.equal(learner[field],value);Object.assign(learner,update);return {data:{...learner},error:null};},
    then(resolve) {assert.equal(table,'learner_sessions');sessions.push(insert);return Promise.resolve({error:null}).then(resolve);}
  }; return query;
}};
const context=vm.createContext({service,sha256:async value=>hash(value),randomToken:()=>randomBytes(32).toString('hex'),
  learnerForAccount:async account=>account===learner.account ? {...learner}:null,
  snapshotForLearner:async()=>payload,respond:(_request,data,status=200)=>({status,data}),Date});
const tokenLookup=source.slice(source.indexOf('async function learnerForToken('),source.indexOf('async function learnerForAccount(')).replace('token: unknown','token');
const loginBlock=source.slice(source.indexOf('    if (action === "login-account")'),source.indexOf('    if (action === "create-invite")'));
vm.runInContext(tokenLookup+`\nasync function login(body) {const action='login-account',request={};${loginBlock}}`,context);
const [phone,desktop]=await Promise.all([context.login({account:learner.account}),context.login({account:learner.account})]);
assert.equal(phone.status,200);assert.equal(desktop.status,200);
assert.notEqual(phone.data.token,desktop.data.token);
for (const token of [legacyToken,phone.data.token,desktop.data.token]) assert.equal((await context.learnerForToken(token)).id,learner.id);
assert.equal(await context.learnerForToken('b'.repeat(64)),null);
assert.equal(await context.learnerForToken('invalid'),null);
assert.equal(sessions.length,2);
assert.ok(sessions.every(session=>session.token_hash!==phone.data.token && session.token_hash!==desktop.data.token));
assert.equal(JSON.stringify(payload),before,'login never changes study records');
assert.equal(learner.token_hash,hash(legacyToken),'existing devices retain their session');
assert.match(migration,/enable row level security/);
assert.match(migration,/revoke all[\s\S]*from anon, authenticated/);
assert.match(migration,/references public\.learners\(id\) on delete cascade/);
assert.doesNotMatch(migration,/update public\.(learners|study_snapshots)|delete from/);
console.log(JSON.stringify({independentLogins:2,bothTokensValid:true,legacyTokenValid:true,unknownTokenRejected:true,hashedTokensOnly:true,studyRecordsUnchanged:true,migrationAdditive:true}));

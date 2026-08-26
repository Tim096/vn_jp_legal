import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../cloud-sync.js", import.meta.url), "utf8");
const studyHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../admin.js", import.meta.url), "utf8");
const adminHtml = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const studyApiSource = await readFile(new URL("../supabase/functions/study-api/index.ts", import.meta.url), "utf8");
const accountMigration = await readFile(new URL("../supabase/migrations/20260826000000_account_login.sql", import.meta.url), "utf8");

class FakeElement {
  constructor() {
    this.dataset = {};
    this.hidden = true;
    this.value = "";
    this.textContent = "";
    this.disabled = false;
    this.listeners = new Map();
  }

  addEventListener(name, handler) {
    this.listeners.set(name, handler);
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }
}
function createCloudContext({ appConfig, hash = "", stored = {}, responses = {}, online = true }) {
  const storage = new Map(Object.entries(stored));
  const requests = [];
  const elements = new Map([
    ["#cloudStatus", new FakeElement()],
    ["#cloudStatusText", new FakeElement()],
    ["#pairingDialog", new FakeElement()],
    ["#pairingForm", new FakeElement()],
    ["#learnerAccount", new FakeElement()],
    ["#pairingSubmit", new FakeElement()],
    ["#pairingError", new FakeElement()]
  ]);
  const documentListeners = new Map();
  const windowListeners = new Map();
  const navigator = { onLine: online };
  const window = {
    APP_CONFIG: appConfig,
    addEventListener: (name, handler) => windowListeners.set(name, handler)
  };
  const context = vm.createContext({
    console,
    crypto: webcrypto,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    window,
    location: { hash, pathname: "/", search: "" },
    history: { replaceState: () => {} },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    navigator,
    document: {
      visibilityState: "visible",
      querySelector: (selector) => elements.get(selector) || null,
      addEventListener: (name, handler) => documentListeners.set(name, handler)
    },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      const result = responses[body.action] || { ok: true };
      return {
        ok: !result.error,
        status: result.error ? 400 : 200,
        json: async () => result
      };
    }
  });
  vm.runInContext(source, context);
  return { context, window, storage, requests, elements, navigator, windowListeners };
}

const disabled = createCloudContext({ appConfig: {} });
assert.equal(disabled.window.studyCloud.configured, false);

const token = "a".repeat(64);
const existing = createCloudContext({
  appConfig: { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
  stored: { "bijihou2.cloud-token.v1": token },
  responses: {
    pull: { ok: true, learner: { id: "learner-1", display_name: "Yuki" }, snapshot: null },
    heartbeat: { ok: true },
    sync: { ok: true }
  }
});
await existing.window.studyCloud.initialize({
  getSnapshot: (updatedAt) => ({ version: 3, updatedAt, progress: {} }),
  applySnapshot: () => {},
  getPresence: () => ({ mode: "today", questionId: "q1" })
});
await new Promise((resolve) => setTimeout(resolve, 260));
assert.equal(existing.requests[0].action, "pull");
assert(existing.requests.some((request) => request.action === "heartbeat"));
const existingSync = existing.requests.find((request) => request.action === "sync");
assert(existingSync, "existing pairing should sync");
assert.equal(existingSync.events[0].eventType, "session_started");
assert.match(existingSync.events[0].clientEventId, /^[a-f0-9-]{36}$/i);

const accountLogin = createCloudContext({
  appConfig: { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
  responses: {
    "login-account": { ok: true, token, learner: { id: "learner-2", account: "hana", display_name: "Hana" }, snapshot: null },
    heartbeat: { ok: true },
    sync: { ok: true }
  }
});
await accountLogin.window.studyCloud.initialize({
  getSnapshot: (updatedAt) => ({ version: 3, updatedAt, progress: { q1: { answeredAt: 1 } } }),
  applySnapshot: () => {},
  getPresence: () => ({ mode: "today", questionId: "q1" })
});
assert.equal(accountLogin.elements.get("#pairingDialog").open, true);
accountLogin.elements.get("#learnerAccount").value = "Hana";
await accountLogin.elements.get("#pairingForm").listeners.get("submit")({ preventDefault() {} });
await new Promise((resolve) => setTimeout(resolve, 260));
assert.equal(accountLogin.requests[0].action, "login-account");
assert.equal(accountLogin.requests[0].account, "Hana");
assert.equal(accountLogin.storage.get("bijihou2.cloud-name.v1"), "Hana");
assert.equal(accountLogin.storage.get("bijihou2.cloud-token.v1"), token);
assert(accountLogin.requests.some((request) => request.action === "sync"));

const firstVisitOffline = createCloudContext({
  appConfig: { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
  online: false
});
await firstVisitOffline.window.studyCloud.initialize({
  getSnapshot: (updatedAt) => ({ version: 3, updatedAt, progress: {} }),
  applySnapshot: () => {},
  getPresence: () => ({ mode: "today", questionId: null })
});
assert.notEqual(firstVisitOffline.elements.get("#pairingDialog").open, true, "first offline visit should not block local study");
assert.equal(firstVisitOffline.requests.length, 0);

const offline = createCloudContext({
  appConfig: { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
  stored: { "bijihou2.cloud-token.v1": token },
  online: false,
  responses: {
    pull: { ok: true, learner: { id: "learner-3", display_name: "Aoi" }, snapshot: null },
    heartbeat: { ok: true },
    sync: { ok: true }
  }
});
await offline.window.studyCloud.initialize({
  getSnapshot: (updatedAt) => ({ version: 3, updatedAt, progress: { q2: { answeredAt: 2 } } }),
  applySnapshot: () => {},
  getPresence: () => ({ mode: "today", questionId: "q2" })
});
offline.window.studyCloud.trackEvent("answer_submitted", { questionId: "q2", correct: true });
await new Promise((resolve) => setTimeout(resolve, 260));
assert.equal(offline.requests.length, 0, "offline startup should not call the API");
assert.equal(offline.storage.get("bijihou2.cloud-token.v1"), token, "offline startup should keep pairing");
assert.match(offline.storage.get("bijihou2.cloud-events.v1"), /answer_submitted/, "offline events should persist");
const reloaded = createCloudContext({
  appConfig: { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test" },
  stored: Object.fromEntries(offline.storage),
  responses: {
    pull: { ok: true, learner: { id: "learner-3", display_name: "Aoi" }, snapshot: null },
    heartbeat: { ok: true },
    sync: { ok: true }
  }
});
await reloaded.window.studyCloud.initialize({
  getSnapshot: (updatedAt) => ({ version: 3, updatedAt, progress: { q2: { answeredAt: 2 } } }),
  applySnapshot: () => {},
  getPresence: () => ({ mode: "today", questionId: "q2" })
});
await new Promise((resolve) => setTimeout(resolve, 260));
assert(reloaded.requests.find((request) => request.action === "sync")?.events.some((event) => event.eventType === "answer_submitted"), "reopening online should sync persisted events");
offline.navigator.onLine = true;
offline.windowListeners.get("online")();
await new Promise((resolve) => setTimeout(resolve, 260));
const recoveredSync = offline.requests.find((request) => request.action === "sync");
assert(recoveredSync, "reconnecting should sync automatically");
assert(recoveredSync.events.some((event) => event.eventType === "answer_submitted"));
assert.equal(offline.storage.has("bijihou2.cloud-events.v1"), false, "synced events should leave the queue");

assert.doesNotMatch(studyHtml, /id="pairingCancel"|今は同期しない/, "pairing dialog should only offer sync");
assert.match(studyHtml, /アカウント/, "sync dialog should ask for an account");

const adminSelectors = [...adminSource.matchAll(/document\.querySelector\("#([^"]+)"\)/g)].map((match) => match[1]);
const adminIds = new Set([...adminHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
assert.deepEqual(adminSelectors.filter((id) => !adminIds.has(id)), [], "admin.js references a missing HTML id");
assert.match(studyApiSource, /action === "delete-learner"/, "study API should expose learner deletion");
assert.match(studyApiSource, /action === "login-account"/, "study API should expose account login");
assert.match(studyApiSource, /action === "create-account"/, "study API should expose account creation");
assert.match(studyApiSource, /action === "update-account"/, "study API should expose account editing");
assert.match(adminSource, /api\("delete-learner"/, "admin UI should call learner deletion");
assert.match(adminSource, /api\("create-account"/, "admin UI should create accounts");
assert.match(adminSource, /api\("update-account"/, "admin UI should edit accounts");
assert.doesNotMatch(adminSource, /create-invite|inviteLink/, "admin UI should not expose pairing links");
assert.match(accountMigration, /learners_account_unique_idx/, "account names should be unique");
assert.match(adminSource, /function dailyUsageForLearner\(/, "admin UI should aggregate daily learner usage");
assert.match(adminSource, /DAILY_USAGE_DAYS = 30/, "admin UI should show a bounded 30-day history");
assert.match(adminSource, /usageAction\.textContent = "每日明細"/, "learner rows should expose daily details");

const dailyFunctions = adminSource.match(/  function startOfToday\(\)[\s\S]*?(?=\n  function accuracyFromSnapshot)/)?.[0];
assert(dailyFunctions, "daily usage functions should be extractable for testing");
const now = new Date();
const todayAtNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0);
const todayLater = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 0);
const yesterdayAtNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0);
const dailyContext = vm.createContext({ Date });
vm.runInContext(`const DAILY_USAGE_DAYS = 30; ${dailyFunctions}`, dailyContext);
const dailyUsage = JSON.parse(JSON.stringify(vm.runInContext(`dailyUsageForLearner("learner-1", ${JSON.stringify([
  { learner_id: "learner-1", event_type: "answer_submitted", correct: true, occurred_at: todayAtNoon.toISOString() },
  { learner_id: "learner-1", event_type: "answer_submitted", correct: false, occurred_at: todayLater.toISOString() },
  { learner_id: "learner-1", event_type: "mock_completed", occurred_at: todayLater.toISOString() },
  { learner_id: "learner-2", event_type: "answer_submitted", correct: true, occurred_at: todayAtNoon.toISOString() }
])}, ${JSON.stringify([
  { learner_id: "learner-1", minute_at: todayAtNoon.toISOString() },
  { learner_id: "learner-1", minute_at: todayLater.toISOString() },
  { learner_id: "learner-1", minute_at: yesterdayAtNoon.toISOString() }
])}).slice(0, 2)`, dailyContext)));
assert.deepEqual(dailyUsage.map(({ minutes, answers, correct, mocks }) => ({ minutes, answers, correct, mocks })), [
  { minutes: 2, answers: 2, correct: 1, mocks: 1 },
  { minutes: 1, answers: 0, correct: 0, mocks: 0 }
]);

console.log(JSON.stringify({
  disabledWithoutConfig: !disabled.window.studyCloud.configured,
  existingActions: existing.requests.map((request) => request.action),
  accountLoginActions: accountLogin.requests.map((request) => request.action),
  firstVisitOfflineBlocked: firstVisitOffline.elements.get("#pairingDialog").open === true,
  offlineRecoveryActions: offline.requests.map((request) => request.action),
  offlineReloadActions: reloaded.requests.map((request) => request.action),
  adminSelectorCount: adminSelectors.length,
  deleteLearnerAction: true,
  dailyUsageDays: 30,
  dailyUsageAggregate: dailyUsage.map(({ minutes, answers, correct, mocks }) => ({ minutes, answers, correct, mocks }))
}, null, 2));

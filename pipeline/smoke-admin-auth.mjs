import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../admin.js", import.meta.url), "utf8");
const html = await readFile(new URL("../admin.html", import.meta.url), "utf8");
class Element {
  hidden = true; disabled = false; value = ""; textContent = ""; listeners = new Map();
  classList = { add() {}, remove() {} };
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  replaceChildren() {} append() {}
}
const session = { access_token: "test-session", user: { email: "admin@example.test" } };
async function fixture({ signedIn = false, authError = null, forbidden = false, hash = "" } = {}) {
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => ["#" + match[1], new Element()]));
  const calls = [], tasks = new Set();
  let active = signedIn ? session : null, authListener, options, replacedUrl;
  const query = { select() { return this; }, order() { return this; }, gte() { return this; }, limit() { return this; },
    then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); } };
  const channel = { on() { return this; }, subscribe() { return this; } };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: active }, error: null }),
      onAuthStateChange(fn) { authListener = fn; },
      async signInWithPassword(credentials) {
        calls.push({ method: "password", credentials });
        if (authError) return { error: authError };
        active = session;
        authListener("SIGNED_IN", active);
        return { data: { session: active }, error: null };
      },
      signOut: async () => { active = null; authListener("SIGNED_OUT", null); }
    }, from: () => query, channel: () => channel, removeChannel() {}
  };
  const context = vm.createContext({
    console, Date, Map, Set, URLSearchParams,
    window: { APP_CONFIG: { supabaseUrl: "https://test.supabase.co", supabasePublishableKey: "test-public" },
      supabase: { createClient(_url, _key, opts) { options = opts; return client; } } },
    location: { hash, pathname: "/admin.html", search: "" },
    history: { replaceState(_state, _title, url) { replacedUrl = url; } },
    document: { querySelector: selector => elements.get(selector), createElement: () => new Element() },
    setTimeout(fn, delay) {
      if (delay === 0) {
        const task = Promise.resolve().then(fn);
        tasks.add(task); task.finally(() => tasks.delete(task));
      }
      return 1;
    }, clearTimeout() {}, setInterval: () => 1,
    fetch: async (_url, request) => {
      calls.push({ method: "api", body: JSON.parse(request.body) });
      assert.equal(request.headers.Authorization, "Bearer test-session");
      return { ok: !forbidden, json: async () => forbidden ? { error: "Forbidden" } : { ok: true } };
    }
  });
  vm.runInContext(source, context);
  const settle = async () => {
    do { await Promise.all([...tasks]); await new Promise(resolve => setImmediate(resolve)); } while (tasks.size);
  };
  await settle();
  return { elements, calls, options, get replacedUrl() { return replacedUrl; }, settle,
    async login() {
      elements.get("#adminEmail").value = " admin@example.test ";
      elements.get("#adminPassword").value = "example-pass";
      await elements.get("#adminLoginForm").listeners.get("submit")({ preventDefault() {} });
      await settle();
    }, async logout() { await elements.get("#adminSignOut").listeners.get("click")(); await settle(); }
  };
}

const success = await fixture();
await success.login();
assert.equal(success.elements.get("#adminDashboard").hidden, false);
assert.equal(success.elements.get("#adminAuth").hidden, true);
assert.equal(success.elements.get("#adminPassword").value, "");
assert.equal(success.calls.filter(call => call.method === "api").length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(success.calls[0].credentials)), { email: "admin@example.test", password: "example-pass" });
await success.logout();
assert.equal(success.elements.get("#adminDashboard").hidden, true);
assert.equal(success.elements.get("#adminAuth").hidden, false);

const invalid = await fixture({ authError: { code: "invalid_credentials", message: "Invalid login credentials" } });
await invalid.login();
assert.equal(invalid.elements.get("#adminLoginMessage").textContent, "Email 或密碼錯誤");
assert.equal(invalid.elements.get("#adminLoginSubmit").disabled, false);
assert.equal(invalid.calls.filter(call => call.method === "api").length, 0);

const denied = await fixture({ forbidden: true });
await denied.login();
assert.equal(denied.elements.get("#adminDashboard").hidden, true);
assert.equal(denied.elements.get("#adminLoginMessage").textContent, "這個 Email 沒有管理權限");

const restored = await fixture({ signedIn: true });
assert.equal(restored.elements.get("#adminDashboard").hidden, false);
const expired = await fixture({ hash: "#error=access_denied&error_code=otp_expired" });
assert.equal(expired.options.auth.detectSessionInUrl, false);
assert.equal(expired.replacedUrl, "/admin.html");
assert.match(expired.elements.get("#adminLoginMessage").textContent, /Email 和密碼/);
const limited = await fixture({ authError: { status: 429, message: "Too many requests" } });
await limited.login();
assert.match(limited.elements.get("#adminLoginMessage").textContent, /太頻繁/);
assert.doesNotMatch(source, /signInWithOtp|signUp\(/);
assert.match(html, /id="adminPassword" type="password" autocomplete="current-password" minlength="6"/);
console.log(JSON.stringify({ passwordLogin: true, noEmailOrSignup: true, passwordFieldCleared: true,
  invalidCredentialsRejected: true, nonAdminRejected: true, existingSessionRestored: true,
  expiredMagicLinkIgnored: true, logout: true, rateLimitMessage: true }, null, 2));

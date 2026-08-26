(function initializeStudyCloud(global) {
  const TOKEN_KEY = "bijihou2.cloud-token.v1";
  const NAME_KEY = "bijihou2.cloud-name.v1";
  const UPDATED_KEY = "bijihou2.cloud-updated.v1";
  const EVENT_QUEUE_KEY = "bijihou2.cloud-events.v1";
  const config = global.APP_CONFIG || {};
  const apiUrl = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/study-api`;
  const publishableKey = String(config.supabasePublishableKey || "").trim();
  const configured = /^https:\/\//.test(apiUrl) && Boolean(publishableKey);
  let token = readValue(TOKEN_KEY);
  let callbacks = null;
  let pendingEvents = readPendingEvents();
  let syncTimer;
  let heartbeatTimer;
  let applying = false;
  let syncing = false;
  let dirty = false;

  function readValue(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function writeValue(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn("Cloud identity storage failed", error);
    }
  }

  function removeValue(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn("Cloud identity removal failed", error);
    }
  }

  function readPendingEvents() {
    try {
      const events = JSON.parse(readValue(EVENT_QUEUE_KEY));
      return Array.isArray(events) ? events : [];
    } catch {
      return [];
    }
  }

  function savePendingEvents() {
    if (pendingEvents.length) writeValue(EVENT_QUEUE_KEY, JSON.stringify(pendingEvents));
    else removeValue(EVENT_QUEUE_KEY);
  }

  function isOffline() {
    return "onLine" in navigator && !navigator.onLine;
  }

  function setOfflineStatus() {
    setStatus("オフライン・記録は接続後に同期", "offline");
  }

  function showAccountDialog(message = "") {
    const dialog = document.querySelector("#pairingDialog");
    const errorPanel = document.querySelector("#pairingError");
    if (!dialog || !errorPanel) return;
    errorPanel.textContent = message;
    errorPanel.hidden = !message;
    if (!dialog.open) dialog.showModal();
  }

  function invalidateSession() {
    removeValue(TOKEN_KEY);
    token = "";
    showAccountDialog("アカウントを入力し直してください");
  }

  function setStatus(text, state = "") {
    const panel = document.querySelector("#cloudStatus");
    const label = document.querySelector("#cloudStatusText");
    if (!panel || !label) return;
    panel.hidden = !configured || !token;
    panel.dataset.state = state;
    label.textContent = text;
  }

  async function api(action, payload = {}) {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function localUpdatedAt() {
    return Number(readValue(UPDATED_KEY)) || 0;
  }

  function markLocalUpdate() {
    const updatedAt = Date.now();
    writeValue(UPDATED_KEY, String(updatedAt));
    return updatedAt;
  }

  async function applyRemoteSnapshot(snapshot) {
    if (!snapshot?.payload || !callbacks?.applySnapshot) return false;
    const cloudUpdatedAt = Number(snapshot.client_updated_at) || 0;
    if (localUpdatedAt() > cloudUpdatedAt) return false;
    applying = true;
    try {
      callbacks.applySnapshot(snapshot.payload);
      writeValue(UPDATED_KEY, String(cloudUpdatedAt));
      return true;
    } finally {
      applying = false;
    }
  }

  async function flush() {
    if (!configured || !token || !callbacks?.getSnapshot) return;
    if (isOffline()) {
      dirty = true;
      setOfflineStatus();
      return;
    }
    if (syncing) {
      dirty = true;
      return;
    }
    syncing = true;
    dirty = false;
    const events = pendingEvents.slice(0, 20);
    setStatus("同期中…", "syncing");
    try {
      const snapshot = callbacks.getSnapshot(localUpdatedAt() || markLocalUpdate());
      await api("sync", { token, snapshot, events });
      pendingEvents.splice(0, events.length);
      savePendingEvents();
      dirty = pendingEvents.length > 0;
      setStatus(`${readValue(NAME_KEY) || "学習記録"}・同期済み`, "synced");
    } catch (error) {
      console.warn("Cloud sync failed", error);
      if (error.status === 401) invalidateSession();
      else {
        if (isOffline()) setOfflineStatus();
        else setStatus("同期できません。再試行します", "error");
        dirty = true;
      }
    } finally {
      syncing = false;
      if (dirty && token && !isOffline()) queueFlush(10000);
    }
  }

  function queueFlush(delay) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(flush, delay);
  }

  function scheduleSnapshot(delay = 800) {
    if (!configured || !token || applying) return;
    markLocalUpdate();
    queueFlush(delay);
  }

  function trackEvent(eventType, parameters = {}) {
    if (!configured || !token) return;
    pendingEvents.push({
      clientEventId: crypto.randomUUID(),
      eventType,
      questionId: parameters.questionId || null,
      chapter: parameters.chapter || null,
      mode: parameters.mode || null,
      correct: typeof parameters.correct === "boolean" ? parameters.correct : null,
      score: Number.isInteger(parameters.score) ? parameters.score : null,
      metadata: parameters.metadata || {},
      occurredAt: new Date().toISOString()
    });
    savePendingEvents();
    scheduleSnapshot(200);
  }

  async function heartbeat() {
    if (!configured || !token || isOffline() || document.visibilityState === "hidden") return;
    const presence = callbacks?.getPresence?.() || {};
    try {
      await api("heartbeat", { token, mode: presence.mode, questionId: presence.questionId });
    } catch (error) {
      console.warn("Cloud heartbeat failed", error);
    }
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeat();
    heartbeatTimer = setInterval(heartbeat, 30000);
  }

  async function restore() {
    if (!token) return;
    if (isOffline()) {
      setOfflineStatus();
      return;
    }
    setStatus("クラウド記録を確認中…", "syncing");
    try {
      const data = await api("pull", { token });
      if (data.learner?.display_name) writeValue(NAME_KEY, data.learner.display_name);
      const restored = await applyRemoteSnapshot(data.snapshot);
      if (!restored && !data.snapshot) scheduleSnapshot(0);
      setStatus(`${readValue(NAME_KEY) || "学習記録"}・同期済み`, "synced");
      startHeartbeat();
      trackEvent("session_started", { mode: callbacks?.getPresence?.().mode || "today" });
    } catch (error) {
      console.warn("Cloud restore failed", error);
      if (error.status === 401) invalidateSession();
      else {
        if (isOffline()) setOfflineStatus();
        else setStatus("同期できません。再試行します", "error");
        dirty = true;
        queueFlush(10000);
      }
    }
  }

  async function login(account) {
    const data = await api("login-account", { account });
    token = data.token;
    writeValue(TOKEN_KEY, token);
    writeValue(NAME_KEY, data.learner.display_name || data.learner.account);
    const restored = await applyRemoteSnapshot(data.snapshot);
    if (!restored) scheduleSnapshot(0);
    setStatus(`${data.learner.display_name || data.learner.account}・同期済み`, "synced");
    startHeartbeat();
    trackEvent("session_started", { mode: callbacks?.getPresence?.().mode || "today" });
  }

  function bindPairingDialog() {
    const dialog = document.querySelector("#pairingDialog");
    const form = document.querySelector("#pairingForm");
    const input = document.querySelector("#learnerAccount");
    const submit = document.querySelector("#pairingSubmit");
    const errorPanel = document.querySelector("#pairingError");
    if (!dialog || !form || !input || !submit || !errorPanel) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      submit.disabled = true;
      errorPanel.hidden = true;
      try {
        await login(name);
        dialog.close();
      } catch (error) {
        errorPanel.textContent = error.status === 401 ? "アカウントが見つかりません" : (error.message || "同期を開始できませんでした");
        errorPanel.hidden = false;
      } finally {
        submit.disabled = false;
      }
    });
  }

  async function initialize(nextCallbacks) {
    callbacks = nextCallbacks;
    if (!configured) return;
    bindPairingDialog();
    if (new URLSearchParams(location.hash.replace(/^#/, "")).has("pair")) {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
    if (token) await restore();
    else if (!isOffline()) showAccountDialog();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      heartbeat();
      if (dirty && !isOffline()) queueFlush(0);
    }
  });

  global.addEventListener("offline", () => {
    setOfflineStatus();
    if (!token) document.querySelector("#pairingDialog")?.close();
  });
  global.addEventListener("online", () => {
    if (!token) {
      showAccountDialog();
      return;
    }
    setStatus("接続を確認中…", "syncing");
    restore();
  });

  global.studyCloud = {
    configured,
    initialize,
    scheduleSnapshot,
    trackEvent,
    flush,
    get applying() { return applying; }
  };
})(window);

(function initializeStudyCloud(global) {
  const TOKEN_KEY = "bijihou2.cloud-token.v1";
  const NAME_KEY = "bijihou2.cloud-name.v1";
  const UPDATED_KEY = "bijihou2.cloud-updated.v1";
  const config = global.APP_CONFIG || {};
  const apiUrl = `${String(config.supabaseUrl || "").replace(/\/$/, "")}/functions/v1/study-api`;
  const publishableKey = String(config.supabasePublishableKey || "").trim();
  const configured = /^https:\/\//.test(apiUrl) && Boolean(publishableKey);
  let token = readValue(TOKEN_KEY);
  let callbacks = null;
  let pendingPairToken = null;
  let pendingEvents = [];
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

  function setStatus(text, state = "") {
    const panel = document.querySelector("#cloudStatus");
    const label = document.querySelector("#cloudStatusText");
    if (!panel || !label) return;
    panel.hidden = !configured || (!token && !pendingPairToken);
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
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
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
      setStatus(`${readValue(NAME_KEY) || "学習記録"}・同期済み`, "synced");
    } catch (error) {
      console.warn("Cloud sync failed", error);
      setStatus("同期できません。再試行します", "error");
      dirty = true;
    } finally {
      syncing = false;
      if (dirty) scheduleSnapshot(2500);
    }
  }

  function scheduleSnapshot(delay = 800) {
    if (!configured || !token || applying) return;
    markLocalUpdate();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(flush, delay);
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
    scheduleSnapshot(200);
  }

  async function heartbeat() {
    if (!configured || !token || document.visibilityState === "hidden") return;
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
      removeValue(TOKEN_KEY);
      token = "";
      setStatus("配対リンクを開き直してください", "error");
    }
  }

  async function pair(displayName) {
    const data = await api("pair", { token: pendingPairToken, displayName });
    token = pendingPairToken;
    pendingPairToken = null;
    writeValue(TOKEN_KEY, token);
    writeValue(NAME_KEY, data.learner.display_name);
    const restored = await applyRemoteSnapshot(data.snapshot);
    if (!restored) scheduleSnapshot(0);
    setStatus(`${data.learner.display_name}・同期済み`, "synced");
    startHeartbeat();
    trackEvent("session_started", { mode: callbacks?.getPresence?.().mode || "today" });
  }

  function bindPairingDialog() {
    const dialog = document.querySelector("#pairingDialog");
    const form = document.querySelector("#pairingForm");
    const input = document.querySelector("#learnerName");
    const submit = document.querySelector("#pairingSubmit");
    const cancel = document.querySelector("#pairingCancel");
    const errorPanel = document.querySelector("#pairingError");
    if (!dialog || !form || !input || !submit || !cancel || !errorPanel) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      submit.disabled = true;
      errorPanel.hidden = true;
      try {
        await pair(name);
        dialog.close();
      } catch (error) {
        errorPanel.textContent = error.message || "同期を開始できませんでした";
        errorPanel.hidden = false;
      } finally {
        submit.disabled = false;
      }
    });
    cancel.addEventListener("click", () => {
      pendingPairToken = null;
      dialog.close();
      setStatus("", "");
    });
  }

  async function initialize(nextCallbacks) {
    callbacks = nextCallbacks;
    if (!configured) return;
    bindPairingDialog();
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const pairedToken = hash.get("pair");
    if (pairedToken && /^[a-f0-9]{64}$/i.test(pairedToken)) {
      pendingPairToken = pairedToken;
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      document.querySelector("#pairingDialog")?.showModal();
      setStatus("名前を入力してください", "syncing");
      return;
    }
    await restore();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") heartbeat();
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

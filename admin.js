(function initializeAdmin(global) {
  const config = global.APP_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = String(config.supabasePublishableKey || "").trim();
  const configured = /^https:\/\//.test(supabaseUrl) && Boolean(publishableKey) && global.supabase?.createClient;
  const apiUrl = `${supabaseUrl}/functions/v1/study-api`;
  const elements = {
    configError: document.querySelector("#adminConfigError"),
    auth: document.querySelector("#adminAuth"),
    dashboard: document.querySelector("#adminDashboard"),
    loginForm: document.querySelector("#adminLoginForm"),
    email: document.querySelector("#adminEmail"),
    loginSubmit: document.querySelector("#adminLoginSubmit"),
    loginMessage: document.querySelector("#adminLoginMessage"),
    signOut: document.querySelector("#adminSignOut"),
    realtimeStatus: document.querySelector("#adminRealtimeStatus"),
    stats: document.querySelector("#adminStats"),
    learnerRows: document.querySelector("#learnerRows"),
    recentEvents: document.querySelector("#recentEvents"),
    lastUpdated: document.querySelector("#adminLastUpdated"),
    createLearner: document.querySelector("#createLearnerButton"),
    refresh: document.querySelector("#refreshAdminButton"),
    inviteDialog: document.querySelector("#inviteDialog"),
    closeInviteDialog: document.querySelector("#closeInviteDialog"),
    inviteLink: document.querySelector("#inviteLink"),
    copyInviteLink: document.querySelector("#copyInviteLink"),
    deleteLearnerDialog: document.querySelector("#deleteLearnerDialog"),
    closeDeleteLearnerDialog: document.querySelector("#closeDeleteLearnerDialog"),
    cancelDeleteLearner: document.querySelector("#cancelDeleteLearner"),
    confirmDeleteLearner: document.querySelector("#confirmDeleteLearner"),
    deleteLearnerName: document.querySelector("#deleteLearnerName"),
    toast: document.querySelector("#adminToast")
  };
  let client;
  let realtimeChannel;
  let refreshTimer;
  let toastTimer;
  let pendingDeleteLearner = null;

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
  }

  async function api(action, payload = {}) {
    const { data: sessionData } = await client.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("請重新登入");
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function startOfToday() {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }

  function formatDate(value) {
    if (!value) return "尚未使用";
    return new Date(value).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function accuracyFromSnapshot(snapshot) {
    const history = Array.isArray(snapshot?.payload?.history) ? snapshot.payload.history : [];
    if (!history.length) return 0;
    return Math.round(history.filter((item) => item.correct).length / history.length * 100);
  }

  function answeredFromSnapshot(snapshot) {
    const progress = snapshot?.payload?.progress;
    return progress && typeof progress === "object" && !Array.isArray(progress) ? Object.keys(progress).length : 0;
  }

  function eventLabel(event) {
    if (event.event_type === "answer_submitted") return `${event.correct ? "答對" : "答錯"} ${event.question_id || "題目"}`;
    if (event.event_type === "mock_completed") return `完成模擬考 ${event.score ?? 0} 分`;
    if (event.event_type === "session_started") return "開啟學習網站";
    return event.event_type;
  }

  function renderStats(values) {
    const stats = [
      [values.online, "目前在線"],
      [values.todayAnswers, "今日回答"],
      [values.totalAnswered, "累積回答題目"],
      [`${values.todayMinutes} 分`, "今日學習時間"]
    ];
    elements.stats.replaceChildren(...stats.map(([value, label]) => {
      const item = document.createElement("div");
      item.className = "admin-stat";
      item.replaceChildren(
        Object.assign(document.createElement("strong"), { textContent: String(value) }),
        Object.assign(document.createElement("span"), { textContent: label })
      );
      return item;
    }));
  }

  function renderLearners(learners, snapshots, events, activity) {
    const snapshotByLearner = new Map(snapshots.map((item) => [item.learner_id, item]));
    const today = startOfToday().getTime();
    elements.learnerRows.replaceChildren(...learners.map((learner) => {
      const snapshot = snapshotByLearner.get(learner.id);
      const learnerEvents = events.filter((event) => event.learner_id === learner.id && new Date(event.occurred_at).getTime() >= today);
      const minutes = activity.filter((item) => item.learner_id === learner.id).length;
      const online = learner.last_seen && Date.now() - new Date(learner.last_seen).getTime() < 90000;
      const row = document.createElement("tr");
      const cells = [
        learner.display_name || "尚未配對",
        online ? `在線・${learner.current_mode || "學習中"}` : "離線",
        learnerEvents.filter((event) => event.event_type === "answer_submitted").length,
        answeredFromSnapshot(snapshot),
        `${accuracyFromSnapshot(snapshot)}%`,
        minutes,
        formatDate(learner.last_seen)
      ].map((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        if (index === 1) cell.className = online ? "admin-online" : "admin-offline";
        return cell;
      });
      const actionCell = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "admin-row-actions";
      const inviteAction = document.createElement("button");
      inviteAction.type = "button";
      inviteAction.className = "admin-row-action";
      inviteAction.textContent = learner.paired_at ? "重新配對" : "取得連結";
      inviteAction.addEventListener("click", () => createInvite(learner.id));
      const deleteAction = document.createElement("button");
      deleteAction.type = "button";
      deleteAction.className = "admin-row-action is-danger";
      deleteAction.textContent = "刪除";
      deleteAction.addEventListener("click", () => openDeleteLearnerDialog(learner));
      actions.append(inviteAction, deleteAction);
      actionCell.append(actions);
      row.replaceChildren(...cells, actionCell);
      return row;
    }));

    if (!learners.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 8;
      cell.className = "admin-empty";
      cell.textContent = "尚未建立學習者";
      row.append(cell);
      elements.learnerRows.append(row);
    }
  }

  function renderEvents(events, learners) {
    const names = new Map(learners.map((learner) => [learner.id, learner.display_name || "尚未配對"]));
    elements.recentEvents.replaceChildren(...events.slice(0, 30).map((event) => {
      const item = document.createElement("div");
      item.className = "admin-event";
      item.replaceChildren(
        Object.assign(document.createElement("time"), { textContent: formatDate(event.occurred_at) }),
        Object.assign(document.createElement("strong"), { textContent: eventLabel(event) }),
        Object.assign(document.createElement("span"), { textContent: names.get(event.learner_id) || "未知" })
      );
      return item;
    }));
    if (!events.length) elements.recentEvents.append(Object.assign(document.createElement("p"), { className: "admin-empty", textContent: "尚無活動" }));
  }

  async function refreshDashboard() {
    clearTimeout(refreshTimer);
    const since = startOfToday().toISOString();
    const [learnersResult, snapshotsResult, eventsResult, activityResult] = await Promise.all([
      client.from("learners").select("*").order("created_at"),
      client.from("study_snapshots").select("learner_id, payload, client_updated_at, updated_at"),
      client.from("study_events").select("*").order("occurred_at", { ascending: false }).limit(150),
      client.from("activity_minutes").select("learner_id, minute_at").gte("minute_at", since)
    ]);
    const error = learnersResult.error || snapshotsResult.error || eventsResult.error || activityResult.error;
    if (error) throw error;
    const learners = learnersResult.data || [];
    const snapshots = snapshotsResult.data || [];
    const events = eventsResult.data || [];
    const activity = activityResult.data || [];
    const today = startOfToday().getTime();
    renderStats({
      online: learners.filter((learner) => learner.last_seen && Date.now() - new Date(learner.last_seen).getTime() < 90000).length,
      todayAnswers: events.filter((event) => event.event_type === "answer_submitted" && new Date(event.occurred_at).getTime() >= today).length,
      totalAnswered: snapshots.reduce((sum, snapshot) => sum + answeredFromSnapshot(snapshot), 0),
      todayMinutes: activity.length
    });
    renderLearners(learners, snapshots, events, activity);
    renderEvents(events, learners);
    elements.lastUpdated.textContent = `更新於 ${new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  }

  function queueRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshDashboard().catch((error) => showToast(error.message)), 250);
  }

  function subscribeRealtime() {
    if (realtimeChannel) client.removeChannel(realtimeChannel);
    realtimeChannel = client.channel("study-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "learners" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "study_snapshots" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "study_events" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_minutes" }, queueRefresh)
      .subscribe((status) => {
        elements.realtimeStatus.hidden = false;
        elements.realtimeStatus.textContent = status === "SUBSCRIBED" ? "即時連線" : "重新連線中";
      });
  }

  async function createInvite(learnerId = null) {
    try {
      const siteUrl = new URL("./", location.href).href.replace(/\/$/, "");
      const data = await api("create-invite", { learnerId, siteUrl });
      elements.inviteLink.value = data.inviteUrl;
      elements.inviteDialog.showModal();
      await refreshDashboard();
    } catch (error) {
      showToast(error.message);
    }
  }

  function closeDeleteLearnerDialog() {
    pendingDeleteLearner = null;
    elements.confirmDeleteLearner.disabled = false;
    elements.deleteLearnerDialog.close();
  }

  function openDeleteLearnerDialog(learner) {
    pendingDeleteLearner = learner;
    elements.deleteLearnerName.textContent = learner.display_name || "尚未配對";
    elements.deleteLearnerDialog.showModal();
  }

  async function deleteLearner() {
    if (!pendingDeleteLearner) return;
    elements.confirmDeleteLearner.disabled = true;
    try {
      await api("delete-learner", { learnerId: pendingDeleteLearner.id });
      closeDeleteLearnerDialog();
      showToast("學習者與相關紀錄已刪除");
      await refreshDashboard();
    } catch (error) {
      elements.confirmDeleteLearner.disabled = false;
      showToast(error.message);
    }
  }

  async function showDashboard() {
    try {
      await api("admin-bootstrap");
      elements.auth.hidden = true;
      elements.dashboard.hidden = false;
      elements.signOut.hidden = false;
      await refreshDashboard();
      subscribeRealtime();
    } catch (error) {
      elements.auth.hidden = false;
      elements.dashboard.hidden = true;
      elements.signOut.hidden = true;
      elements.loginMessage.textContent = error.message === "Forbidden" ? "這個 Email 沒有管理權限" : error.message;
    }
  }

  async function initialize() {
    if (!configured) {
      elements.configError.hidden = false;
      return;
    }
    client = global.supabase.createClient(supabaseUrl, publishableKey);
    elements.auth.hidden = false;
    const { data } = await client.auth.getSession();
    if (data.session) await showDashboard();
    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) setTimeout(showDashboard, 0);
      if (event === "SIGNED_OUT") {
        elements.auth.hidden = false;
        elements.dashboard.hidden = true;
        elements.signOut.hidden = true;
      }
    });

    elements.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      elements.loginSubmit.disabled = true;
      elements.loginMessage.textContent = "寄送中…";
      const { error } = await client.auth.signInWithOtp({
        email: elements.email.value.trim(),
        options: { emailRedirectTo: location.href, shouldCreateUser: false }
      });
      elements.loginMessage.textContent = error ? error.message : "登入連結已寄出，請查看 Email。";
      elements.loginSubmit.disabled = false;
    });
    elements.signOut.addEventListener("click", () => client.auth.signOut());
    elements.createLearner.addEventListener("click", () => createInvite());
    elements.refresh.addEventListener("click", () => refreshDashboard().catch((error) => showToast(error.message)));
    elements.closeInviteDialog.addEventListener("click", () => elements.inviteDialog.close());
    elements.closeDeleteLearnerDialog.addEventListener("click", closeDeleteLearnerDialog);
    elements.cancelDeleteLearner.addEventListener("click", closeDeleteLearnerDialog);
    elements.confirmDeleteLearner.addEventListener("click", deleteLearner);
    elements.copyInviteLink.addEventListener("click", async () => {
      await navigator.clipboard.writeText(elements.inviteLink.value);
      showToast("配對連結已複製");
    });
    setInterval(() => elements.dashboard.hidden || queueRefresh(), 30000);
  }

  initialize().catch((error) => {
    elements.configError.hidden = false;
    elements.configError.querySelector("p").textContent = error.message;
  });
})(window);

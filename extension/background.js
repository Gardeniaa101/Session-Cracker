const DEFAULT_SETTINGS = {
  preAlertMinutes: [10, 30],
  pollingIntervalSec: 60,
  enableNativeApp: false,
  enableWeeklyAlert: true,
  silent: false,
};

const NOTIFICATION_ICON_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Ccircle cx='64' cy='64' r='64' fill='%23d97757'/%3E%3C/svg%3E";

function calculatedUsage() {
  return {
    resetsAt: new Date(Date.now() + 5 * 3600000).toISOString(),
    utilization: null,
    weeklyUtil: null,
    weeklyResets: null,
    source: "calculated",
  };
}

function normalizeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
  };
}

async function ensureSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  const normalized = normalizeSettings(settings);

  if (!settings || Object.keys(DEFAULT_SETTINGS).some((key) => settings[key] === undefined)) {
    await chrome.storage.local.set({ settings: normalized });
  }

  return normalized;
}

async function fetchOrgId() {
  const { orgId } = await chrome.storage.local.get("orgId");

  if (orgId) return orgId;

  try {
    const response = await fetch("https://claude.ai/api/organizations", {
      credentials: "include",
    });
    const organizations = await response.json();
    const nextOrgId = organizations?.[0]?.uuid || null;

    if (nextOrgId) {
      await chrome.storage.local.set({ orgId: nextOrgId });
    }

    return nextOrgId;
  } catch (error) {
    console.warn("[Claude Reset] Failed to fetch organization id:", error);
    return null;
  }
}

async function fetchUsage(orgId) {
  try {
    const response = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
      credentials: "include",
    });
    const usage = await response.json();
    const resetsAt = usage?.five_hour?.resets_at;
    const utilization = usage?.five_hour?.utilization;
    const weeklyUtil = usage?.seven_day?.utilization;
    const weeklyResets = usage?.seven_day?.resets_at;

    if (!resetsAt) {
      return calculatedUsage();
    }

    return {
      resetsAt,
      utilization: utilization ?? null,
      weeklyUtil: weeklyUtil ?? null,
      weeklyResets: weeklyResets ?? null,
      source: "api",
    };
  } catch (error) {
    console.warn("[Claude Reset] Failed to fetch usage:", error);
    return calculatedUsage();
  }
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function showNotification(id, title, message) {
  const settings = await ensureSettings();

  await chrome.notifications.create(id, {
    type: "basic",
    title,
    message,
    iconUrl: NOTIFICATION_ICON_URL,
    silent: settings.silent,
  });
}

async function focusClaudeTab() {
  const tabs = await chrome.tabs.query({ url: "https://claude.ai/*" });

  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: "https://claude.ai" });
  }
}

async function clearSessionAlarms() {
  await chrome.alarms.clear("session-reset");

  for (const min of [10, 30, 60]) {
    await chrome.alarms.clear(`pre-alert-${min}`);
  }

  const alarms = await chrome.alarms.getAll();
  await Promise.all(
    alarms
      .filter((alarm) => alarm.name.startsWith("pre-alert-"))
      .map((alarm) => chrome.alarms.clear(alarm.name)),
  );
}

async function scheduleSessionAlarms(resetsAt, settings) {
  const ts = Date.parse(resetsAt);

  if (!Number.isFinite(ts)) return;

  chrome.alarms.create("session-reset", { when: ts });

  for (const min of settings.preAlertMinutes) {
    const alertTs = ts - min * 60000;

    if (alertTs > Date.now()) {
      chrome.alarms.create(`pre-alert-${min}`, { when: alertTs });
    }
  }
}

function schedulePolling(settings) {
  chrome.alarms.create("poll-usage", {
    periodInMinutes: settings.pollingIntervalSec / 60,
  });
}

function buildWeeklyStatus(usage, oldWeekly) {
  if (usage.weeklyUtil !== null && usage.weeklyResets) {
    return {
      utilization: usage.weeklyUtil,
      resetsAt: usage.weeklyResets,
    };
  }

  return oldWeekly || null;
}

async function notifyNativeApp(usage, settings) {
  if (!settings.enableNativeApp) return;

  fetch("http://localhost:19872", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionResetAt: usage.resetsAt,
      weeklyResetAt: usage.weeklyResets,
      utilization: usage.utilization,
    }),
  }).catch(() => {});
}

async function markResetAndClearSession(session) {
  if (session && !session.notifiedReset) {
    await showNotification(
      "reset-done",
      "세션 갱신 완료 ⚡",
      "Claude 사용량이 초기화됐습니다. 다시 쓸 수 있어요!",
    );
  }

  await clearSessionAlarms();
  await chrome.storage.local.set({ currentSession: null });
}

async function reconcileExpiredSession(session) {
  if (!session) return false;

  const ts = Date.parse(session.resetsAt);

  if (Number.isFinite(ts) && ts <= Date.now()) {
    await markResetAndClearSession(session);
    return true;
  }

  return false;
}

async function updateSessionFromUsage(currentSession, usage, weeklyStatus, settings) {
  await clearSessionAlarms();
  await scheduleSessionAlarms(usage.resetsAt, settings);
  await chrome.storage.local.set({
    currentSession: {
      ...currentSession,
      resetsAt: usage.resetsAt,
      source: usage.source,
      utilization: usage.utilization,
      notifiedReset: false,
    },
    weeklyStatus,
  });
}

async function getUsageWithFallback() {
  const orgId = await fetchOrgId();

  if (!orgId) {
    return calculatedUsage();
  }

  return fetchUsage(orgId);
}

async function handleMessageSent() {
  const usage = await getUsageWithFallback();
  const settings = await ensureSettings();
  const { currentSession, weeklyStatus: oldWeekly } = await chrome.storage.local.get([
    "currentSession",
    "weeklyStatus",
  ]);
  const weeklyStatus = buildWeeklyStatus(usage, oldWeekly);

  if (await reconcileExpiredSession(currentSession)) {
    schedulePolling(settings);
    return;
  }

  if (currentSession?.resetsAt === usage.resetsAt) {
    await chrome.storage.local.set({
      currentSession: {
        ...currentSession,
        source: usage.source,
        utilization: usage.utilization,
      },
      weeklyStatus,
    });
    schedulePolling(settings);
    return;
  }

  await clearSessionAlarms();

  const newSession = {
    resetsAt: usage.resetsAt,
    source: usage.source,
    utilization: usage.utilization,
    detectedAt: new Date().toISOString(),
    notifiedStart: false,
    notifiedReset: false,
  };

  if (usage.source === "api") {
    await showNotification(
      "session-start",
      "Claude 세션 시작",
      `이번 세션은 ${formatTime(usage.resetsAt)}에 갱신됩니다`,
    );
  } else {
    await showNotification(
      "session-start",
      "Claude 세션 시작",
      `이번 세션은 약 ${formatTime(usage.resetsAt)}경에 갱신됩니다 (추정)`,
    );
  }

  newSession.notifiedStart = true;

  await scheduleSessionAlarms(usage.resetsAt, settings);
  await notifyNativeApp(usage, settings);
  await chrome.storage.local.set({ currentSession: newSession, weeklyStatus });
  schedulePolling(settings);
}

async function handlePollUsage() {
  const usage = await getUsageWithFallback();
  const settings = await ensureSettings();
  const { currentSession, weeklyStatus: oldWeekly } = await chrome.storage.local.get([
    "currentSession",
    "weeklyStatus",
  ]);
  const weeklyStatus = buildWeeklyStatus(usage, oldWeekly);

  if (await reconcileExpiredSession(currentSession)) {
    schedulePolling(settings);
    return;
  }

  if (!currentSession) {
    await chrome.storage.local.set({ weeklyStatus });
    schedulePolling(settings);
    return;
  }

  if (usage.source === "api" && currentSession.source === "calculated") {
    await clearSessionAlarms();
    await scheduleSessionAlarms(usage.resetsAt, settings);
    await chrome.storage.local.set({
      currentSession: {
        ...currentSession,
        resetsAt: usage.resetsAt,
        source: "api",
        utilization: usage.utilization,
      },
      weeklyStatus,
    });
    schedulePolling(settings);
    return;
  }

  if (currentSession.resetsAt === usage.resetsAt) {
    await chrome.storage.local.set({
      currentSession: {
        ...currentSession,
        source: usage.source,
        utilization: usage.utilization,
      },
      weeklyStatus,
    });
  } else if (usage.source === "api") {
    await updateSessionFromUsage(currentSession, usage, weeklyStatus, settings);
  } else {
    await chrome.storage.local.set({ weeklyStatus });
  }

  schedulePolling(settings);
}

chrome.runtime.onInstalled.addListener(() => {
  ensureSettings();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "MESSAGE_SENT") {
    handleMessageSent();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "session-reset") {
    await showNotification(
      "reset-done",
      "세션 갱신 완료 ⚡",
      "Claude 사용량이 초기화됐습니다. 다시 쓸 수 있어요!",
    );

    await chrome.storage.local.set({ currentSession: null });
  } else if (alarm.name.startsWith("pre-alert-")) {
    const min = alarm.name.replace("pre-alert-", "");
    await showNotification(
      alarm.name,
      `${min}분 후 갱신`,
      `${min}분 후 Claude 세션이 갱신됩니다`,
    );
  } else if (alarm.name === "poll-usage") {
    await handlePollUsage();
  }
});

async function handleSettingsChanged(newSettings, oldSettings) {
  const settings = normalizeSettings(newSettings);
  const previousSettings = normalizeSettings(oldSettings);

  if (settings.pollingIntervalSec !== previousSettings.pollingIntervalSec) {
    schedulePolling(settings);
  }

  const preAlertsChanged =
    JSON.stringify(settings.preAlertMinutes) !== JSON.stringify(previousSettings.preAlertMinutes);

  if (preAlertsChanged) {
    const { currentSession } = await chrome.storage.local.get("currentSession");

    if (await reconcileExpiredSession(currentSession)) return;

    if (currentSession) {
      await clearSessionAlarms();
      await scheduleSessionAlarms(currentSession.resetsAt, settings);
    }
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.settings) return;

  handleSettingsChanged(changes.settings.newValue, changes.settings.oldValue);
});

chrome.notifications.onClicked.addListener(() => {
  focusClaudeTab();
});

chrome.runtime.onStartup.addListener(async () => {
  const { currentSession } = await chrome.storage.local.get("currentSession");

  if (!currentSession) return;

  const ts = Date.parse(currentSession.resetsAt);

  if (ts > Date.now()) {
    const settings = await ensureSettings();

    chrome.alarms.create("session-reset", { when: ts });

    for (const min of settings?.preAlertMinutes || [10, 30]) {
      const alertTs = ts - min * 60000;

      if (alertTs > Date.now()) {
        chrome.alarms.create(`pre-alert-${min}`, { when: alertTs });
      }
    }

    chrome.alarms.create("poll-usage", {
      periodInMinutes: (settings?.pollingIntervalSec || 60) / 60,
    });
  } else {
    await markResetAndClearSession(currentSession);
  }
});

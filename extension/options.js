const DEFAULT_SETTINGS = {
  preAlertMinutes: [10, 30],
  pollingIntervalSec: 60,
  enableNativeApp: false,
  enableWeeklyAlert: true,
  silent: false,
};

let toastTimer = null;
let isHydrating = false;

function getFormElements() {
  return {
    preAlertInputs: Array.from(document.querySelectorAll("#pre-alerts input[type='checkbox']")),
    pollingInterval: document.getElementById("polling-interval"),
    weeklyAlert: document.getElementById("weekly-alert"),
    nativeApp: document.getElementById("native-app"),
    nativeHelp: document.getElementById("native-help"),
    notificationSound: document.getElementById("notification-sound"),
    toast: document.getElementById("toast"),
  };
}

function normalizeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
  };
}

function applySettingsToForm(settings) {
  const normalized = normalizeSettings(settings);
  const elements = getFormElements();

  isHydrating = true;

  for (const input of elements.preAlertInputs) {
    input.checked = normalized.preAlertMinutes.includes(Number(input.dataset.min));
  }

  elements.pollingInterval.value = String(normalized.pollingIntervalSec);
  elements.weeklyAlert.checked = normalized.enableWeeklyAlert;
  elements.nativeApp.checked = normalized.enableNativeApp;
  elements.nativeHelp.hidden = !normalized.enableNativeApp;
  elements.notificationSound.checked = !normalized.silent;

  isHydrating = false;
}

function readSettingsFromForm() {
  const elements = getFormElements();
  const preAlertMinutes = elements.preAlertInputs
    .filter((input) => input.checked)
    .map((input) => Number(input.dataset.min));

  return {
    preAlertMinutes,
    pollingIntervalSec: Number(elements.pollingInterval.value),
    enableWeeklyAlert: elements.weeklyAlert.checked,
    enableNativeApp: elements.nativeApp.checked,
    silent: !elements.notificationSound.checked,
  };
}

function showToast() {
  const { toast } = getFormElements();

  if (!toast) return;

  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 1000);
}

async function saveSettings() {
  if (isHydrating) return;

  const settings = readSettingsFromForm();
  const { nativeHelp } = getFormElements();
  nativeHelp.hidden = !settings.enableNativeApp;

  await chrome.storage.local.set({ settings });
  chrome.alarms.create("poll-usage", {
    periodInMinutes: settings.pollingIntervalSec / 60,
  });
  showToast();
}

async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  const normalized = normalizeSettings(settings);

  applySettingsToForm(normalized);

  if (!settings) {
    await chrome.storage.local.set({ settings: normalized });
  }
}

function bindAutoSave() {
  const form = document.getElementById("settings-form");

  form.addEventListener("change", saveSettings);
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  bindAutoSave();
});

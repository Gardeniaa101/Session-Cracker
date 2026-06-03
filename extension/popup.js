let currentSession = null;
let currentWeekly = null;
let countdownTimer = null;

function formatCountdown(isoString) {
  const remainingMs = Math.max(0, Date.parse(isoString) - Date.now());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString([], {
    month: "2-digit",
    day: "2-digit",
  });
}

function getUtilizationClass(utilization) {
  if (utilization > 80) return "danger";
  if (utilization >= 50) return "warning";
  return "";
}

function footerTemplate() {
  return `
    <div class="footer">
      <button class="settings-link" type="button" data-action="settings">⚙️ 설정</button>
    </div>
  `;
}

function renderApiSession(session, weekly) {
  const utilization = Math.max(0, Math.min(100, Math.round(session.utilization ?? 0)));
  const utilizationClass = getUtilizationClass(utilization);
  const weeklyText = weekly
    ? `${Math.round(weekly.utilization)}% 사용 │ ${formatDate(weekly.resetsAt)} 갱신`
    : "위클리 정보 없음";

  return `
    <section class="card">
      <div class="status"><span class="status-dot">●</span><span>세션 활성</span></div>
      <div class="progress-wrap" aria-label="${utilization}% 사용">
        <svg class="progress" viewBox="0 0 120 120" role="img" aria-hidden="true">
          <circle class="progress-track" cx="60" cy="60" r="52"></circle>
          <circle class="progress-value ${utilizationClass}" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="${utilization} ${100 - utilization}"></circle>
        </svg>
      </div>
      <p class="usage-text">${utilization}% 사용</p>
      <p class="countdown">${formatCountdown(session.resetsAt)}</p>
      <p class="reset-time">갱신 시각&nbsp;&nbsp;${formatTime(session.resetsAt)}</p>
      <div class="divider"></div>
      <div class="weekly">${weeklyText}</div>
      ${footerTemplate()}
    </section>
  `;
}

function renderCalculatedSession(session) {
  return `
    <section class="card">
      <div class="status"><span class="status-dot">●</span><span>세션 활성</span></div>
      <div class="no-usage">사용량 정보 없음</div>
      <p class="countdown">≈ ${formatCountdown(session.resetsAt)}</p>
      <p class="reset-time">≈ ${formatTime(session.resetsAt)} 추정</p>
      <div class="notice">⚠️ API 연결 불가 — 추정치입니다</div>
      ${footerTemplate()}
    </section>
  `;
}

function renderIdle() {
  return `
    <section class="idle-card">
      <div class="status"><span class="status-dot idle">○</span><span>세션 대기 중</span></div>
      <p class="idle-message">Claude에서 메시지를 보내면 자동 감지합니다</p>
      ${footerTemplate()}
    </section>
  `;
}

function renderUI(session, weekly) {
  const app = document.getElementById("app");

  if (!app) return;

  if (session?.source === "api") {
    app.innerHTML = renderApiSession(session, weekly);
  } else if (session?.source === "calculated") {
    app.innerHTML = renderCalculatedSession(session);
  } else {
    app.innerHTML = renderIdle();
  }
}

async function loadState() {
  const { currentSession: session, weeklyStatus: weekly } = await chrome.storage.local.get([
    "currentSession",
    "weeklyStatus",
  ]);

  currentSession = session || null;
  currentWeekly = weekly || null;
  renderUI(currentSession, currentWeekly);
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);

  countdownTimer = setInterval(() => {
    renderUI(currentSession, currentWeekly);
  }, 1000);
}

function handleStorageChange(changes, areaName) {
  if (areaName !== "local") return;

  if (changes.currentSession) {
    currentSession = changes.currentSession.newValue || null;
  }

  if (changes.weeklyStatus) {
    currentWeekly = changes.weeklyStatus.newValue || null;
  }

  renderUI(currentSession, currentWeekly);
}

function handleClick(event) {
  const target = event.target;

  if (target?.dataset?.action === "settings") {
    chrome.runtime.openOptionsPage();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  document.addEventListener("click", handleClick);
  chrome.storage.onChanged.addListener(handleStorageChange);
  await loadState();
  startCountdown();
});

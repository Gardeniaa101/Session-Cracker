window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "CLAUDE_MSG_SENT") {
    chrome.runtime.sendMessage({ type: "MESSAGE_SENT" });
  }
});

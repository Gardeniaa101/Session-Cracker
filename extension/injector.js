const originalFetch = window.fetch;

window.fetch = async function (input, init) {
  const response = await originalFetch.apply(this, arguments);
  const url = typeof input === "string" ? input : input?.url;
  const method = (init?.method || input?.method || "GET").toUpperCase();

  if (
    method === "POST" &&
    (url?.includes("completion") || url?.includes("chat_conversations"))
  ) {
    window.postMessage({ type: "CLAUDE_MSG_SENT" }, "*");
  }

  return response;
};

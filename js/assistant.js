(function () {
  console.log("[assistant] script loaded");

  const config = window.ASSISTANT_CONFIG || {};
  console.log("[assistant] config =", config);

  const apiUrl = config.apiBaseUrl;

  const elements = {
    form: document.getElementById("assistant-form"),
    input: document.getElementById("assistant-input"),
    messages: document.getElementById("assistant-messages"),
    empty: document.getElementById("assistant-empty"),
    clear: document.getElementById("assistant-clear"),
    send: document.getElementById("assistant-send"),
    main: document.getElementById("assistant-main"),
  };

  console.log("[assistant] elements =", elements);

  if (!elements.form || !elements.input || !elements.messages) {
    console.error("[assistant] required DOM elements are missing");
    return;
  }

  const state = {
    messages: [],
    isLoading: false,
  };

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function scrollToBottom() {
    if (elements.main) {
      elements.main.scrollTop = elements.main.scrollHeight;
    }
  }

  function setLoading(loading) {
    state.isLoading = loading;
    if (elements.send) elements.send.disabled = loading;
    if (elements.input) elements.input.disabled = loading;
    if (elements.clear) elements.clear.disabled = loading;
    if (elements.send) elements.send.textContent = loading ? "Sending..." : "Send";
  }

  function renderMessages() {
    if (!state.messages.length) {
      if (elements.empty) elements.empty.classList.remove("is-hidden");
      elements.messages.innerHTML = "";
      return;
    }

    if (elements.empty) elements.empty.classList.add("is-hidden");

    const html = state.messages
      .map((message) => {
        const role = message.role || "assistant";
        return `
          <div class="assistant-message assistant-message--${role}">
            <div class="assistant-bubble">${escapeHtml(message.content || "")}</div>
          </div>
        `;
      })
      .join("");

    elements.messages.innerHTML = html;
    scrollToBottom();
  }

  function pushMessage(role, content) {
    console.log("[assistant] pushMessage", role, content);
    state.messages.push({ role, content });
    renderMessages();
  }

  function resetConversation() {
    console.log("[assistant] resetConversation");
    state.messages = [];
    renderMessages();
    elements.input.value = "";
    elements.input.focus();
  }

  async function sendMessage() {
    console.log("[assistant] sendMessage called");
    console.log("[assistant] apiUrl =", apiUrl);
    console.log("[assistant] state.messages =", state.messages);

    if (!apiUrl) {
      pushMessage("system", "API URL is not configured.");
      return;
    }

    setLoading(true);

    try {
      console.log("[assistant] sending fetch request...");
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          page: config.pageTitle || "AI Assistant",
          messages: state.messages,
        }),
      });

      console.log("[assistant] response status =", response.status);

      const rawText = await response.text();
      console.log("[assistant] raw response text =", rawText);

      let data = null;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        throw new Error("Response is not valid JSON: " + rawText);
      }

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      if (!data || typeof data.reply !== "string") {
        throw new Error("Invalid API response format.");
      }

      pushMessage("assistant", data.reply);
    } catch (error) {
      console.error("[assistant] request failed", error);
      pushMessage("system", `Request failed: ${error.message}`);
    } finally {
      setLoading(false);
      elements.input.focus();
    }
  }

  elements.form.addEventListener("submit", async function (event) {
    console.log("[assistant] form submit triggered");
    event.preventDefault();

    if (state.isLoading) return;

    const value = elements.input.value.trim();
    console.log("[assistant] input value =", value);

    if (!value) return;

    pushMessage("user", value);
    elements.input.value = "";

    await sendMessage();
  });

  if (elements.clear) {
    elements.clear.addEventListener("click", function () {
      console.log("[assistant] clear clicked");
      if (state.isLoading) return;
      resetConversation();
    });
  }

  elements.input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      console.log("[assistant] enter pressed -> submit");
      event.preventDefault();
      elements.form.requestSubmit();
    }
  });

  renderMessages();
})();
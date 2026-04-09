(function () {
  console.log("[assistant] script loaded");

  const config = window.ASSISTANT_CONFIG || {};
  console.log("[assistant] config =", config);

  const apiUrl = config.apiBaseUrl;

  const elements = {
    lock: document.getElementById("assistant-lock"),
    panel: document.getElementById("assistant-panel"),
    password: document.getElementById("assistant-password"),
    unlockBtn: document.getElementById("assistant-unlock-btn"),
    lockError: document.getElementById("assistant-lock-error"),

    model: document.getElementById("assistant-model"),
    image: document.getElementById("assistant-image"),
    imageMeta: document.getElementById("assistant-image-meta"),

    form: document.getElementById("assistant-form"),
    input: document.getElementById("assistant-input"),
    messages: document.getElementById("assistant-messages"),
    empty: document.getElementById("assistant-empty"),
    clear: document.getElementById("assistant-clear"),
    send: document.getElementById("assistant-send"),
    main: document.getElementById("assistant-main"),
  };

  console.log("[assistant] elements =", elements);

  const state = {
    isUnlocked: false,
    password: "",
    currentModel: config.defaultModel || "gemini-2.5-flash",
    messages: [],
    isLoading: false,
    pendingImage: null, // { mimeType, data, name, size }
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
    if (elements.unlockBtn) elements.unlockBtn.disabled = loading;
    if (elements.model) elements.model.disabled = loading;
    if (elements.image) elements.image.disabled = loading;
    if (elements.send) elements.send.textContent = loading ? "Sending..." : "Send";
    if (elements.unlockBtn) elements.unlockBtn.textContent = loading ? "Checking..." : "Unlock";
  }

  function showLockError(message) {
    if (elements.lockError) {
      elements.lockError.textContent = message || "";
    }
  }

  function updateImageMeta() {
    if (!elements.imageMeta) return;

    if (!state.pendingImage) {
      elements.imageMeta.textContent = "";
      return;
    }

    elements.imageMeta.textContent =
      `Selected image: ${state.pendingImage.name} (${Math.round(state.pendingImage.size / 1024)} KB)`;
  }

  function renderMessages() {
    if (!state.messages.length) {
      if (elements.empty) elements.empty.classList.remove("is-hidden");
      if (elements.messages) elements.messages.innerHTML = "";
      return;
    }

    if (elements.empty) elements.empty.classList.add("is-hidden");

    const html = state.messages
      .map((message) => {
        const role = message.role || "assistant";
        const imageTag = message.imageName
          ? `<div class="assistant-image-note">[Image attached: ${escapeHtml(message.imageName)}]</div>`
          : "";

        return `
          <div class="assistant-message assistant-message--${role}">
            <div class="assistant-bubble">
              ${imageTag}
              <div>${escapeHtml(message.content || "")}</div>
            </div>
          </div>
        `;
      })
      .join("");

    elements.messages.innerHTML = html;
    scrollToBottom();
  }

  function pushMessage(role, content, extra = {}) {
    console.log("[assistant] pushMessage", role, content, extra);
    state.messages.push({
      role,
      content,
      ...extra,
    });
    renderMessages();
  }

  function resetConversation() {
    console.log("[assistant] resetConversation");
    state.messages = [];
    state.pendingImage = null;

    if (elements.image) elements.image.value = "";
    updateImageMeta();
    renderMessages();

    if (elements.input) {
      elements.input.value = "";
      elements.input.focus();
    }
  }

  function showPanel() {
    state.isUnlocked = true;
    if (elements.lock) elements.lock.classList.add("assistant-lock--hidden");
    if (elements.panel) elements.panel.classList.remove("assistant-panel--hidden");
    if (elements.model) elements.model.value = state.currentModel;
    if (elements.input) elements.input.focus();
  }

  function showLock() {
    state.isUnlocked = false;
    state.password = "";
    if (elements.password) elements.password.value = "";
    if (elements.lock) elements.lock.classList.remove("assistant-lock--hidden");
    if (elements.panel) elements.panel.classList.add("assistant-panel--hidden");
  }

  async function verifyPasswordAndUnlock() {
    const value = (elements.password?.value || "").trim();
    const authUrl = config.authUrl;

    if (!value) {
        showLockError("Please enter the password.");
        return;
    }

    if (!authUrl) {
        showLockError("Auth URL is not configured.");
        return;
    }

    setLoading(true);
    showLockError("");

    try {
        const response = await fetch(authUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            password: value,
        }),
        });

        const rawText = await response.text();
        console.log("[assistant] unlock response status =", response.status);
        console.log("[assistant] unlock raw response =", rawText);

        let data = {};
        try {
        data = JSON.parse(rawText);
        } catch (e) {
        throw new Error("Response is not valid JSON.");
        }

        if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
        }

        state.password = value;
        showPanel();
        resetConversation();
    } catch (error) {
        console.error("[assistant] unlock failed", error);
        state.password = "";
        state.isUnlocked = false;
        showLockError(error.message || "Unlock failed.");
    } finally {
        setLoading(false);
    }
    }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = function () {
        const result = reader.result || "";
        const commaIndex = result.indexOf(",");
        if (commaIndex === -1) {
          reject(new Error("Invalid image data."));
          return;
        }
        resolve(result.slice(commaIndex + 1));
      };

      reader.onerror = function () {
        reject(new Error("Failed to read image file."));
      };

      reader.readAsDataURL(file);
    });
  }

  async function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      state.pendingImage = null;
      updateImageMeta();
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Only image files are supported.");
      event.target.value = "";
      state.pendingImage = null;
      updateImageMeta();
      return;
    }

    const maxSize = 4 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("Image is too large. Please upload an image smaller than 4 MB.");
      event.target.value = "";
      state.pendingImage = null;
      updateImageMeta();
      return;
    }

    try {
      const base64 = await fileToBase64(file);
      state.pendingImage = {
        mimeType: file.type,
        data: base64,
        name: file.name,
        size: file.size,
      };
      updateImageMeta();
    } catch (error) {
      console.error(error);
      alert(error.message || "Failed to process the selected image.");
      event.target.value = "";
      state.pendingImage = null;
      updateImageMeta();
    }
  }

  async function sendMessage() {
    console.log("[assistant] sendMessage called");
    console.log("[assistant] apiUrl =", apiUrl);
    console.log("[assistant] state.messages =", state.messages);

    if (!apiUrl) {
      pushMessage("system", "API URL is not configured.");
      return;
    }

    if (!state.isUnlocked || !state.password) {
      pushMessage("system", "Please unlock the assistant first.");
      showLock();
      return;
    }

    setLoading(true);

    try {
      const payload = {
        page: config.pageTitle || "AI Assistant",
        password: state.password,
        model: state.currentModel,
        messages: state.messages
          .filter((msg) => msg.role === "user" || msg.role === "assistant")
          .map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
      };

      if (state.pendingImage) {
        payload.image = {
          mimeType: state.pendingImage.mimeType,
          data: state.pendingImage.data,
          name: state.pendingImage.name,
        };
      }

      console.log("[assistant] sending fetch request...", payload);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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

      state.pendingImage = null;
      if (elements.image) elements.image.value = "";
      updateImageMeta();
    } catch (error) {
      console.error("[assistant] request failed", error);

      if (String(error.message).toLowerCase().includes("invalid password")) {
        showLock();
        showLockError("Password invalid. Please unlock again.");
      } else {
        pushMessage("system", `Request failed: ${error.message}`);
      }
    } finally {
      setLoading(false);
      if (state.isUnlocked && elements.input) {
        elements.input.focus();
      }
    }
  }

  elements.unlockBtn?.addEventListener("click", verifyPasswordAndUnlock);

  elements.password?.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      verifyPasswordAndUnlock();
    }
  });

  elements.model?.addEventListener("change", function (event) {
    const newModel = event.target.value;
    if (newModel === state.currentModel) return;

    const confirmed = window.confirm(
      "Switching model will reset the current conversation. Continue?"
    );

    if (!confirmed) {
      event.target.value = state.currentModel;
      return;
    }

    state.currentModel = newModel;
    resetConversation();
    window.alert(`Model switched to ${newModel}. Conversation has been reset.`);
  });

  elements.image?.addEventListener("change", handleImageChange);

  elements.form?.addEventListener("submit", async function (event) {
    console.log("[assistant] form submit triggered");
    event.preventDefault();

    if (state.isLoading) return;
    if (!state.isUnlocked) {
      showLockError("Please unlock the assistant first.");
      return;
    }

    const value = elements.input.value.trim();
    console.log("[assistant] input value =", value);

    if (!value && !state.pendingImage) return;

    pushMessage("user", value || "[Image only message]", {
      imageName: state.pendingImage ? state.pendingImage.name : undefined,
    });

    if (elements.input) elements.input.value = "";

    await sendMessage();
  });

  elements.clear?.addEventListener("click", function () {
    console.log("[assistant] clear clicked");
    if (state.isLoading) return;
    resetConversation();
  });

  elements.input?.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      console.log("[assistant] enter pressed -> submit");
      event.preventDefault();
      elements.form.requestSubmit();
    }
  });

  renderMessages();
})();
(function () {
  "use strict";

  const WEBHOOK_URL = "https://maximeko.app.n8n.cloud/webhook/e6afc310-5ae2-4fb8-81de-ff1e41625397";
  // Receives each uploaded PDF once, as soon as it is loaded
  const INGEST_WEBHOOK_URL = "https://maximeko.app.n8n.cloud/webhook-test/9c5cad57-4db6-44f8-ac1f-f64127387882";

  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const browseBtn = document.getElementById("browse-btn");
  const pdfViewer = document.getElementById("pdf-viewer");
  const pdfEmbed = document.getElementById("pdf-embed");

  const contractTools = document.getElementById("contract-tools");
  const contractStatus = document.getElementById("contract-status");
  const replaceFileBtn = document.getElementById("replace-file-btn");
  const removeFileBtn = document.getElementById("remove-file-btn");

  const docNameEl = document.getElementById("doc-name");
  const docMetaEl = document.getElementById("doc-meta");

  const quickActions = document.getElementById("quick-actions");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const chatMessages = document.getElementById("chat-messages");
  const sendBtn = chatForm.querySelector(".send-btn");

  let currentFile = null;
  let currentFileUrl = null;

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function handleFile(file) {
    if (!file) return;
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      alert("Please upload a PDF file.");
      return;
    }

    if (currentFileUrl) {
      URL.revokeObjectURL(currentFileUrl);
    }
    currentFile = file;
    currentFileUrl = URL.createObjectURL(file);

    pdfEmbed.setAttribute("src", currentFileUrl);
    pdfViewer.hidden = false;
    dropZone.hidden = true;
    contractTools.hidden = false;
    replaceFileBtn.focus();

    contractStatus.textContent = formatFileSize(file.size);
    docNameEl.textContent = file.name;
    docMetaEl.textContent = "Contract loaded";

    quickActions.hidden = false;
    chatMessages.textContent = "";
    addMessage(`I've loaded "${file.name}". Ask a question below, or try a suggestion.`, "bot");

    ingestFile(file);
  }

  // Sends the PDF to the ingestion webhook. Runs in the background and never blocks the chat;
  // the result only shows in the document status line, and only if this file is still loaded.
  async function ingestFile(file) {
    docMetaEl.textContent = "Contract loaded · Ingesting…";

    const formData = new FormData();
    formData.append("file", file, file.name);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    let ok = false;
    try {
      const res = await fetch(INGEST_WEBHOOK_URL, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      ok = res.ok;
      if (!ok) console.error(`Ingestion webhook responded with status ${res.status}`);
    } catch (err) {
      console.error("Ingestion request failed:", err);
    } finally {
      clearTimeout(timer);
    }

    if (currentFile !== file) return;
    docMetaEl.textContent = ok ? "Contract loaded · Ingested" : "Contract loaded · Ingestion failed";
  }

  function resetFile() {
    if (currentFileUrl) {
      URL.revokeObjectURL(currentFileUrl);
      currentFileUrl = null;
    }
    currentFile = null;
    pdfEmbed.removeAttribute("src");
    pdfViewer.hidden = true;
    dropZone.hidden = false;
    contractTools.hidden = true;
    fileInput.value = "";

    contractStatus.textContent = "No file uploaded yet";
    docNameEl.textContent = "No contract loaded";
    docMetaEl.textContent = "Upload a PDF to get started";
    quickActions.hidden = true;
    browseBtn.focus();
  }

  browseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropZone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    handleFile(file);
  });

  replaceFileBtn.addEventListener("click", () => fileInput.click());
  removeFileBtn.addEventListener("click", () => resetFile());

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("drag-over");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });

  // Stop a stray file drop outside the drop zone from navigating away from the app
  ["dragover", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) {
        e.preventDefault();
      }
    });
  });

  function addMessage(text, sender) {
    const messageEl = document.createElement("div");
    messageEl.className = sender === "user" ? "msg msg-user" : "msg";

    if (sender === "bot") {
      const avatarEl = document.createElement("span");
      avatarEl.className = "msg-avatar";
      avatarEl.textContent = "AI";
      messageEl.appendChild(avatarEl);
    }

    const bubbleEl = document.createElement("div");
    bubbleEl.className = "bubble";
    bubbleEl.textContent = text;

    messageEl.appendChild(bubbleEl);
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubbleEl;
  }

  function setComposerDisabled(disabled) {
    chatInput.disabled = disabled;
    sendBtn.disabled = disabled;
    quickActions.querySelectorAll(".chip").forEach((chip) => {
      chip.disabled = disabled;
    });
  }

  const EMPTY_REPLY_TEXT = "The assistant returned an empty response.";

  // JSON.parse that never throws. Also tolerates a ```json code fence around the payload.
  function tryParseJson(text) {
    if (typeof text !== "string") return undefined;
    const unfenced = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1");
    try {
      return JSON.parse(unfenced);
    } catch {
      return undefined;
    }
  }

  function toCitationList(citation) {
    const items = Array.isArray(citation) ? citation : [citation];
    return items
      .map((item) => {
        if (item == null) return "";
        if (typeof item === "object") return JSON.stringify(item);
        return String(item);
      })
      .map((item) => item.trim())
      .filter(Boolean);
  }

  // Turns the raw webhook body into either
  //   { structured: true, response, citations, reasoning }  or
  //   { structured: false, text }  (the fallback, shown as plain text).
  // Accepts { response, citation, reasoning } directly, or wrapped once by n8n
  // as { output: "<stringified json>" } and/or a 1-item array.
  function parseReply(rawText) {
    let fallback = rawText.trim();
    let data = tryParseJson(rawText);

    if (Array.isArray(data) && data.length === 1) data = data[0];

    if (data && typeof data === "object" && !Array.isArray(data) && !("response" in data) && "output" in data) {
      const output = data.output;
      if (typeof output === "string") {
        // If the output isn't JSON, the output text itself is the most useful thing to show
        fallback = output.trim();
        data = tryParseJson(output);
      } else {
        data = output;
      }
    }

    const isStructured =
      data && typeof data === "object" && !Array.isArray(data) &&
      typeof data.response === "string" && data.response.trim() !== "";

    if (!isStructured) {
      return { structured: false, text: fallback || EMPTY_REPLY_TEXT };
    }

    return {
      structured: true,
      response: data.response.trim(),
      citations: toCitationList(data.citation),
      reasoning: typeof data.reasoning === "string" ? data.reasoning.trim() : "",
    };
  }

  function createReplySection(label, modifier) {
    const section = document.createElement("div");
    section.className = `reply-section reply-${modifier}`;
    const labelEl = document.createElement("p");
    labelEl.className = "reply-label";
    labelEl.textContent = label;
    section.appendChild(labelEl);
    return section;
  }

  // Fills an existing bot bubble with the parsed reply. Uses textContent only, never innerHTML.
  function renderBotReply(bubbleEl, rawText) {
    const reply = parseReply(rawText);
    bubbleEl.replaceChildren();

    if (!reply.structured) {
      bubbleEl.textContent = reply.text;
      return reply;
    }

    const sections = [];

    const responseSection = createReplySection("Response", "response");
    const responseText = document.createElement("p");
    responseText.className = "reply-text";
    responseText.textContent = reply.response;
    responseSection.appendChild(responseText);
    sections.push(responseSection);

    if (reply.citations.length > 0) {
      const citationSection = createReplySection("Citation", "citation");
      const list = document.createElement("ul");
      list.className = "reply-citations";
      reply.citations.forEach((citation) => {
        const item = document.createElement("li");
        item.textContent = citation;
        list.appendChild(item);
      });
      citationSection.appendChild(list);
      sections.push(citationSection);
    }

    if (reply.reasoning) {
      const reasoningSection = createReplySection("Reasoning", "reasoning");
      const note = document.createElement("p");
      note.className = "reply-note";
      note.textContent = reply.reasoning;
      reasoningSection.appendChild(note);
      sections.push(reasoningSection);
    }

    sections.forEach((section, index) => {
      if (index > 0) {
        const rule = document.createElement("hr");
        rule.className = "reply-rule";
        bubbleEl.appendChild(rule);
      }
      bubbleEl.appendChild(section);
    });
    return reply;
  }

  /* ---- Saved responses (browser localStorage only) ---- */

  const SAVED_RESPONSES_KEY = "redline.savedResponses";
  const downloadResponsesBtn = document.getElementById("download-responses-btn");

  function loadSavedResponses() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_RESPONSES_KEY) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  // Appends one successful question/response pair. Plain-text replies are saved with an
  // empty citation list and reasoning, so every entry has the same shape.
  function saveResponse(question, reply) {
    const entry = reply.structured
      ? { question, response: reply.response, citation: reply.citations, reasoning: reply.reasoning }
      : { question, response: reply.text, citation: [], reasoning: "" };

    const saved = loadSavedResponses();
    saved.push(entry);
    try {
      localStorage.setItem(SAVED_RESPONSES_KEY, JSON.stringify(saved));
    } catch (err) {
      console.error("Could not save the response to localStorage:", err);
      return;
    }
    downloadResponsesBtn.hidden = false;
  }

  function downloadSavedResponses() {
    const json = JSON.stringify(loadSavedResponses(), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "config.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  downloadResponsesBtn.addEventListener("click", downloadSavedResponses);
  downloadResponsesBtn.hidden = loadSavedResponses().length === 0;

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    addMessage(trimmed, "user");
    chatInput.value = "";

    if (!currentFile) {
      addMessage("Please upload a contract first so I can answer questions about it.", "bot");
      return;
    }

    setComposerDisabled(true);
    const replyBubble = addMessage("Thinking...", "bot");

    try {
      const formData = new FormData();
      formData.append("message", trimmed);
      formData.append("file", currentFile, currentFile.name);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      let res;
      try {
        res = await fetch(WEBHOOK_URL, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        throw new Error(`Webhook responded with status ${res.status}`);
      }

      const reply = renderBotReply(replyBubble, await res.text());
      const isEmptyReply = !reply.structured && reply.text === EMPTY_REPLY_TEXT;
      if (!isEmptyReply) saveResponse(trimmed, reply);
    } catch (err) {
      console.error("Webhook request failed:", err);
      replyBubble.textContent = "Something went wrong reaching the assistant. Please try again.";
    } finally {
      chatMessages.scrollTop = chatMessages.scrollHeight;
      setComposerDisabled(false);
      chatInput.focus();
    }
  }

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(chatInput.value);
  });

  quickActions.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    sendMessage(chip.dataset.question || chip.textContent);
  });
})();

/* ---- Feedback ---- */
(function () {
  "use strict";

  // Supabase project "contract-review-feedback". The publishable key is designed to be public:
  // row-level security only lets it insert into the feedback table, never read, update or delete.
  const SUPABASE_URL = "https://oprvvqkmycguhdyahcmv.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_VzsTMBZEVlTasbzaG-yNRA_8bGpzsCZ";
  const REQUEST_TIMEOUT_MS = 15000;

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MAX_FEEDBACK_LENGTH = 2000;
  const MAX_NAME_LENGTH = 120;
  const MAX_EMAIL_LENGTH = 254;

  const openBtn = document.getElementById("feedback-btn");
  const dialog = document.getElementById("feedback-dialog");
  const closeBtn = document.getElementById("feedback-close-btn");
  const cancelBtn = document.getElementById("feedback-cancel-btn");
  const form = document.getElementById("feedback-form");
  const fields = document.getElementById("feedback-fields");
  const ratingGroup = document.getElementById("fb-rating-group");
  const submitBtn = document.getElementById("feedback-submit-btn");
  const submitLabel = submitBtn.querySelector(".btn-label");
  const alertEl = document.getElementById("feedback-alert");
  const successEl = document.getElementById("feedback-success");
  const successTitle = document.getElementById("feedback-success-title");
  const doneBtn = document.getElementById("feedback-done-btn");

  let isSubmitting = false;
  let hasAttemptedSubmit = false;

  class FeedbackError extends Error {
    constructor(message, userMessage) {
      super(message);
      this.userMessage = userMessage;
    }
  }

  // Inserts one row into public.feedback through the Supabase REST API.
  // "return=minimal" matters: the public role has no SELECT access, so asking for the row back would fail.
  async function submitFeedback(values) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          rating: values.rating,
          feedback: values.comment,
          name: values.name,
          email: values.email,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new FeedbackError(
        err.name === "AbortError" ? "Feedback request timed out" : `Feedback request failed: ${err.message}`,
        "We couldn't reach the server. Please check your connection and try again. Your answers are still here."
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const userMessage =
        res.status === 429
          ? "Too many submissions right now. Please wait a moment and try again."
          : [400, 401, 403, 422].includes(res.status)
            ? "Some of your answers couldn't be accepted. Please review the form and try again."
            : "Something went wrong on our side. Please try again in a moment. Your answers are still here.";
      throw new FeedbackError(`Feedback insert failed with status ${res.status}: ${detail}`, userMessage);
    }
  }

  function getValues() {
    const data = new FormData(form);
    return {
      rating: Number(data.get("rating")) || null,
      comment: String(data.get("comment") || "").trim(),
      name: String(data.get("name") || "").trim().slice(0, MAX_NAME_LENGTH) || null,
      email: String(data.get("email") || "").trim() || null,
    };
  }

  function validate(values) {
    const errors = {};
    if (!Number.isInteger(values.rating) || values.rating < 1 || values.rating > 5) {
      errors.rating = "Please choose a rating from 1 to 5.";
    }
    if (!values.comment) {
      errors.comment = "Please tell us a bit about your experience.";
    } else if (values.comment.length > MAX_FEEDBACK_LENGTH) {
      errors.comment = `Please keep your feedback under ${MAX_FEEDBACK_LENGTH} characters.`;
    }
    if (values.email && (values.email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(values.email))) {
      errors.email = "Enter a valid email address, or leave this field blank.";
    }
    return errors;
  }

  function setFieldError(key, message) {
    const errorEl = document.getElementById(`fb-${key}-error`);
    errorEl.textContent = message || "";
    errorEl.hidden = !message;

    if (key === "rating") {
      ratingGroup.classList.toggle("is-invalid", Boolean(message));
      return;
    }
    const control = form.elements.namedItem(key);
    if (message) {
      control.setAttribute("aria-invalid", "true");
    } else {
      control.removeAttribute("aria-invalid");
    }
  }

  function showErrors(errors) {
    ["rating", "comment", "email"].forEach((key) => setFieldError(key, errors[key]));
  }

  function focusFirstInvalid(errors) {
    if (errors.rating) {
      form.querySelector('input[name="rating"]').focus();
    } else if (errors.comment) {
      form.elements.namedItem("comment").focus();
    } else if (errors.email) {
      form.elements.namedItem("email").focus();
    }
  }

  function setSubmitting(submitting) {
    isSubmitting = submitting;
    fields.disabled = submitting;
    submitBtn.disabled = submitting;
    cancelBtn.disabled = submitting;
    closeBtn.disabled = submitting;
    submitBtn.classList.toggle("is-loading", submitting);
    submitLabel.textContent = submitting ? "Sending…" : "Submit feedback";
    form.setAttribute("aria-busy", String(submitting));
  }

  function showAlert(message) {
    alertEl.textContent = message || "";
    alertEl.hidden = !message;
  }

  function resetFeedback() {
    form.reset();
    hasAttemptedSubmit = false;
    showErrors({});
    showAlert("");
    form.hidden = false;
    successEl.hidden = true;
  }

  function openFeedback() {
    resetFeedback();
    dialog.showModal();
    form.querySelector('input[name="rating"]').focus();
  }

  function closeFeedback() {
    if (isSubmitting) return;
    dialog.close();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    hasAttemptedSubmit = true;
    showAlert("");

    // Read the values before the fields are disabled, because FormData skips disabled controls
    const values = getValues();
    const errors = validate(values);
    showErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstInvalid(errors);
      return;
    }

    setSubmitting(true);
    try {
      await submitFeedback(values);
      setSubmitting(false);
      form.hidden = true;
      successEl.hidden = false;
      successTitle.focus();
    } catch (err) {
      console.error("Feedback submission failed:", err);
      setSubmitting(false);
      showAlert(
        err.userMessage ||
          "We couldn't send your feedback. Please try again. Your answers are still here."
      );
      submitBtn.focus();
    }
  });

  // After the first submit attempt, clear or update errors as the user corrects them
  ["input", "change"].forEach((eventName) => {
    form.addEventListener(eventName, () => {
      if (hasAttemptedSubmit) showErrors(validate(getValues()));
    });
  });

  openBtn.addEventListener("click", openFeedback);
  closeBtn.addEventListener("click", closeFeedback);
  cancelBtn.addEventListener("click", closeFeedback);
  doneBtn.addEventListener("click", closeFeedback);

  // Escape key: don't let the dialog close mid-submission
  dialog.addEventListener("cancel", (e) => {
    if (isSubmitting) e.preventDefault();
  });

  // Clicking the backdrop (outside the panel) closes the dialog
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeFeedback();
  });

  dialog.addEventListener("close", () => openBtn.focus());
})();

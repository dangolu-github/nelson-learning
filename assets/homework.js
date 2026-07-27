(function () {
  "use strict";

  const page = window.NELSON_HOMEWORK_CONFIG;
  const portal = window.NELSON_PORTAL_CONFIG;
  if (!page || !portal?.serviceEndpoint) return;

  enhanceChoiceControls();
  const fields = Array.from(document.querySelectorAll("[data-response-id]"));
  if (!fields.length) return;

  const storageKey = `nelson-homework:${page.assignmentId}`;
  let state = loadState();
  pruneRemovedResponses();
  let localTimer;
  let remoteTimer;
  let remoteRetryTimer;
  let reviewPdfUrl = "";
  let historyPdfUrls = [];
  let submitted = Boolean(state.submittedAt);
  let revisionLoading = false;

  installStatus();
  installTeacherReview();
  installAttemptHistory();
  restoreFields();
  updateStatus();
  bindFields();
  checkAssignment();
  checkAttemptHistory();
  window.setInterval(() => {
    checkAssignment();
    checkAttemptHistory();
  }, 20000);

  function freshState(seed = {}) {
    return {
      assignmentId: page.assignmentId,
      assignmentTitle: page.assignmentTitle,
      saveId:
        page.assignmentId +
        "-" +
        Date.now() +
        "-" +
        Math.random().toString(16).slice(2),
      startedAt: new Date().toISOString(),
      clientUpdatedAt: "",
      responses: {},
      remoteStarted: false,
      submittedAt: "",
      attemptNumber: 1,
      layoutVersion: page.layoutVersion || "legacy-v1",
      parentSubmissionId: "",
      ...seed,
    };
  }

  function loadState() {
    try {
      return { ...freshState(), ...JSON.parse(localStorage.getItem(storageKey) || "{}") };
    } catch {
      return freshState();
    }
  }

  function bindFields() {
    fields.forEach((field) => {
      field.addEventListener(field.tagName === "SELECT" ? "change" : "input", capture);
      field.disabled = submitted;
      syncChoiceControl(field);
    });
  }

  function capture(event) {
    state.responses[event.target.dataset.responseId] = event.target.value.trim();
    state.clientUpdatedAt = new Date().toISOString();
    syncChoiceControl(event.target);
    updateStatus();
    scheduleLocalSave();
  }

  function pruneRemovedResponses() {
    const activeIds = new Set(fields.map((field) => field.dataset.responseId));
    Object.keys(state.responses || {}).forEach((responseId) => {
      if (!activeIds.has(responseId)) delete state.responses[responseId];
    });
  }

  function restoreFields() {
    fields.forEach((field) => {
      field.value = state.responses[field.dataset.responseId] || "";
      syncChoiceControl(field);
    });
  }

  function installStatus() {
    const panel = document.createElement("section");
    panel.className = "homework-status";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <div class="save-state">
        <strong id="homework-progress">0 of ${fields.length} answered</strong>
        <small id="homework-save">Saved on this device</small>
      </div>
      <div class="homework-actions">
        <button type="button" id="homework-clear">Clear local draft</button>
        <button type="button" class="primary" id="homework-submit">Submit homework</button>
      </div>`;
    document.querySelector(".homework-shell").append(panel);
    panel.querySelector("#homework-clear").addEventListener("click", clearDraft);
    panel.querySelector("#homework-submit").addEventListener("click", submitHomework);
  }

  function updateStatus() {
    const answered = answeredCount();
    document.querySelector("#homework-progress").textContent =
      `${answered} of ${fields.length} answered`;
    const submit = document.querySelector("#homework-submit");
    if (submitted) {
      submit.disabled = true;
      submit.textContent = "Submitted";
    }
  }

  function answeredCount() {
    return fields.filter((field) => String(state.responses[field.dataset.responseId] || "").trim()).length;
  }

  function scheduleLocalSave() {
    window.clearTimeout(localTimer);
    localTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
        setSaveText("Draft saved");
        scheduleRemoteSave();
      } catch {
        setSaveText("This browser could not save the draft");
      }
    }, 180);
  }

  function scheduleRemoteSave() {
    if (!shouldSyncProgress()) return;
    window.clearTimeout(remoteTimer);
    window.clearTimeout(remoteRetryTimer);
    remoteTimer = window.setTimeout(saveRemote, 850);
  }

  async function saveRemote() {
    if (!shouldSyncProgress()) return;
    try {
      await post({
        action: "saveHomeworkProgress",
        accessToken: accessToken(),
        assignmentId: page.assignmentId,
        saveId: state.saveId,
        startedAt: state.startedAt,
        clientUpdatedAt: state.clientUpdatedAt,
        attemptNumber: state.attemptNumber,
        layoutVersion: state.layoutVersion,
        parentSubmissionId: state.parentSubmissionId,
        responses: state.responses,
      });
      verifyProgress(0);
    } catch {
      scheduleRemoteRetry();
    }
  }

  function verifyProgress(attempt) {
    jsonp(
      "getHomeworkProgress",
      { saveId: state.saveId, assignmentId: page.assignmentId },
      (data) => {
        if (data?.ok && !data.pending && data.clientUpdatedAt === state.clientUpdatedAt) {
          window.clearTimeout(remoteRetryTimer);
          state.remoteStarted = true;
          try {
            localStorage.setItem(storageKey, JSON.stringify(state));
          } catch {
            // The confirmed remote draft remains available to the teacher.
          }
          return;
        }
        if (attempt < 4) {
          window.setTimeout(() => verifyProgress(attempt + 1), 850 + attempt * 450);
        } else {
          scheduleRemoteRetry();
        }
      },
      () => {
        if (attempt < 4) window.setTimeout(() => verifyProgress(attempt + 1), 1200);
        else scheduleRemoteRetry();
      },
    );
  }

  function scheduleRemoteRetry() {
    if (!shouldSyncProgress()) return;
    window.clearTimeout(remoteRetryTimer);
    remoteRetryTimer = window.setTimeout(saveRemote, 5000);
  }

  function shouldSyncProgress() {
    return !submitted && (answeredCount() > 0 || state.remoteStarted === true);
  }

  function checkAssignment() {
    jsonp(
      "getAssignmentState",
      { assignmentId: page.assignmentId },
      (data) => {
        if (!data?.ok) return;
        if (data.archived === true) {
          lockPage("This homework is archived. Your submitted work remains available.");
        } else if (data.receiving === false) {
          lockPage("Receiving is currently paused.");
        }
        if (Number(data.revisionNumber || 0) > Number(state.attemptNumber || 1)) {
          loadRevision(Number(data.revisionNumber), data.reopenSourceSubmissionId);
          return;
        }
        if (submitted) checkTeacherReview();
      },
      () => {},
    );
  }

  async function submitHomework() {
    if (submitted) return;
    fields.forEach((field) => {
      state.responses[field.dataset.responseId] = field.value.trim();
    });
    state.clientUpdatedAt = new Date().toISOString();
    const missing = fields.length - answeredCount();
    if (missing && !window.confirm(
      `${missing} answer${missing === 1 ? " is" : "s are"} still blank. Submit anyway?`,
    )) return;

    const button = document.querySelector("#homework-submit");
    button.disabled = true;
    button.textContent = "Sending…";
    const submittedAt = new Date().toISOString();
    try {
      await post({
        action: "submitHomework",
        accessToken: accessToken(),
        assignmentId: page.assignmentId,
        submissionId: state.saveId,
        saveId: state.saveId,
        startedAt: state.startedAt,
        clientUpdatedAt: state.clientUpdatedAt,
        submittedAt,
        attemptNumber: state.attemptNumber,
        layoutVersion: state.layoutVersion,
        parentSubmissionId: state.parentSubmissionId,
        responses: state.responses,
      });
      confirmSubmission(submittedAt, 0);
    } catch {
      button.disabled = false;
      button.textContent = "Try sending again";
      showMessage("Your work is saved locally, but it was not sent.", true);
    }
  }

  function confirmSubmission(submittedAt, attempt) {
    jsonp(
      "getSubmission",
      { submissionId: state.saveId, assignmentId: page.assignmentId },
      (data) => {
        if (data?.ok && !data.pending) {
          submitted = true;
          window.clearTimeout(remoteTimer);
          window.clearTimeout(remoteRetryTimer);
          state.submittedAt = data.submittedAt || submittedAt;
          try {
            localStorage.setItem(storageKey, JSON.stringify(state));
          } catch {
            // Submission is already confirmed by the server.
          }
          lockPage(`Submitted successfully · ${data.answeredCount} answers received`);
          checkTeacherReview();
          checkAttemptHistory();
          return;
        }
        if (attempt < 10) {
          window.setTimeout(() => confirmSubmission(submittedAt, attempt + 1), 900 + attempt * 300);
        } else {
          unlockSubmit("Submission has not been confirmed yet. Try again.");
        }
      },
      () => {
        if (attempt < 10) window.setTimeout(() => confirmSubmission(submittedAt, attempt + 1), 1400);
        else unlockSubmit("Submission has not been confirmed yet. Try again.");
      },
    );
  }

  function lockPage(message) {
    fields.forEach((field) => {
      field.disabled = true;
      syncChoiceControl(field);
    });
    const button = document.querySelector("#homework-submit");
    button.disabled = true;
    button.textContent = submitted ? "Submitted" : "Receiving paused";
    showMessage(message, false);
    updateStatus();
  }

  function unlockSubmit(message) {
    const button = document.querySelector("#homework-submit");
    button.disabled = false;
    button.textContent = "Try sending again";
    showMessage(message, true);
  }

  function clearDraft() {
    if (submitted || !window.confirm("Clear the answers saved on this device?")) return;
    state = freshState({
      attemptNumber: state.attemptNumber,
      layoutVersion: state.layoutVersion,
      parentSubmissionId: state.parentSubmissionId,
    });
    fields.forEach((field) => {
      field.value = "";
      syncChoiceControl(field);
    });
    localStorage.setItem(storageKey, JSON.stringify(state));
    updateStatus();
    setSaveText("New blank draft saved on this device");
  }

  function loadRevision(revisionNumber, sourceSubmissionId) {
    if (revisionLoading || !sourceSubmissionId) return;
    revisionLoading = true;
    jsonp(
      "getRevisionSource",
      {
        assignmentId: page.assignmentId,
        submissionId: sourceSubmissionId,
        revisionNumber: String(revisionNumber),
      },
      (data) => {
        revisionLoading = false;
        if (!data?.ok || !data.reopened) return;
        state = freshState({
          attemptNumber: Number(data.revisionNumber) || revisionNumber,
          layoutVersion: data.layoutVersion || page.layoutVersion || "legacy-v1",
          parentSubmissionId: data.sourceSubmissionId || sourceSubmissionId,
          responses: data.responses || {},
          clientUpdatedAt: new Date().toISOString(),
        });
        submitted = false;
        restoreFields();
        unlockPageForRevision();
        try {
          localStorage.setItem(storageKey, JSON.stringify(state));
        } catch {
          // The revision will still synchronize after the next answer change.
        }
        updateStatus();
        setSaveText("Revision draft ready");
        scheduleRemoteSave();
      },
      () => {
        revisionLoading = false;
      },
    );
  }

  function unlockPageForRevision() {
    fields.forEach((field) => {
      field.disabled = false;
      syncChoiceControl(field);
    });
    const button = document.querySelector("#homework-submit");
    button.disabled = false;
    button.textContent = "Submit revision";
    showMessage("Revision reopened. Your previous answers are ready to edit.", false);
  }

  function showMessage(message, isError) {
    let box = document.querySelector(".submission-message");
    if (!box) {
      box = document.createElement("p");
      box.className = "submission-message";
      document.querySelector(".homework-document").append(box);
    }
    box.textContent = message;
    box.classList.toggle("is-error", Boolean(isError));
  }

  function installTeacherReview() {
    const panel = document.createElement("section");
    panel.className = "teacher-review";
    panel.hidden = true;
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <div class="teacher-review-heading">
        <div>
          <p class="eyebrow">After submission</p>
          <h2>Released answers and teacher review</h2>
        </div>
        <span class="teacher-review-chip">Released</span>
      </div>
      <div class="teacher-review-content"></div>`;
    document.querySelector(".homework-document").append(panel);
  }

  function installAttemptHistory() {
    const panel = document.createElement("section");
    panel.className = "attempt-history";
    panel.hidden = true;
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <div class="teacher-review-heading">
        <div>
          <p class="eyebrow">Previous work</p>
          <h2>Submission history</h2>
        </div>
      </div>
      <div class="attempt-history-content"></div>`;
    document.querySelector(".homework-document").append(panel);
  }

  function checkTeacherReview() {
    jsonp(
      "getHomeworkReview",
      { submissionId: state.saveId, assignmentId: page.assignmentId },
      (data) => {
        if (!data?.ok) return;
        renderReleasedAnswers(data.answers || []);
        renderResponseReviews(data.review?.responseReviews || []);
        renderTeacherReview(data.review);
      },
      () => {
        // The submitted work remains confirmed when review is temporarily unavailable.
      },
    );
  }

  function checkAttemptHistory() {
    jsonp(
      "getHomeworkHistory",
      { assignmentId: page.assignmentId },
      (data) => {
        if (data?.ok) renderAttemptHistory(data.attempts || []);
      },
      () => {},
    );
  }

  function renderReleasedAnswers(items) {
    document.querySelectorAll(".released-answer").forEach((item) => item.remove());
    items.forEach((item) => {
      const field = document.querySelector(
        `[data-response-id="${CSS.escape(item.responseId)}"]`,
      );
      const question = field?.closest(".homework-question");
      if (!question) return;
      const answer = document.createElement("div");
      answer.className = "released-answer";
      const label = document.createElement("span");
      const copy = document.createElement("p");
      label.textContent = "Answer";
      copy.textContent = item.answer;
      answer.append(label, copy);
      question.append(answer);
    });
  }

  function renderTeacherReview(review) {
    const panel = document.querySelector(".teacher-review");
    const content = panel.querySelector(".teacher-review-content");
    if (reviewPdfUrl) {
      URL.revokeObjectURL(reviewPdfUrl);
      reviewPdfUrl = "";
    }
    content.replaceChildren();
    if (review?.grade) {
      const item = document.createElement("article");
      const heading = document.createElement("h3");
      const copy = document.createElement("p");
      heading.textContent = "Grade or result";
      copy.textContent = review.grade;
      item.append(heading, copy);
      content.append(item);
    }
    if (review?.format === "text" && String(review.text || "").trim()) {
      const item = document.createElement("article");
      const heading = document.createElement("h3");
      const copy = document.createElement("p");
      heading.textContent = "Teacher review";
      copy.textContent = review.text;
      item.append(heading, copy);
      content.append(item);
    }
    if (review?.format === "html" && String(review.html || "").trim()) {
      const item = document.createElement("article");
      item.className = "teacher-html-review";
      const heading = document.createElement("h3");
      const body = document.createElement("div");
      heading.textContent = "Teacher review";
      body.append(safeReviewHtml(review.html));
      item.append(heading, body);
      content.append(item);
    }
    if (review?.format === "pdf" && review.pdf?.base64) {
      const item = document.createElement("article");
      item.className = "teacher-pdf-review";
      const heading = document.createElement("h3");
      const frame = document.createElement("iframe");
      const link = document.createElement("a");
      const bytes = Uint8Array.from(atob(review.pdf.base64), character =>
        character.charCodeAt(0),
      );
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      reviewPdfUrl = url;
      heading.textContent = "Teacher PDF review";
      frame.src = url;
      frame.title = review.pdf.name || "Teacher PDF review";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = `Open ${review.pdf.name || "teacher review PDF"}`;
      item.append(heading, frame, link);
      content.append(item);
    }
    const releasedAnswerCount = document.querySelectorAll(".released-answer").length;
    if (releasedAnswerCount) {
      const note = document.createElement("p");
      note.className = "released-answer-note";
      note.textContent = `${releasedAnswerCount} answers have been released inside the questions above.`;
      content.prepend(note);
    }
    panel.hidden = content.children.length === 0;
  }

  function renderResponseReviews(items) {
    document.querySelectorAll(".released-response-review").forEach((item) => item.remove());
    items.forEach((item) => {
      const field = document.querySelector(
        `[data-response-id="${CSS.escape(item.responseId)}"]`,
      );
      const question = field?.closest(".homework-question");
      if (!question) return;
      const review = document.createElement("div");
      review.className = "released-response-review";
      const status = document.createElement("span");
      const comment = document.createElement("p");
      status.textContent = item.status || "Not marked";
      comment.textContent = item.comment || "";
      review.append(status);
      if (comment.textContent) review.append(comment);
      question.append(review);
    });
  }

  function renderAttemptHistory(attempts) {
    const panel = document.querySelector(".attempt-history");
    const content = panel.querySelector(".attempt-history-content");
    historyPdfUrls.forEach((url) => URL.revokeObjectURL(url));
    historyPdfUrls = [];
    content.replaceChildren();
    attempts.forEach((attempt) => {
      if (!attempt.review) return;
      if (
        submitted &&
        String(attempt.submissionId || "") === String(state.saveId || "")
      ) return;
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const body = document.createElement("div");
      summary.textContent =
        `Attempt ${attempt.attemptNumber || 1} · ${attempt.submittedAt || "submitted"}`;
      if (attempt.review.grade) {
        const grade = document.createElement("p");
        grade.textContent = `Overall grade: ${attempt.review.grade}`;
        body.append(grade);
      }
      (attempt.review.responseReviews || []).forEach((item) => {
        const row = document.createElement("p");
        row.textContent =
          `${item.responseId}: ${item.status}${item.comment ? ` — ${item.comment}` : ""}`;
        body.append(row);
      });
      if (attempt.review.format === "text" && attempt.review.text) {
        const feedback = document.createElement("p");
        feedback.textContent = attempt.review.text;
        body.append(feedback);
      }
      if (attempt.review.format === "html" && attempt.review.html) {
        const feedback = document.createElement("div");
        feedback.append(safeReviewHtml(attempt.review.html));
        body.append(feedback);
      }
      if (attempt.review.format === "pdf" && attempt.review.pdf?.base64) {
        const bytes = Uint8Array.from(atob(attempt.review.pdf.base64), (character) =>
          character.charCodeAt(0),
        );
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        historyPdfUrls.push(url);
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = `Open ${attempt.review.pdf.name || "teacher review PDF"}`;
        body.append(link);
      }
      details.append(summary, body);
      content.append(details);
    });
    panel.hidden = content.children.length === 0;
  }

  function safeReviewHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    template.content
      .querySelectorAll("script,style,iframe,object,embed,form,input,button,textarea,select")
      .forEach((element) => element.remove());
    template.content.querySelectorAll("*").forEach((element) => {
      Array.from(element.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        if (name.startsWith("on") || name === "style") {
          element.removeAttribute(attribute.name);
        } else if (
          (name === "href" || name === "src") &&
          (value.startsWith("javascript:") || value.startsWith("data:"))
        ) {
          element.removeAttribute(attribute.name);
        }
      });
    });
    return template.content;
  }

  function setSaveText(text) {
    document.querySelector("#homework-save").textContent = text;
  }

  function accessToken() {
    return window.NelsonPortalAccess?.getToken() || "";
  }

  function enhanceChoiceControls() {
    document.querySelectorAll("select[data-response-id]").forEach((select) => {
      if (select.dataset.choiceLayout === "compact") return;
      const question = select.closest(".homework-question");
      if (!question) return;

      const copy = select.parentElement.querySelector(".choice-copy");
      const writtenChoices = copy
        ? copy.textContent.split(/\s+·\s+/).map((item) => item.trim())
        : [];
      const options = Array.from(select.options).slice(1);
      const isTrueFalse =
        select.dataset.choiceLayout === "binary" ||
        (options.length === 2 &&
          options[0].value === "T" &&
          options[0].textContent.trim().toLowerCase() === "true" &&
          options[1].value === "F" &&
          options[1].textContent.trim().toLowerCase() === "false");
      const group = document.createElement("div");
      group.className = "choice-group";
      if (isTrueFalse) group.classList.add("binary-choice-group");
      group.setAttribute("role", "radiogroup");
      group.setAttribute(
        "aria-label",
        isTrueFalse ? "Choose True or False" : "Choose one answer",
      );

      options.forEach((option, index) => {
        const button = document.createElement("button");
        const optionLabel = option.textContent.trim();
        button.type = "button";
        button.className = "choice-card";
        if (isTrueFalse) button.classList.add("binary-choice-button");
        button.dataset.choiceValue = option.value;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", "false");
        button.textContent =
          (isTrueFalse && optionLabel) ||
          writtenChoices[index] ||
          (/^[A-Z0-9]+\s*[—–-]\s+/i.test(optionLabel)
            ? optionLabel
            : option.value === optionLabel
              ? optionLabel
              : `${option.value}. ${optionLabel}`);
        button.addEventListener("click", () => {
          if (select.disabled) return;
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        group.append(button);
      });

      select.hidden = true;
      select.classList.add("choice-select-fallback");
      if (copy) copy.hidden = true;
      select._choiceGroup = group;
      question.append(group);
      syncChoiceControl(select);
    });
  }

  function syncChoiceControl(field) {
    if (field.tagName !== "SELECT" || !field._choiceGroup) return;
    field._choiceGroup.querySelectorAll(".choice-card").forEach((button) => {
      const selected = button.dataset.choiceValue === field.value;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.disabled = field.disabled;
    });
  }

  async function post(payload) {
    await window.NelsonPortalAccess.ready;
    const response = await fetch(portal.serviceEndpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (response.type !== "opaque" && !response.ok) throw new Error("Sync failed");
  }

  function jsonp(action, parameters, success, failure) {
    const callback =
      "__nelsonHomework" + Date.now() + Math.random().toString(16).slice(2);
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      failure();
    }, 10000);
    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callback];
      script.remove();
    }
    window[callback] = (data) => {
      cleanup();
      success(data);
    };
    script.onerror = () => {
      cleanup();
      failure();
    };
    const query = new URLSearchParams({
      ...parameters,
      action,
      accessToken: accessToken(),
      callback,
      _: String(Date.now()),
    });
    script.src = `${portal.serviceEndpoint}?${query.toString()}`;
    document.head.append(script);
  }
})();

(function () {
  "use strict";

  const page = window.NELSON_HOMEWORK_CONFIG;
  const portal = window.NELSON_PORTAL_CONFIG;
  if (!page || !portal?.serviceEndpoint) return;

  const fields = Array.from(document.querySelectorAll("[data-response-id]"));
  if (!fields.length) return;

  const storageKey = `nelson-homework:${page.assignmentId}`;
  let state = loadState();
  let localTimer;
  let remoteTimer;
  let submitted = Boolean(state.submittedAt);

  installStatus();
  restoreFields();
  updateStatus();
  bindFields();
  checkAssignment();

  function freshState() {
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
      submittedAt: "",
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
    });
  }

  function capture(event) {
    state.responses[event.target.dataset.responseId] = event.target.value.trim();
    state.clientUpdatedAt = new Date().toISOString();
    updateStatus();
    scheduleLocalSave();
  }

  function restoreFields() {
    fields.forEach((field) => {
      field.value = state.responses[field.dataset.responseId] || "";
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
        setSaveText("Saved on this device · syncing with Teacher…");
        scheduleRemoteSave();
      } catch {
        setSaveText("This browser could not save the draft");
      }
    }, 180);
  }

  function scheduleRemoteSave() {
    if (submitted || answeredCount() === 0) return;
    window.clearTimeout(remoteTimer);
    remoteTimer = window.setTimeout(saveRemote, 850);
  }

  async function saveRemote() {
    if (submitted || answeredCount() === 0) return;
    try {
      await post({
        action: "saveHomeworkProgress",
        accessToken: accessToken(),
        assignmentId: page.assignmentId,
        saveId: state.saveId,
        startedAt: state.startedAt,
        clientUpdatedAt: state.clientUpdatedAt,
        responses: state.responses,
      });
      verifyProgress(0);
    } catch {
      setSaveText("Saved on this device · online sync will retry");
    }
  }

  function verifyProgress(attempt) {
    jsonp(
      "getHomeworkProgress",
      { saveId: state.saveId, assignmentId: page.assignmentId },
      (data) => {
        if (data?.ok && !data.pending && data.clientUpdatedAt === state.clientUpdatedAt) {
          setSaveText("Saved on this device and with Teacher");
          return;
        }
        if (attempt < 4) {
          window.setTimeout(() => verifyProgress(attempt + 1), 850 + attempt * 450);
        } else {
          setSaveText("Saved on this device · online sync pending");
        }
      },
      () => {
        if (attempt < 4) window.setTimeout(() => verifyProgress(attempt + 1), 1200);
        else setSaveText("Saved on this device · online sync pending");
      },
    );
  }

  function checkAssignment() {
    jsonp(
      "getAssignmentState",
      { assignmentId: page.assignmentId },
      (data) => {
        if (data?.ok && data.receiving === false) lockPage("Receiving is currently paused.");
      },
      () => setSaveText("Saved locally · assignment status unavailable"),
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
          state.submittedAt = data.submittedAt || submittedAt;
          try {
            localStorage.setItem(storageKey, JSON.stringify(state));
          } catch {
            // Submission is already confirmed by the server.
          }
          lockPage(`Submitted successfully · ${data.answeredCount} answers received`);
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
    state = freshState();
    fields.forEach((field) => {
      field.value = "";
    });
    localStorage.setItem(storageKey, JSON.stringify(state));
    updateStatus();
    setSaveText("New blank draft saved on this device");
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

  function setSaveText(text) {
    document.querySelector("#homework-save").textContent = text;
  }

  function accessToken() {
    return window.NelsonPortalAccess?.getToken() || "";
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

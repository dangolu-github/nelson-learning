(function () {
  "use strict";

  const portal = window.NELSON_PORTAL_CONFIG;
  const lessonId = document.body.dataset.lessonId || "";
  if (!portal?.serviceEndpoint || !lessonId) return;

  const questions = new Map(
    Array.from(document.querySelectorAll("[data-question-id]")).map((node) => [
      node.dataset.questionId,
      node,
    ]),
  );

  const status = document.createElement("p");
  status.className = "lesson-reveal-status";
  status.textContent = "Answers and explanations are currently locked.";
  document.querySelector("main").insertBefore(status, document.querySelector("main").children[1]);

  window.NelsonPortalAccess.ready.then(loadReveals);
  window.setInterval(loadReveals, 15000);

  function loadReveals() {
    request("getLessonReveals", { lessonId }, (data) => {
      if (!data?.ok) return;
      render(data.items || []);
    });
  }

  function render(items) {
    document.querySelectorAll(".lesson-reveal").forEach((node) => node.remove());
    let visible = 0;

    items.forEach((item) => {
      const question = questions.get(item.questionId);
      if (!question) return;
      const anchor = revealAnchor(question);
      if (item.answer) {
        anchor.insertAdjacentElement("afterend", reveal("answer", "Show answer", item.answer));
        visible += 1;
      }
      if (item.explanation) {
        const answerNode = anchor.nextElementSibling?.classList.contains("lesson-reveal")
          ? anchor.nextElementSibling
          : anchor;
        answerNode.insertAdjacentElement(
          "afterend",
          reveal("explanation", "Show explanation", item.explanation),
        );
        visible += 1;
      }
    });

    status.textContent = visible
      ? "Teacher has enabled answers or explanations below."
      : "Answers and explanations are currently locked.";
    status.classList.toggle("is-available", visible > 0);
  }

  function revealAnchor(question) {
    const next = question.nextElementSibling;
    return next?.classList.contains("lines") ? next : question;
  }

  function reveal(kind, label, copy) {
    const details = document.createElement("details");
    details.className = `lesson-reveal ${kind}`;
    const summary = document.createElement("summary");
    summary.textContent = label;
    const paragraph = document.createElement("p");
    paragraph.textContent = copy;
    details.append(summary, paragraph);
    return details;
  }

  async function request(action, parameters, success) {
    await window.NelsonPortalAccess.ready;
    if (isDirectAppsScriptEndpoint()) {
      legacyJsonp(action, parameters, success);
      return;
    }
    try {
      const response = await fetch(portal.serviceEndpoint, {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action,
          ...parameters,
          accessToken: window.NelsonPortalAccess?.getToken() || "",
        }),
      });
      if (!response.ok) return;
      success(await response.json());
    } catch {
      // Reveals remain locked when the service is unavailable.
    }
  }

  function isDirectAppsScriptEndpoint() {
    try {
      return new URL(portal.serviceEndpoint).hostname === "script.google.com";
    } catch {
      return false;
    }
  }

  function legacyJsonp(action, parameters, success) {
    const callback =
      "__nelsonLesson" + Date.now() + Math.random().toString(16).slice(2);
    const script = document.createElement("script");
    const timeout = window.setTimeout(cleanup, 10000);
    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callback];
      script.remove();
    }
    window[callback] = (data) => {
      cleanup();
      success(data);
    };
    script.onerror = cleanup;
    const query = new URLSearchParams({
      ...parameters,
      action,
      accessToken: window.NelsonPortalAccess?.getToken() || "",
      callback,
      _: String(Date.now()),
    });
    script.src = `${portal.serviceEndpoint}?${query.toString()}`;
    document.head.append(script);
  }
})();

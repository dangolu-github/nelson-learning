(function () {
  "use strict";

  const data = window.NELSON_PORTAL_DATA;
  const config = window.NELSON_TEACHER_PORTAL;
  const draftKey = "nelsonTeacherReleaseDraftV2";
  const sectionStatePrefix = "nelsonTeacherSectionV1:";
  const viewerDeviceKey = "nelsonPortalViewerDeviceV1";
  const roleKey = "nelsonPortalDeviceRoleV1";
  let presenceToken = "";
  let presenceTimer = 0;
  if (!data || !config) return;

  const resourceById = new Map(
    data.resources.map((resource) => [resource.id, resource]),
  );

  function liveState(resource) {
    return {
      listed: Boolean(resource.listed),
      released: Boolean(resource.released),
      guidanceVisible: Boolean(resource.guidanceVisible),
      archived: Boolean(resource.archived),
      reviewVisible: Boolean(resource.reviewVisible),
    };
  }

  function readDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || "{}");
      return Object.fromEntries(
        Object.entries(saved).filter(([id]) => resourceById.has(id)),
      );
    } catch {
      return {};
    }
  }

  let draft = readDraft();

  function resolvedState(resource) {
    return { ...liveState(resource), ...(draft[resource.id] || {}) };
  }

  function statesDiffer(resource, state) {
    const live = liveState(resource);
    return Object.keys(live).some((key) => live[key] !== state[key]);
  }

  function saveDraft() {
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }

  function addText(parent, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function labelledSelect(label, field, values, state, resource) {
    const wrapper = document.createElement("label");
    wrapper.className = "field-control";
    addText(wrapper, "span", "", label);
    const select = document.createElement("select");
    select.dataset.field = field;
    select.dataset.resourceId = resource.id;
    values.forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      option.selected = state[field] === (value === "true");
      select.append(option);
    });
    wrapper.append(select);
    return wrapper;
  }

  function actionLink(item) {
    if (!item?.href) return null;
    const link = document.createElement("a");
    link.href = item.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = item.label;
    link.className = item.primary ? "material-action primary" : "material-action";
    return link;
  }

  function sectionRow({ label, status, tone, control, links, note }) {
    const row = document.createElement("section");
    row.className = "material-row";
    const copy = document.createElement("div");
    copy.className = "material-copy";
    addText(copy, "strong", "", label);
    addText(copy, "span", `material-state ${tone || ""}`, status);
    if (note) addText(copy, "p", "material-note", note);
    const tools = document.createElement("div");
    tools.className = "material-tools";
    if (control) {
      const controlWrap = document.createElement("div");
      controlWrap.className = "material-control";
      controlWrap.append(control);
      tools.append(controlWrap);
    }
    const actions = document.createElement("div");
    actions.className = "material-actions";
    links.forEach((item) => {
      const link = actionLink(item);
      if (link) actions.append(link);
    });
    tools.append(actions);
    row.append(copy, tools);
    return row;
  }

  function homeworkSection(homeworkLinks) {
    const row = document.createElement("section");
    row.className = "material-row homework-material-row";
    const copy = document.createElement("div");
    copy.className = "material-copy";
    addText(copy, "strong", "", "Homework");
    addText(
      copy,
      "span",
      `material-state ${homeworkLinks.length ? "live" : "muted"}`,
      homeworkLinks.length
        ? `${homeworkLinks.length} student task${homeworkLinks.length === 1 ? "" : "s"}`
        : "No separate portal homework",
    );
    if (homeworkLinks.length) {
      addText(
        copy,
        "p",
        "material-note",
        "Student answers autosave and submissions appear in the private workspace in the same student layout.",
      );
    }

    const tools = document.createElement("div");
    tools.className = "material-tools";
    const controlLink = actionLink({
      label: "Open controls and synced work",
      href: config.homeworkWorkspace,
      primary: true,
    });
    if (homeworkLinks.length && controlLink) {
      const controlWrap = document.createElement("div");
      controlWrap.className = "material-control material-control-link";
      addText(controlWrap, "span", "", "Release");
      controlWrap.append(controlLink);
      tools.append(controlWrap);
    }

    const taskList = document.createElement("div");
    taskList.className = "homework-task-list";
    homeworkLinks.forEach((item) => {
      const task = document.createElement("article");
      task.className = "homework-task";
      const taskCopy = document.createElement("div");
      addText(taskCopy, "strong", "", item.label);
      addText(
        taskCopy,
        "span",
        "",
        item.teacherHref
          ? "Matched student and teacher versions"
          : item.teacherNote || "Student version",
      );
      const taskActions = document.createElement("div");
      taskActions.className = "material-actions";
      [
        {
          label: "Preview student version",
          href: new URL(item.href, config.studentSite).href,
        },
        { label: "Open teacher version", href: item.teacherHref },
      ].forEach((action) => {
        const link = actionLink(action);
        if (link) taskActions.append(link);
      });
      task.append(taskCopy, taskActions);
      taskList.append(task);
    });
    if (homeworkLinks.length) tools.append(taskList);
    row.append(copy, tools);
    return row;
  }

  function resourceCard(resource) {
    const state = resolvedState(resource);
    const changed = statesDiffer(resource, state);
    const card = document.createElement("details");
    card.className = `release-card${changed ? " draft-change" : ""}`;
    card.dataset.resourceId = resource.id;
    card.dataset.sectionKey = `class-${resource.id}`;
    card.open = true;

    const heading = document.createElement("summary");
    heading.className = "release-card-heading";
    const titleBlock = document.createElement("span");
    addText(titleBlock, "span", "eyebrow", `${resource.date} · ${resource.eyebrow}`);
    addText(titleBlock, "span", "release-card-title", resource.title);
    const statusChips = document.createElement("span");
    statusChips.className = "release-status-chips";
    addText(
      statusChips,
      "span",
      `sync-chip ${changed ? "pending" : "live"}`,
      changed ? "Draft change" : "Matches live",
    );
    addText(
      statusChips,
      "span",
      `sync-chip ${state.released ? "live" : "locked"}`,
      state.released ? "Released" : "Locked",
    );
    addText(statusChips, "span", "card-toggle-label", "");
    heading.append(titleBlock, statusChips);

    const body = document.createElement("div");
    body.className = "release-card-body";

    const materials = document.createElement("div");
    materials.className = "material-sections";
    const studentHref = resource.files[0]?.href
      ? new URL(resource.files[0].href, config.studentSite).href
      : "";
    const studentHandoutHref = config.studentHandoutsByResource?.[resource.id]
      ? new URL(config.studentHandoutsByResource[resource.id], config.studentSite).href
      : studentHref;
    const teacherHref = config.matchedTeacherFiles?.[resource.id];
    materials.append(
      sectionRow({
        label: "Class handout",
        status: state.released ? "Student release on" : "Student release locked",
        tone: state.released ? "live" : "locked",
        note: teacherHref
          ? "Teacher version keeps the student order and adds answers, explanation, and annotation."
          : "No matched teacher version is registered for this class.",
        control: labelledSelect(
          "Student release",
          "released",
          [["true", "Released"], ["false", "Locked"]],
          state,
          resource,
        ),
        links: [
          { label: "Preview student version", href: studentHandoutHref },
          { label: "Open teacher version", href: teacherHref },
          { label: "Open/Check student page", href: studentHref },
        ],
      }),
    );

    const homeworkLinks = config.homeworkByResource?.[resource.id] || [];
    materials.append(homeworkSection(homeworkLinks));

    const reviewReady = state.reviewVisible && resource.review.trim().length > 0;
    materials.append(
      sectionRow({
        label: "Class summary",
        status: reviewReady
          ? "Released on student class page"
          : resource.review.trim()
            ? "Saved, not released"
            : "No saved summary",
        tone: reviewReady ? "live" : "locked",
        note:
          "Summary release is independent. Empty or hidden summary content stays absent from the student page.",
        control: labelledSelect(
          "Summary release",
          "reviewVisible",
          [["true", "Released"], ["false", "Hidden"]],
          state,
          resource,
        ),
        links: [
          { label: "Open student summary", href: reviewReady ? studentHref : "" },
          { label: "Edit summary", href: config.controlSheet },
        ],
      }),
    );

    const settings = document.createElement("details");
    settings.className = "class-settings";
    const settingsHeading = document.createElement("summary");
    settingsHeading.textContent = "Class entry settings";
    const controls = document.createElement("div");
    controls.className = "control-grid";
    controls.append(
      labelledSelect("List on portal", "listed", [["true", "On"], ["false", "Off"]], state, resource),
      labelledSelect("Show guidance", "guidanceVisible", [["true", "On"], ["false", "Off"]], state, resource),
      labelledSelect("Placement", "archived", [["false", "Active"], ["true", "Archived"]], state, resource),
    );
    settings.append(settingsHeading, controls);

    const footer = document.createElement("div");
    footer.className = "release-card-footer";
    addText(footer, "p", "evidence-copy", resource.evidence);

    body.append(materials, settings, footer);
    card.append(heading, body);
    return card;
  }

  function renderBoards() {
    const releasedBoard = document.querySelector("#released-release-board");
    const lockedBoard = document.querySelector("#locked-release-board");
    const archiveBoard = document.querySelector("#archive-release-board");
    releasedBoard.replaceChildren();
    lockedBoard.replaceChildren();
    archiveBoard.replaceChildren();

    [...data.resources].reverse().forEach((resource) => {
      const state = resolvedState(resource);
      const destination = state.archived
        ? archiveBoard
        : state.released
          ? releasedBoard
          : lockedBoard;
      destination.append(resourceCard(resource));
    });

    if (!releasedBoard.children.length) {
      addText(releasedBoard, "p", "empty-state", "No class date is currently released.");
    }
    if (!lockedBoard.children.length) {
      addText(lockedBoard, "p", "empty-state", "No future or locked class date.");
    }
    if (!archiveBoard.children.length) {
      addText(
        archiveBoard,
        "p",
        "empty-state",
        "Archived class dates will appear here with their original subsections.",
      );
    }
    document.querySelector("#released-board-count").textContent =
      String(releasedBoard.querySelectorAll(".release-card").length);
    document.querySelector("#locked-board-count").textContent =
      String(lockedBoard.querySelectorAll(".release-card").length);
    renderOverview();
    restoreSectionStates(document);
  }

  function renderOverview() {
    const states = data.resources.map((resource) => ({
      state: resolvedState(resource),
      changed: statesDiffer(resource, resolvedState(resource)),
    }));
    document.querySelector("#released-class-count").textContent = String(
      states.filter((item) => !item.state.archived && item.state.released).length,
    );
    document.querySelector("#locked-class-count").textContent = String(
      states.filter((item) => !item.state.archived && !item.state.released).length,
    );
    document.querySelector("#draft-change-count").textContent = String(
      states.filter((item) => item.changed).length,
    );
    document.querySelector("#booster-count").textContent = String(
      (config.boosters || []).length,
    );
  }

  function renderBoosters() {
    const board = document.querySelector("#booster-board");
    board.replaceChildren();
    (config.boosters || []).forEach((booster) => {
      const card = document.createElement("article");
      card.className = "booster-card";
      const copy = document.createElement("div");
      addText(copy, "p", "eyebrow", booster.status);
      addText(copy, "h3", "", booster.title);
      addText(copy, "p", "booster-note", booster.note);
      const actions = document.createElement("div");
      actions.className = "material-actions";
      [
        {
          label: "Open student booster",
          href: new URL(booster.studentRoute, config.studentSite).href,
        },
        { label: "Open private course book", href: booster.teacherHref },
      ].forEach((item) => {
        if (!item.href) return;
        const link = document.createElement("a");
        link.href = item.href;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = item.label;
        actions.append(link);
      });
      card.append(copy, actions);
      board.append(card);
    });
    if (!board.children.length) {
      addText(board, "p", "empty-state", "No Skill Booster resource is approved.");
    }
  }

  function installSectionMemory() {
    document.addEventListener(
      "toggle",
      (event) => {
        const section = event.target;
        if (!section.matches?.("details[data-section-key]")) return;
        localStorage.setItem(
          sectionStatePrefix + section.dataset.sectionKey,
          section.open ? "1" : "0",
        );
      },
      true,
    );
  }

  function restoreSectionStates(root) {
    root.querySelectorAll("details[data-section-key]").forEach((section) => {
      const saved = localStorage.getItem(
        sectionStatePrefix + section.dataset.sectionKey,
      );
      if (saved === "1" || saved === "0") section.open = saved === "1";
    });
  }

  function handleControlChange(event) {
    const select = event.target.closest("select[data-resource-id]");
    if (!select) return;
    const resource = resourceById.get(select.dataset.resourceId);
    const next = {
      ...resolvedState(resource),
      [select.dataset.field]: select.value === "true",
    };
    if (statesDiffer(resource, next)) draft[resource.id] = next;
    else delete draft[resource.id];
    saveDraft();
    renderBoards();
  }

  function changePlan() {
    return data.resources
      .filter((resource) => draft[resource.id])
      .map((resource) => ({
        id: resource.id,
        title: resource.title,
        live: liveState(resource),
        requested: resolvedState(resource),
      }));
  }

  async function copyPlan() {
    const plan = changePlan();
    const status = document.querySelector("#copy-status");
    if (!plan.length) {
      status.textContent = "No draft changes to copy.";
      return;
    }
    const text = JSON.stringify(
      {
        portal: "Nelson IELTS/B2",
        liveCommit: config.verifiedCommit,
        changes: plan,
        boundary:
          "Publication request only. Update GitHub, verify production, then refresh Live State.",
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "Change plan copied. Record it in the durable control sheet.";
    } catch {
      status.textContent = "Copy was blocked. Open the durable control sheet.";
    }
  }

  function resetPlan() {
    draft = {};
    localStorage.removeItem(draftKey);
    renderBoards();
    document.querySelector("#copy-status").textContent =
      "Draft reset to the verified live state.";
  }

  function bindLinks() {
    document.querySelectorAll("[data-private-link]").forEach((link) => {
      link.href = config[link.dataset.privateLink];
    });
  }

  function randomId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)
    );
  }

  function viewerDeviceId() {
    const existing = localStorage.getItem(viewerDeviceKey);
    if (existing) return existing;
    const created = randomId();
    localStorage.setItem(viewerDeviceKey, created);
    return created;
  }

  function requestPresence(action, parameters) {
    return new Promise((resolve, reject) => {
      const callbackName =
        "__nelsonTeacherPresence" +
        Date.now() +
        Math.random().toString(16).slice(2);
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Presence request timed out."));
      }, 10000);
      function cleanup() {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      }
      window[callbackName] = (result) => {
        cleanup();
        resolve(result);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("Presence request failed."));
      };
      const query = new URLSearchParams({
        ...parameters,
        action,
        callback: callbackName,
        _: String(Date.now()),
      });
      script.src = `${config.presenceEndpoint}?${query.toString()}`;
      document.head.append(script);
    });
  }

  function clearTeacherDevicePresence() {
    if (!presenceToken) return;
    fetch(config.presenceEndpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "clearViewerPresence",
        accessToken: presenceToken,
        deviceId: viewerDeviceId(),
      }),
    }).catch(() => {
      // The next status refresh will still exclude expired sessions.
    });
  }

  function renderPresence(result) {
    const count = Number(result?.activeViewerCount) || 0;
    const status = count > 0 ? "online" : "offline";
    const noun = count === 1 ? "student device" : "student devices";
    document.querySelector("#active-viewer-count").textContent = String(count);
    document.querySelector("#presence-detail").textContent =
      `${count} ${noun} active in the last ${result.expirySeconds || 90} seconds. This teacher device is excluded.`;
    const chip = document.querySelector("#presence-status");
    chip.className = `presence-status ${status}`;
    chip.textContent = status === "online" ? "Student online" : "No student online";
  }

  function renderPresenceError() {
    document.querySelector("#presence-detail").textContent =
      "The live presence service is unavailable. This does not affect the student site.";
    const chip = document.querySelector("#presence-status");
    chip.className = "presence-status error";
    chip.textContent = "Unavailable";
  }

  async function refreshPresence() {
    if (!presenceToken) return;
    try {
      const result = await requestPresence("getViewerPresence", {
        accessToken: presenceToken,
      });
      if (!result?.ok) throw new Error("Presence response was not accepted.");
      renderPresence(result);
    } catch {
      renderPresenceError();
    }
  }

  async function startPresencePanel() {
    localStorage.setItem(roleKey, "teacher");
    try {
      const accessResult = await requestPresence("verifyPortalAccess", {
        answerHash: window.NelsonTeacherAccess.answerHash,
      });
      if (!accessResult?.ok || !accessResult.allowed || !accessResult.accessToken) {
        throw new Error("Teacher presence access was not accepted.");
      }
      presenceToken = accessResult.accessToken;
      clearTeacherDevicePresence();
      await refreshPresence();
      window.clearInterval(presenceTimer);
      presenceTimer = window.setInterval(refreshPresence, 20000);
    } catch {
      renderPresenceError();
    }
  }

  async function loadVerifiedCommit() {
    const target = document.querySelector("#verified-commit");
    target.textContent = config.verifiedCommit;
    try {
      const response = await fetch(config.repositoryApi, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) return;
      const commit = await response.json();
      if (commit.sha) {
        config.verifiedCommit = commit.sha.slice(0, 7);
        target.textContent = config.verifiedCommit;
      }
    } catch {
      // Keep the fallback when the public GitHub API is unavailable.
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    installSectionMemory();
    bindLinks();
    renderBoosters();
    renderBoards();
    loadVerifiedCommit();
    document.body.addEventListener("change", handleControlChange);
    document.querySelector("#copy-plan").addEventListener("click", copyPlan);
    document.querySelector("#reset-plan").addEventListener("click", resetPlan);
    document.querySelector("#lock-teacher-portal").addEventListener("click", () => {
      localStorage.removeItem("nelsonTeacherPortalAccess");
      window.location.reload();
    });
    window.NelsonTeacherAccess.ready.then(startPresencePanel);
  });
})();

(function () {
  "use strict";

  const data = window.NELSON_PORTAL_DATA;
  const config = window.NELSON_TEACHER_PORTAL;
  const draftKey = "nelsonTeacherReleaseDraftV2";
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

  function sectionRow(label, status, links) {
    const row = document.createElement("div");
    row.className = "material-row";
    const copy = document.createElement("div");
    addText(copy, "strong", "", label);
    addText(copy, "span", "", status);
    const actions = document.createElement("div");
    actions.className = "material-actions";
    links.forEach((item) => {
      if (!item?.href) return;
      const link = document.createElement("a");
      link.href = item.href;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = item.label;
      actions.append(link);
    });
    row.append(copy, actions);
    return row;
  }

  function resourceCard(resource) {
    const state = resolvedState(resource);
    const changed = statesDiffer(resource, state);
    const card = document.createElement("article");
    card.className = `release-card${changed ? " draft-change" : ""}`;
    card.dataset.resourceId = resource.id;

    const heading = document.createElement("div");
    heading.className = "release-card-heading";
    const titleBlock = document.createElement("div");
    addText(titleBlock, "p", "eyebrow", `${resource.date} · ${resource.eyebrow}`);
    addText(titleBlock, "h3", "", resource.title);
    const sync = addText(
      heading,
      "span",
      `sync-chip ${changed ? "pending" : "live"}`,
      changed ? "Draft change" : "Matches live",
    );
    heading.append(titleBlock, sync);

    const controls = document.createElement("div");
    controls.className = "control-grid";
    controls.append(
      labelledSelect("List", "listed", [["true", "On"], ["false", "Off"]], state, resource),
      labelledSelect("Access", "released", [["true", "Released"], ["false", "Locked"]], state, resource),
      labelledSelect("Guidance", "guidanceVisible", [["true", "On"], ["false", "Off"]], state, resource),
      labelledSelect("Placement", "archived", [["false", "Active"], ["true", "Archived"]], state, resource),
      labelledSelect("Review", "reviewVisible", [["true", "On"], ["false", "Off"]], state, resource),
    );

    const materials = document.createElement("div");
    materials.className = "material-sections";
    const studentHref = resource.files[0]?.href
      ? new URL(resource.files[0].href, config.studentSite).href
      : config.studentSite;
    const teacherHref = config.matchedTeacherFiles?.[resource.id];
    materials.append(
      sectionRow(
        "Class handout",
        teacherHref ? "Matched learner and teacher routes" : "Student class route",
        [
          { label: "Student version", href: studentHref },
          { label: "Matched teacher version", href: teacherHref },
        ],
      ),
    );

    const homeworkLinks = config.homeworkByResource?.[resource.id] || [];
    materials.append(
      sectionRow(
        "Homework",
        homeworkLinks.length ? `${homeworkLinks.length} portal task${homeworkLinks.length === 1 ? "" : "s"}` : "No separate portal homework",
        homeworkLinks.map((item) => ({
          label: item.label,
          href: new URL(item.href, config.studentSite).href,
        })).concat(
          homeworkLinks.length
            ? [{ label: "Teacher controls", href: config.homeworkWorkspace }]
            : [],
        ),
      ),
    );

    const reviewReady = state.reviewVisible && resource.review.trim().length > 0;
    materials.append(
      sectionRow(
        "Class summary",
        reviewReady ? "Visible on the student class page" : "Hidden",
        reviewReady ? [{ label: "Open class page", href: studentHref }] : [],
      ),
    );

    const footer = document.createElement("div");
    footer.className = "release-card-footer";
    addText(footer, "p", "evidence-copy", resource.evidence);

    card.append(heading, controls, materials, footer);
    return card;
  }

  function renderBoards() {
    const activeBoard = document.querySelector("#active-release-board");
    const archiveBoard = document.querySelector("#archive-release-board");
    activeBoard.replaceChildren();
    archiveBoard.replaceChildren();

    data.resources.forEach((resource) => {
      const state = resolvedState(resource);
      const destination = state.archived ? archiveBoard : activeBoard;
      destination.append(resourceCard(resource));
    });

    if (!activeBoard.children.length) {
      addText(activeBoard, "p", "empty-state", "No active class dates.");
    }
    if (!archiveBoard.children.length) {
      addText(
        archiveBoard,
        "p",
        "empty-state",
        "Archived class dates will appear here with their original subsections.",
      );
    }
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
    bindLinks();
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

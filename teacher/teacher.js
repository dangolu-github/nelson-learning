(function () {
  "use strict";

  const data = window.NELSON_PORTAL_DATA;
  const config = window.NELSON_TEACHER_PORTAL;
  const draftKey = "nelsonTeacherReleaseDraftV1";
  if (!data || !config) return;

  const resourceById = new Map(
    data.resources.map((resource) => [resource.id, resource]),
  );

  function initialState(resource) {
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
    return { ...initialState(resource), ...(draft[resource.id] || {}) };
  }

  function statesDiffer(resource, state) {
    const live = initialState(resource);
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

  function summaryCard(label, value, note) {
    const card = document.createElement("article");
    addText(card, "span", "summary-label", label);
    addText(card, "strong", "summary-value", String(value));
    addText(card, "p", "summary-note", note);
    return card;
  }

  function renderSummary() {
    const listed = data.resources.filter((resource) => resource.listed).length;
    const released = data.resources.filter(
      (resource) => resource.listed && resource.released,
    ).length;
    const locked = data.resources.filter(
      (resource) => resource.listed && !resource.released,
    ).length;
    const reviews = data.resources.filter(
      (resource) =>
        resource.listed &&
        resource.reviewVisible &&
        resource.review.trim().length > 0,
    ).length;
    const summary = document.querySelector("#summary-cards");
    summary.replaceChildren(
      summaryCard("Listed", listed, "Visible class cards"),
      summaryCard("Released", released, "Open student routes"),
      summaryCard("Locked", locked, "Listed but unavailable"),
      summaryCard("Reviews", reviews, "Visible review sections"),
    );
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

  function renderBoard() {
    const board = document.querySelector("#release-board");
    board.replaceChildren();

    data.resources.forEach((resource) => {
      const state = resolvedState(resource);
      const changed = statesDiffer(resource, state);
      const card = document.createElement("article");
      card.className = `release-card${changed ? " draft-change" : ""}`;
      card.dataset.resourceId = resource.id;

      const heading = document.createElement("div");
      heading.className = "release-card-heading";
      const titleBlock = document.createElement("div");
      addText(titleBlock, "p", "eyebrow", `${resource.eyebrow} · ${resource.date}`);
      addText(titleBlock, "h3", "", resource.title);
      const sync = addText(
        heading,
        "span",
        `sync-chip ${changed ? "pending" : "live"}`,
        changed ? "Draft change" : "Matches live",
      );
      sync.setAttribute("aria-label", changed ? "Draft differs from live site" : "Draft matches live site");
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

      const footer = document.createElement("div");
      footer.className = "release-card-footer";
      addText(footer, "p", "evidence-copy", resource.evidence);
      const route = document.createElement("a");
      route.href = resource.files[0]?.href
        ? new URL(resource.files[0].href, config.studentSite).href
        : config.studentSite;
      route.target = "_blank";
      route.rel = "noopener";
      route.textContent = resource.released ? "Open student route" : "Open student portal";
      footer.append(route);

      card.append(heading, controls, footer);
      board.append(card);
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
    if (statesDiffer(resource, next)) {
      draft[resource.id] = next;
    } else {
      delete draft[resource.id];
    }
    saveDraft();
    renderBoard();
  }

  function changePlan() {
    return data.resources
      .filter((resource) => draft[resource.id])
      .map((resource) => ({
        id: resource.id,
        title: resource.title,
        live: initialState(resource),
        requested: resolvedState(resource),
      }));
  }

  async function copyPlan() {
    const plan = changePlan();
    const status = document.querySelector("#copy-status");
    if (plan.length === 0) {
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
      status.textContent = "Change plan copied. Record it in the private control sheet.";
    } catch {
      status.textContent = "Copy was blocked by the browser. Open the private control sheet instead.";
    }
  }

  function resetPlan() {
    draft = {};
    localStorage.removeItem(draftKey);
    renderBoard();
    document.querySelector("#copy-status").textContent = "Draft reset to the verified live state.";
  }

  function bindLinks() {
    document.querySelectorAll("[data-private-link]").forEach((link) => {
      link.href = config[link.dataset.privateLink];
    });
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
      // Keep the honest fallback when the public GitHub API is unavailable.
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindLinks();
    renderSummary();
    renderBoard();
    loadVerifiedCommit();
    document.querySelector("#release-board").addEventListener("change", handleControlChange);
    document.querySelector("#copy-plan").addEventListener("click", copyPlan);
    document.querySelector("#reset-plan").addEventListener("click", resetPlan);
    document.querySelector("#lock-teacher-portal").addEventListener("click", () => {
      localStorage.removeItem("nelsonTeacherPortalAccess");
      window.location.reload();
    });
  });
})();

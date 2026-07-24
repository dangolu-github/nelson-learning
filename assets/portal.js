(function () {
  "use strict";

  const data = window.NELSON_PORTAL_DATA;
  if (!data) return;

  const active = data.resources.filter((resource) => resource.listed);

  function resourceCard(resource) {
    const landingPage =
      resource.released && resource.files.length > 0
        ? resource.files[0].href
        : "";
    const status = resource.released ? "Open class" : "Not released";
    const wrapper = landingPage ? "a" : "div";
    const href = landingPage ? ` href="${landingPage}"` : "";
    return `
      <article class="date-entry">
        <${wrapper} class="date-entry-link"${href}>
        <div class="date-entry-date">
          <strong>${resource.date}</strong>
          <span>${resource.eyebrow}</span>
        </div>
        <div class="date-entry-copy">
          <h3>${resource.title}</h3>
          <p>${resource.summary}</p>
        </div>
        <span class="date-entry-action">${status} →</span>
        </${wrapper}>
      </article>`;
  }

  document.querySelector("#resource-list").innerHTML = active
    .map(resourceCard)
    .join("");

  document.querySelector("#lock-portal").addEventListener("click", () => {
    window.NelsonPortalAccess?.clear();
    window.location.reload();
  });
})();

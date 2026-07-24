(function () {
  "use strict";

  const data = window.NELSON_PORTAL_DATA;
  if (!data) return;

  const active = data.resources.filter(
    (resource) => resource.listed && !resource.archived,
  );
  const archived = data.resources.filter(
    (resource) => resource.listed && resource.archived,
  );
  const reviews = data.resources.filter(
    (resource) =>
      resource.listed &&
      resource.reviewVisible &&
      resource.review.trim().length > 0,
  );

  function tags(skills) {
    return skills
      .map((skill) => `<span class="skill-tag">${skill}</span>`)
      .join("");
  }

  function actions(resource) {
    if (!resource.released || resource.files.length === 0) {
      return `<span class="locked-copy">Available when released</span>`;
    }
    return resource.files
      .map((file) => `<a class="open-button" href="${file.href}">${file.label}</a>`)
      .join("");
  }

  function resourceCard(resource) {
    const guidance =
      resource.guidance && resource.released
        ? `<div class="guidance-box"><strong>How to use it</strong><p>${resource.guidance}</p></div>`
        : "";
    return `
      <article class="resource-row">
        <div class="resource-date">
          <span>${resource.eyebrow}</span>
          <strong>${resource.date}</strong>
        </div>
        <div class="resource-body">
          <div class="resource-title-line">
            <h3>${resource.title}</h3>
            <span class="availability ${resource.released ? "available" : "locked"}">
              ${resource.released ? "Available" : "Locked"}
            </span>
          </div>
          <p>${resource.summary}</p>
          <div class="tag-row">${tags(resource.skills)}</div>
          ${guidance}
          <p class="evidence-line">${resource.evidence}</p>
        </div>
        <div class="resource-action">${actions(resource)}</div>
      </article>`;
  }

  document.querySelector("#resource-list").innerHTML = active
    .map(resourceCard)
    .join("");

  if (reviews.length > 0) {
    const reviewSection = document.querySelector("#class-review");
    reviewSection.hidden = false;
    document.querySelector("#review-nav").hidden = false;
    document.querySelector("#review-list").innerHTML = reviews
      .map(
        (resource) => `
          <article>
            <p class="eyebrow">${resource.eyebrow} · ${resource.date}</p>
            <h3>${resource.title}</h3>
            <p class="review-copy">${resource.review}</p>
          </article>`,
      )
      .join("");
  }

  if (archived.length > 0) {
    const archive = document.querySelector("#archive");
    archive.hidden = false;
    document.querySelector("#archive-nav").hidden = false;
    document.querySelector("#archive-list").innerHTML = archived
      .map(
        (resource) => `
          <article>
            <div><strong>${resource.title}</strong><span>${resource.date}</span></div>
            ${actions(resource)}
          </article>`,
      )
      .join("");
  }

  document.querySelector("#lock-portal").addEventListener("click", () => {
    localStorage.removeItem("nelsonPortalAccess");
    window.location.reload();
  });
})();


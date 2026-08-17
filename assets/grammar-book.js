(function () {
  "use strict";

  const endpoint = window.NELSON_PORTAL_CONFIG?.grammarBookEndpoint || "";
  const fallbackUrl =
    window.NELSON_PORTAL_CONFIG?.grammarBookFallbackUrl || "";

  function findStatus(link) {
    return (
      link.closest(".file-card, .homework-intro, .book-note, .protected-book")
        ?.querySelector(".grammar-book-message") || null
    );
  }

  function showMessage(link, message) {
    const status = findStatus(link);
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
  }

  async function requestBookLink(accessToken) {
    const response = await fetch(endpoint, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "getGrammarBookLink",
        accessToken,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 403) {
      const error = new Error(
        "Your portal access has expired. Refresh this page and enter the portal word again.",
      );
      error.code = "PORTAL_ACCESS_EXPIRED";
      throw error;
    }
    if (!response.ok) {
      throw new Error(data?.error || "The protected book service is unavailable.");
    }
    if (!data?.ok || !data.url) {
      throw new Error(data?.error || "The grammar book is unavailable.");
    }
    return data.url;
  }

  async function openBook(event) {
    event.preventDefault();
    const link = event.currentTarget;
    if (link.dataset.loading === "true") return;

    link.dataset.loading = "true";
    link.setAttribute("aria-disabled", "true");
    showMessage(link, "Preparing the protected course book…");

    const bookWindow = window.open("about:blank", "_blank");
    if (bookWindow) {
      bookWindow.opener = null;
      bookWindow.document.title = "Opening course book…";
      bookWindow.document.body.textContent =
        "Preparing the protected course book…";
    }

    try {
      const accessToken = await window.NelsonPortalAccess?.ready;
      if (!accessToken) throw new Error("Open the portal first, then try again.");
      const url = await requestBookLink(accessToken);
      showMessage(
        link,
        "The course book is opening in a protected temporary link.",
      );
      if (bookWindow) bookWindow.location.replace(url);
      else window.location.assign(url);
    } catch (error) {
      if (error?.code === "PORTAL_ACCESS_EXPIRED") {
        if (bookWindow) bookWindow.close();
        window.NelsonPortalAccess?.clear();
        showMessage(link, error.message);
      } else if (fallbackUrl) {
        showMessage(
          link,
          "The protected link is temporarily unavailable. Opening the private Google Drive copy; sign in with an approved Google account.",
        );
        if (bookWindow) bookWindow.location.replace(fallbackUrl);
        else window.location.assign(fallbackUrl);
      } else {
        if (bookWindow) bookWindow.close();
        showMessage(
          link,
          error?.message || "The grammar book is unavailable. Try again.",
        );
      }
    } finally {
      link.dataset.loading = "false";
      link.removeAttribute("aria-disabled");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-grammar-book-link]").forEach((link) => {
      link.addEventListener("click", openBook);
    });
  });
})();

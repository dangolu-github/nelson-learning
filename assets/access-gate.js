(function () {
  "use strict";

  const endpoint = window.NELSON_PORTAL_CONFIG?.serviceEndpoint || "";
  const storageKey = "nelsonPortalAccessV2";
  let memoryToken = "";
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  window.NelsonPortalAccess = {
    ready,
    getToken: () => memoryToken || storedToken(),
    clear: () => {
      memoryToken = "";
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // The in-memory token is still cleared.
      }
    },
  };

  function revealPage() {
    document.documentElement.classList.add("portal-unlocked");
    document.querySelectorAll(".protected-page").forEach((element) => {
      element.hidden = false;
    });
    document.querySelector(".access-gate")?.remove();
    resolveReady(memoryToken || storedToken());
  }

  function bytesToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function digest(value) {
    const data = new TextEncoder().encode(value);
    return bytesToHex(await crypto.subtle.digest("SHA-256", data));
  }

  function buildGate(checking) {
    document.querySelector(".access-gate")?.remove();
    const gate = document.createElement("div");
    gate.className = "access-gate";
    gate.innerHTML = `
      <section class="access-panel" aria-labelledby="access-title">
        <p class="access-wordmark">NELSON</p>
        <p class="access-kicker">Private learning portal</p>
        <h1 id="access-title">${checking ? "Checking access…" : "Welcome back."}</h1>
        <p>${checking ? "Please wait a moment." : "Enter the portal word to open your current class materials."}</p>
        <form class="access-form" ${checking ? "hidden" : ""}>
          <label for="portal-word">Portal word</label>
          <input id="portal-word" name="portal-word" type="password" autocomplete="current-password" required autofocus>
          <small>Hint: your teacher’s first name, in lowercase.</small>
          <p class="access-error" role="alert" hidden>That portal word is not correct.</p>
          <button type="submit">Enter learning space</button>
        </form>
        <p class="access-error connection-error" role="alert" hidden>The portal connection is unavailable. Please try again.</p>
      </section>`;

    gate.querySelector("form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = gate.querySelector("input").value.trim();
      const button = gate.querySelector("button");
      button.disabled = true;
      button.textContent = "Checking…";
      try {
        const answerHash = await digest(value);
        request("verifyPortalAccess", { answerHash }, (data) => {
          if (data?.ok && data.allowed && data.accessToken) {
            memoryToken = data.accessToken;
            try {
              localStorage.setItem(storageKey, data.accessToken);
            } catch {
              // The in-memory token still works for this visit.
            }
            revealPage();
            return;
          }
          button.disabled = false;
          button.textContent = "Enter learning space";
          gate.querySelector(".access-form .access-error").hidden = false;
          gate.querySelector("input").select();
        }, () => showConnectionError(gate, button));
      } catch {
        showConnectionError(gate, button);
      }
    });
    document.body.prepend(gate);
  }

  function showConnectionError(gate, button) {
    button.disabled = false;
    button.textContent = "Try again";
    gate.querySelector(".connection-error").hidden = false;
  }

  function storedToken() {
    try {
      return localStorage.getItem(storageKey) || "";
    } catch {
      return memoryToken;
    }
  }

  async function request(action, parameters, success, failure) {
    if (!endpoint || endpoint.includes("__NELSON_")) {
      failure();
      return;
    }
    if (isDirectAppsScriptEndpoint()) {
      legacyJsonp(action, parameters, success, failure);
      return;
    }
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...parameters }),
      });
      if (!response.ok) throw new Error("Portal request failed.");
      success(await response.json());
    } catch {
      failure();
    }
  }

  function isDirectAppsScriptEndpoint() {
    try {
      return new URL(endpoint).hostname === "script.google.com";
    } catch {
      return false;
    }
  }

  function legacyJsonp(action, parameters, success, failure) {
    const callbackName =
      "__nelsonPortalGate" + Date.now() + Math.random().toString(16).slice(2);
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      failure();
    }, 10000);
    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }
    window[callbackName] = (data) => {
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
      callback: callbackName,
      _: String(Date.now()),
    });
    script.src = `${endpoint}?${query.toString()}`;
    document.head.append(script);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const token = storedToken();
    if (!token) {
      buildGate(false);
      return;
    }
    memoryToken = token;
    revealPage();
  });
})();

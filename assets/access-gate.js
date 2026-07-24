(function () {
  "use strict";

  const accessVersion = "nelson-access-v1";
  const expectedDigest =
    "358a3cd454c38404d1162e39500b2fca02ee644c45bc5a886af173579c1e9549";
  const storageKey = "nelsonPortalAccess";

  function revealPage() {
    document.documentElement.classList.add("portal-unlocked");
    document.querySelectorAll(".protected-page").forEach((element) => {
      element.hidden = false;
    });
    document.querySelector(".access-gate")?.remove();
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

  function buildGate() {
    const gate = document.createElement("div");
    gate.className = "access-gate";
    gate.innerHTML = `
      <section class="access-panel" aria-labelledby="access-title">
        <p class="access-wordmark">NELSON</p>
        <p class="access-kicker">Private learning portal</p>
        <h1 id="access-title">Welcome back.</h1>
        <p>Enter the portal word to open your current class materials.</p>
        <form class="access-form">
          <label for="portal-word">Portal word</label>
          <input id="portal-word" name="portal-word" type="password" autocomplete="current-password" required autofocus>
          <small>Hint: your teacher’s first name, in lowercase.</small>
          <p class="access-error" role="alert" hidden>That portal word is not correct.</p>
          <button type="submit">Enter learning space</button>
        </form>
      </section>`;

    gate.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = gate.querySelector("input").value.trim();
      const accepted = (await digest(value)) === expectedDigest;
      if (!accepted) {
        gate.querySelector(".access-error").hidden = false;
        gate.querySelector("input").select();
        return;
      }
      localStorage.setItem(storageKey, accessVersion);
      revealPage();
    });
    document.body.prepend(gate);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem(storageKey) === accessVersion) {
      revealPage();
      return;
    }
    buildGate();
  });
})();


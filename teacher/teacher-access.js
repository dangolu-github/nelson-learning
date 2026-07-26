(function () {
  "use strict";

  const accessVersion = "nelson-teacher-access-v1";
  const expectedDigest =
    "358a3cd454c38404d1162e39500b2fca02ee644c45bc5a886af173579c1e9549";
  const storageKey = "nelsonTeacherPortalAccess";
  const roleKey = "nelsonPortalDeviceRoleV1";
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  window.NelsonTeacherAccess = {
    ready,
    answerHash: expectedDigest,
  };

  function revealPage() {
    localStorage.setItem(roleKey, "teacher");
    document.documentElement.classList.add("portal-unlocked");
    document.querySelectorAll(".protected-page").forEach((element) => {
      element.hidden = false;
    });
    document.querySelector(".access-gate")?.remove();
    resolveReady();
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
      <section class="access-panel" aria-labelledby="teacher-access-title">
        <p class="access-wordmark">NELSON</p>
        <p class="access-kicker">Teacher operations</p>
        <h1 id="teacher-access-title">Open the teacher portal.</h1>
        <p>Enter the established portal word for this course.</p>
        <form class="access-form">
          <label for="teacher-portal-word">Portal word</label>
          <input id="teacher-portal-word" name="teacher-portal-word" type="password" autocomplete="current-password" required autofocus>
          <small>This screen is a convenience gate. Protected records still require Google sign-in.</small>
          <p class="access-error" role="alert" hidden>That portal word is not correct.</p>
          <button type="submit">Enter teacher portal</button>
        </form>
      </section>`;

    gate.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = gate.querySelector("input");
      const accepted = (await digest(input.value.trim())) === expectedDigest;
      if (!accepted) {
        gate.querySelector(".access-error").hidden = false;
        input.select();
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

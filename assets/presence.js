(function () {
  "use strict";

  const endpoint = window.NELSON_PORTAL_CONFIG?.serviceEndpoint || "";
  const access = window.NelsonPortalAccess;
  const deviceKey = "nelsonPortalViewerDeviceV1";
  const roleKey = "nelsonPortalDeviceRoleV1";
  const heartbeatMilliseconds = 25000;
  const sessionId = randomId();
  let timer = 0;

  if (!endpoint || !access?.ready) return;

  function randomId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)
    );
  }

  function storedValue(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function deviceId() {
    const existing = storedValue(deviceKey);
    if (existing) return existing;
    const created = randomId();
    try {
      localStorage.setItem(deviceKey, created);
    } catch {
      // The in-memory session can still report presence.
    }
    return created;
  }

  function isTeacherDevice() {
    return storedValue(roleKey) === "teacher";
  }

  function post(action, keepalive) {
    const accessToken = access.getToken();
    if (!accessToken) return;
    const payload = JSON.stringify({
      action,
      accessToken,
      deviceId: deviceId(),
      sessionId,
    });
    if (keepalive && navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, payload);
      return;
    }
    fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      keepalive: Boolean(keepalive),
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payload,
    }).catch(() => {
      // Presence is best-effort and must never interrupt learning.
    });
  }

  function clearPresence(keepalive) {
    window.clearInterval(timer);
    timer = 0;
    post("clearViewerPresence", keepalive);
  }

  function heartbeat() {
    if (document.hidden || isTeacherDevice()) {
      clearPresence(false);
      return;
    }
    post("updateViewerPresence", false);
  }

  function start() {
    if (isTeacherDevice()) {
      clearPresence(false);
      return;
    }
    heartbeat();
    window.clearInterval(timer);
    timer = window.setInterval(heartbeat, heartbeatMilliseconds);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearPresence(true);
    else start();
  });
  window.addEventListener("pagehide", () => clearPresence(true));
  window.addEventListener("storage", (event) => {
    if (event.key === roleKey && event.newValue === "teacher") {
      clearPresence(false);
    }
  });
  access.ready.then(start);
})();

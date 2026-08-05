"use strict";

const http = require("node:http");
const tcb = require("@cloudbase/node-sdk");

const port = Number(process.env.PORT || 9000);
const validatorEndpoint =
  "https://1308268428-5nk7gxecan.ap-hongkong.tencentscf.com";
const validatorOrigin = "https://dangolu-github.github.io";
const allowedOrigins = new Set([
  "https://dangolu-github.github.io",
  "https://nelson-learning-d9fqrndb7046a35a-1308268428.tcloudbaseapp.com",
]);
const bucketId =
  "6e65-nelson-learning-d9fqrndb7046a35a-1308268428";
const objectKey = "nelson-english-grammar-in-use.pdf";
const linkTtlSeconds = 600;
const maxBodyBytes = 32 * 1024;

const envId = "nelson-learning-d9fqrndb7046a35a";
const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
const fileId = `cloud://${envId}.${bucketId}/${objectKey}`;

function headers(origin) {
  const result = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (allowedOrigins.has(origin)) {
    result["Access-Control-Allow-Origin"] = origin;
  }
  return result;
}

function send(response, statusCode, body, origin = "") {
  response.writeHead(statusCode, headers(origin));
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBodyBytes) throw Object.assign(new Error(), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error(), { status: 400 });
  }
}

async function validPortalToken(accessToken) {
  if (typeof accessToken !== "string" || accessToken.length > 4096) return false;
  const response = await fetch(validatorEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
      Origin: validatorOrigin,
    },
    body: JSON.stringify({ action: "validatePortalAccess", accessToken }),
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result?.ok === true && result.allowed === true;
}

async function temporaryBookUrl() {
  const result = await app.getTempFileURL({
    fileList: [{ fileID: fileId, maxAge: linkTtlSeconds, urlType: "COS_URL" }],
  });
  const item = result?.fileList?.[0];
  if (!item?.tempFileURL || item.code !== "SUCCESS") throw new Error();
  return item.tempFileURL;
}

async function bookStatus() {
  const result = await app.getFileInfo({
    fileList: [{ fileID: fileId, maxAge: 60, urlType: "COS_URL" }],
  });
  const item = result?.fileList?.[0];
  return {
    exists: item?.code === "SUCCESS",
    size: Number(item?.size || 0),
    contentType: item?.contentType || "",
  };
}

async function handlePost(request, response, origin) {
  if (!allowedOrigins.has(origin)) {
    send(response, 403, { ok: false, error: "Origin is not allowed." });
    return;
  }
  const payload = await readJson(request);
  const allowed = await validPortalToken(payload?.accessToken);
  if (!allowed) {
    send(response, 403, { ok: false, error: "Portal access is required." }, origin);
    return;
  }

  if (payload.action === "getGrammarBookLink") {
    const url = await temporaryBookUrl();
    send(response, 200, { ok: true, url, expiresInSeconds: linkTtlSeconds }, origin);
    return;
  }

  if (payload.action === "getGrammarBookStatus") {
    send(response, 200, { ok: true, ...(await bookStatus()) }, origin);
    return;
  }

  send(response, 400, { ok: false, error: "Unsupported action." }, origin);
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  try {
    if (request.method === "OPTIONS") {
      if (!allowedOrigins.has(origin)) {
        send(response, 403, { ok: false, error: "Origin is not allowed." });
        return;
      }
      response.writeHead(204, headers(origin));
      response.end();
      return;
    }
    if (request.method === "GET") {
      send(response, 200, { ok: true, service: "nelson-grammar-book-link" }, origin);
      return;
    }
    if (request.method === "POST") {
      await handlePost(request, response, origin);
      return;
    }
    send(response, 405, { ok: false, error: "Method not allowed." }, origin);
  } catch (error) {
    send(response, error?.status || 502, { ok: false, error: "The protected book service is unavailable." }, origin);
  }
});

server.listen(port, "0.0.0.0");

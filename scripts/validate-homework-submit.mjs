import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const ignoredDirectories = new Set([".git", ".planning", "cloudbase-dist", "node_modules"]);
const requiredAssetVersion = "20260804-submit-always-v2";

async function listHtmlFiles(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const relativePath = path.join(relativeDirectory, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listHtmlFiles(absolutePath, relativePath)));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(relativePath);
    }
  }

  return files;
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function validateInteractivePage(relativePath, html) {
  const errors = [];
  const responseIds = [...html.matchAll(/data-response-id=["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
  if (!responseIds.length) return errors;

  const duplicateIds = responseIds.filter(
    (id, index) => responseIds.indexOf(id) !== index,
  );
  if (duplicateIds.length) {
    errors.push(`duplicate response IDs: ${[...new Set(duplicateIds)].join(", ")}`);
  }

  const panelIndex = html.search(/class=["'][^"']*homework-status/);
  const documentIndex = html.search(/class=["'][^"']*homework-document/);
  if (countMatches(html, /id=["']homework-submit["']/g) !== 1) {
    errors.push('must contain exactly one static id="homework-submit" control');
  }
  if (panelIndex < 0 || documentIndex < 0 || panelIndex > documentIndex) {
    errors.push("the static homework status/actions panel must precede the question document");
  }
  if (!/id=["']homework-submit["'][^>]*>\s*Submit homework\s*</.test(html)) {
    errors.push('the deliberate final action must use the label "Submit homework"');
  }
  if (!/window\.NELSON_HOMEWORK_CONFIG\s*=/.test(html)) {
    errors.push("NELSON_HOMEWORK_CONFIG is missing");
  }
  if (!new RegExp(`assets/homework\\.css\\?v=${requiredAssetVersion}`).test(html)) {
    errors.push(`homework.css must use cache version ${requiredAssetVersion}`);
  }
  if (!new RegExp(`assets/homework\\.js\\?v=${requiredAssetVersion}`).test(html)) {
    errors.push(`homework.js must use cache version ${requiredAssetVersion}`);
  }

  return errors.map((error) => `${relativePath}: ${error}`);
}

const htmlFiles = (await listHtmlFiles(repositoryRoot)).sort();
const failures = [];
let interactivePageCount = 0;
let responseCount = 0;

for (const relativePath of htmlFiles) {
  const html = await readFile(path.join(repositoryRoot, relativePath), "utf8");
  const pageResponseCount = countMatches(html, /data-response-id=["'][^"']+["']/g);
  if (pageResponseCount) {
    interactivePageCount += 1;
    responseCount += pageResponseCount;
  }
  failures.push(...validateInteractivePage(relativePath, html));
}

if (failures.length) {
  throw new Error(`Homework submission validation failed:\n${failures.join("\n")}`);
}

process.stdout.write(
  `Homework submission validation passed: ${interactivePageCount} pages, ${responseCount} response controls.\n`,
);

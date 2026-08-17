import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const releasedDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const learnerRoots = ["index.html", "boosters"];

async function listHtml(target, prefix = "") {
  const entries = await readdir(target, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(target, entry.name);
    if (entry.isDirectory()) files.push(...(await listHtml(absolute, relative)));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(relative);
  }
  return files;
}

const rootEntries = await readdir(repositoryRoot, { withFileTypes: true });
learnerRoots.push(
  ...rootEntries
    .filter((entry) => entry.isDirectory() && releasedDatePattern.test(entry.name))
    .map((entry) => entry.name),
);

const htmlFiles = [];
for (const root of learnerRoots) {
  const absolute = path.join(repositoryRoot, root);
  if (root.endsWith(".html")) htmlFiles.push(root);
  else htmlFiles.push(...(await listHtml(absolute, root)));
}

const blockedHosts = [
  "drive.google.com",
  "docs.google.com",
  "googleusercontent.com",
];
for (const relative of htmlFiles) {
  const html = await readFile(path.join(repositoryRoot, relative), "utf8");
  const blockedHost = blockedHosts.find((host) => html.includes(host));
  if (blockedHost) {
    throw new Error(`Learner HTML still depends on ${blockedHost}: ${relative}`);
  }
}

const grammarRoutes = [
  "boosters/grammar/index.html",
  "2026-07-24/homework-grammar/index.html",
  "2026-07-27/learning-handout.html",
  "2026-07-29/learning-handout.html",
];
for (const relative of grammarRoutes) {
  const html = await readFile(path.join(repositoryRoot, relative), "utf8");
  if (!html.includes("data-grammar-book-link")) {
    throw new Error(`Grammar book action is missing: ${relative}`);
  }
  if (!html.includes("grammar-book.js?v=20260817-drive-fallback-v1")) {
    throw new Error(`Grammar book action is not cache-busted: ${relative}`);
  }
}

process.stdout.write(
  `China learner-link validation passed: ${htmlFiles.length} HTML files, ${grammarRoutes.length} protected book routes.\n`,
);

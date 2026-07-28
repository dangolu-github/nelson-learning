import { cp, lstat, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(repositoryRoot, "cloudbase-dist");

const learnerRootFiles = ["index.html", "favicon.svg", "robots.txt"];
const learnerRootDirectories = ["assets", "boosters"];
const releasedDateDirectoryPattern = /^\d{4}-\d{2}-\d{2}$/;
const forbiddenSegments = new Set([
  ".git",
  ".github",
  ".planning",
  "docs",
  "private",
  "scripts",
  "teacher",
  "teacher-admin",
]);

function assertInsideRepository(targetPath) {
  const relative = path.relative(repositoryRoot, targetPath);
  if (
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Unsafe build target: ${targetPath}`);
  }
}

async function copyRequiredEntry(relativePath) {
  const source = path.join(repositoryRoot, relativePath);
  const destination = path.join(outputDirectory, relativePath);
  const sourceStats = await lstat(source);

  if (sourceStats.isSymbolicLink()) {
    throw new Error(`Learner release entry cannot be a symlink: ${relativePath}`);
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: sourceStats.isDirectory(),
    dereference: false,
    errorOnExist: true,
  });
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`Learner build contains a symlink: ${relativePath}`);
    }

    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`Unsupported learner build entry: ${relativePath}`);
    }
  }

  return files;
}

async function main() {
  assertInsideRepository(outputDirectory);
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  for (const file of learnerRootFiles) {
    await copyRequiredEntry(file);
  }

  for (const directory of learnerRootDirectories) {
    await copyRequiredEntry(directory);
  }

  const rootEntries = await readdir(repositoryRoot, { withFileTypes: true });
  const releasedDateDirectories = rootEntries
    .filter(
      (entry) =>
        entry.isDirectory() && releasedDateDirectoryPattern.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();

  if (releasedDateDirectories.length === 0) {
    throw new Error("No released date directories were found.");
  }

  for (const directory of releasedDateDirectories) {
    await copyRequiredEntry(directory);
  }

  const outputFiles = (await listFiles(outputDirectory)).sort();

  for (const file of outputFiles) {
    const segments = file.split("/");
    const forbiddenSegment = segments.find((segment) =>
      forbiddenSegments.has(segment),
    );
    if (forbiddenSegment) {
      throw new Error(
        `Private or operational path entered learner build: ${file}`,
      );
    }
  }

  if (!outputFiles.includes("index.html")) {
    throw new Error("Learner build is missing index.html.");
  }

  process.stdout.write(
    [
      `CloudBase learner build ready: ${outputFiles.length} files`,
      `Released date directories: ${releasedDateDirectories.join(", ")}`,
      `Output: ${outputDirectory}`,
    ].join("\n") + "\n",
  );
}

await main();

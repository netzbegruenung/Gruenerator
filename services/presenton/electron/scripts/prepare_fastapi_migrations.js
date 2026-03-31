const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(projectRoot, "..", "servers", "fastapi", "alembic", "versions");
const targetDir = path.join(projectRoot, "servers", "fastapi", "alembic", "versions");

function listPythonMigrations(dirPath) {
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".py"))
    .map((entry) => entry.name)
    .sort();
}

function extractRevisionInfo(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const revisionMatch = content.match(/revision:\s*str\s*=\s*['"]([^'"]+)['"]/);
  const downRevisionMatch = content.match(
    /down_revision:\s*[^=]*=\s*(None|['"][^'"]+['"])/
  );

  if (!revisionMatch) {
    throw new Error(`Missing revision id in ${filePath}`);
  }
  if (!downRevisionMatch) {
    throw new Error(`Missing down_revision in ${filePath}`);
  }

  const revision = revisionMatch[1];
  const downRaw = downRevisionMatch[1];
  const downRevision = downRaw === "None" ? null : downRaw.slice(1, -1);
  return { revision, downRevision };
}

function validateSingleHead(dirPath, filenames) {
  const revisions = new Map();
  const downRevisions = new Set();

  for (const filename of filenames) {
    const filePath = path.join(dirPath, filename);
    const { revision, downRevision } = extractRevisionInfo(filePath);
    if (revisions.has(revision)) {
      throw new Error(`Duplicate revision id ${revision} in ${filename}`);
    }
    revisions.set(revision, filename);
    if (downRevision) {
      downRevisions.add(downRevision);
    }
  }

  const heads = [...revisions.keys()].filter((revision) => !downRevisions.has(revision));
  if (heads.length !== 1) {
    throw new Error(
      `Expected exactly one Alembic head, found ${heads.length}: ${heads.join(", ")}`
    );
  }
}

function syncMigrations() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source migrations directory not found: ${sourceDir}`);
  }
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Target migrations directory not found: ${targetDir}`);
  }

  const sourceFiles = listPythonMigrations(sourceDir);
  if (sourceFiles.length === 0) {
    throw new Error(`No migration files found in source directory: ${sourceDir}`);
  }

  for (const filename of listPythonMigrations(targetDir)) {
    fs.unlinkSync(path.join(targetDir, filename));
  }

  for (const filename of sourceFiles) {
    fs.copyFileSync(path.join(sourceDir, filename), path.join(targetDir, filename));
  }

  const targetFiles = listPythonMigrations(targetDir);
  validateSingleHead(targetDir, targetFiles);

  console.log(
    `Synced ${targetFiles.length} migration files and verified a single Alembic head.`
  );
}

syncMigrations();

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { execFileSync } = require("child_process");

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));

const targetRoot = path.join(__dirname, "resources", "export");
const targetPyDir = path.join(targetRoot, "py");
const targetIndex = path.join(targetRoot, "index.js");
const cacheDir = path.join(__dirname, ".cache", "export-runtime");
const exportRepoBase = "https://github.com/presenton/presenton-export/releases/download";
const exportVersion = packageJson.exportVersion || "v0.1.0";

const cliArgs = new Set(process.argv.slice(2));
const forceDownload = cliArgs.has("--force");
const checkOnly = cliArgs.has("--check-only");

async function getTargetVersion() {
  const requestedVersion = process.env.EXPORT_RUNTIME_VERSION || exportVersion;
  if (requestedVersion !== "latest") {
    return requestedVersion;
  }

  const apiUrl = "https://api.github.com/repos/presenton/presenton-export/releases/latest";
  const latest = await requestJson(apiUrl);
  if (!latest.tag_name) {
    throw new Error(`Could not resolve latest release tag from ${apiUrl}`);
  }

  return latest.tag_name;
}

function getPlatformAssetName() {
  const platformArch = `${process.platform}-${process.arch}`;
  if (platformArch === "linux-x64") return "export-Linux-X64.zip";
  if (platformArch === "darwin-arm64") return "export-macOS-ARM64.zip";
  if (platformArch === "win32-x64") return "export-Windows-X64.zip";

  throw new Error(
    `Unsupported export runtime platform: ${platformArch}. Supported: linux-x64, darwin-arm64, win32-x64`
  );
}

function getConverterCandidates() {
  const platformAliases = {
    linux: ["linux"],
    darwin: ["darwin", "macos", "mac"],
    win32: ["win32", "windows", "win"],
  };
  const archAliases = {
    x64: ["x64", "amd64"],
    arm64: ["arm64", "aarch64"],
  };

  const candidates = [];
  const platforms = platformAliases[process.platform] || [process.platform];
  const archs = archAliases[process.arch] || [process.arch];
  const windows = process.platform === "win32";

  for (const p of platforms) {
    for (const a of archs) {
      candidates.push(path.join(targetPyDir, `convert-${p}-${a}`));
      candidates.push(path.join(targetPyDir, `convert-${p}-${a}.exe`));
    }
    candidates.push(path.join(targetPyDir, `convert-${p}`));
    candidates.push(path.join(targetPyDir, `convert-${p}.exe`));
  }

  if (windows) {
    candidates.push(path.join(targetPyDir, "convert.exe"));
  }
  candidates.push(path.join(targetPyDir, "convert"));

  return [...new Set(candidates)];
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function chmodIfPossible(filePath) {
  if (process.platform !== "win32") {
    fs.chmodSync(filePath, 0o755);
  }
}

function detectBinaryFormat(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);

    if (header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46) {
      return "elf";
    }

    if (header[0] === 0x4d && header[1] === 0x5a) {
      return "pe";
    }

    const magic = header.readUInt32BE(0);
    if (
      magic === 0xfeedface ||
      magic === 0xcefaedfe ||
      magic === 0xfeedfacf ||
      magic === 0xcffaedfe ||
      magic === 0xcafebabe ||
      magic === 0xbebafeca
    ) {
      return "mach-o";
    }

    return "unknown";
  } finally {
    fs.closeSync(fd);
  }
}

function isFormatCompatible(format) {
  if (process.platform === "darwin") return format === "mach-o";
  if (process.platform === "linux") return format === "elf";
  if (process.platform === "win32") return format === "pe";
  return true;
}

function validateExistingRuntime() {
  if (!fs.existsSync(targetIndex)) {
    return { ok: false, reason: `Missing runtime bundle: ${targetIndex}` };
  }

  const converterCandidates = getConverterCandidates();
  const converterPath = converterCandidates.find((candidate) => fs.existsSync(candidate));

  if (!converterPath) {
    return {
      ok: false,
      reason: [
        "No converter binary found in electron/resources/export/py.",
        "Expected one of:",
        ...converterCandidates.map((candidate) => `  - ${candidate}`),
      ].join("\n"),
    };
  }

  const binaryFormat = detectBinaryFormat(converterPath);
  if (!isFormatCompatible(binaryFormat)) {
    return {
      ok: false,
      reason: [
        `Converter binary is not valid for ${process.platform}/${process.arch}.`,
        `Selected converter: ${converterPath}`,
        `Detected format: ${binaryFormat}`,
      ].join("\n"),
    };
  }

  chmodIfPossible(converterPath);
  return { ok: true, converterPath };
}

function hasExportDirectoryContent() {
  if (!fs.existsSync(targetRoot)) return false;
  return fs.readdirSync(targetRoot).length > 0;
}

function request(url) {
  const client = url.startsWith("https:") ? https : http;
  return client;
}

function requestJson(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const client = request(url);
    const req = client.get(
      url,
      {
        headers: {
          "User-Agent": "presenton-export-runtime-sync",
          Accept: "application/vnd.github+json",
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirects <= 0) {
            reject(new Error(`Too many redirects for JSON request: ${url}`));
            return;
          }
          requestJson(res.headers.location, redirects - 1).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Failed to fetch ${url}. HTTP ${res.statusCode}`));
          return;
        }

        let payload = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          payload += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(payload));
          } catch (error) {
            reject(new Error(`Invalid JSON received from ${url}: ${error.message}`));
          }
        });
      }
    );

    req.on("error", reject);
  });
}

function downloadFile(url, outputPath, redirects = 5) {
  return new Promise((resolve, reject) => {
    const client = request(url);
    const req = client.get(
      url,
      {
        headers: {
          "User-Agent": "presenton-export-runtime-sync",
          Accept: "application/octet-stream",
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirects <= 0) {
            reject(new Error(`Too many redirects while downloading ${url}`));
            return;
          }
          downloadFile(res.headers.location, outputPath, redirects - 1).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Failed to download ${url}. HTTP ${res.statusCode}`));
          return;
        }

        ensureDir(path.dirname(outputPath));
        const fileStream = fs.createWriteStream(outputPath);
        res.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close(resolve);
        });
        fileStream.on("error", reject);
      }
    );

    req.on("error", reject);
  });
}

function unzipArchive(zipPath, destDir) {
  ensureDir(destDir);
  if (process.platform === "win32") {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`,
      ],
      { stdio: "inherit" }
    );
    return;
  }

  execFileSync("unzip", ["-o", zipPath, "-d", destDir], { stdio: "inherit" });
}

function resolveExtractedRoot(extractDir) {
  const directIndex = path.join(extractDir, "index.js");
  const directPy = path.join(extractDir, "py");
  if (fs.existsSync(directIndex) && fs.existsSync(directPy)) {
    return extractDir;
  }

  const children = fs.readdirSync(extractDir, { withFileTypes: true });
  for (const entry of children) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(extractDir, entry.name);
    const candidateIndex = path.join(candidate, "index.js");
    const candidatePy = path.join(candidate, "py");
    if (fs.existsSync(candidateIndex) && fs.existsSync(candidatePy)) {
      return candidate;
    }
  }

  throw new Error(`Unable to locate export runtime root under ${extractDir}`);
}

async function downloadAndInstallRuntime() {
  const tag = await getTargetVersion();
  const assetName = getPlatformAssetName();
  const downloadUrl = `${exportRepoBase}/${tag}/${assetName}`;

  ensureDir(cacheDir);
  const zipPath = path.join(cacheDir, assetName);
  const extractDir = path.join(cacheDir, `extract-${Date.now()}`);

  console.log(`[export-runtime] Downloading ${downloadUrl}`);
  await downloadFile(downloadUrl, zipPath);

  console.log(`[export-runtime] Extracting ${zipPath}`);
  unzipArchive(zipPath, extractDir);

  const sourceRoot = resolveExtractedRoot(extractDir);
  fs.rmSync(targetRoot, { recursive: true, force: true });
  ensureDir(targetRoot);
  fs.cpSync(sourceRoot, targetRoot, { recursive: true, force: true });

  fs.rmSync(extractDir, { recursive: true, force: true });

  return { tag, downloadUrl };
}

async function main() {
  const existing = validateExistingRuntime();

  if (checkOnly) {
    if (!existing.ok) {
      throw new Error(existing.reason);
    }
    console.log("[export-runtime] Existing runtime is valid.");
    console.log(`  - ${targetIndex}`);
    console.log(`  - ${existing.converterPath}`);
    return;
  }

  if (existing.ok && !forceDownload) {
    console.log("[export-runtime] Using existing runtime artifacts:");
    console.log(`  - ${targetIndex}`);
    console.log(`  - ${existing.converterPath}`);
    return;
  }

  if (!existing.ok && hasExportDirectoryContent()) {
    console.log("[export-runtime] Existing export directory is invalid, re-syncing package.");
  }

  const { tag, downloadUrl } = await downloadAndInstallRuntime();
  const installed = validateExistingRuntime();
  if (!installed.ok) {
    throw new Error(installed.reason);
  }

  console.log("[export-runtime] Runtime synced successfully:");
  console.log(`  - release: ${tag}`);
  console.log(`  - url: ${downloadUrl}`);
  console.log(`  - ${targetIndex}`);
  console.log(`  - ${installed.converterPath}`);
}

main().catch((error) => {
  console.error(`[export-runtime] ${error.message}`);
  process.exit(1);
});

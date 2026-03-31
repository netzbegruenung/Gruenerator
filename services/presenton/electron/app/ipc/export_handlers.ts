import { ipcMain } from "electron";
import { appDataDir, baseDir, downloadsDir, tempDir } from "../utils/constants";
import fs from "fs";
import path from "path";

import { showFileDownloadedDialog } from "../utils/dialog";
import { v4 as uuidv4 } from 'uuid';
import { spawn } from "child_process";
import { getPuppeteerExecutablePath } from "../utils/puppeteer-check";

type BinaryFormat = "elf" | "mach-o" | "pe" | "unknown";

export function setupExportHandlers() {
  ipcMain.handle("file-downloaded", async (_, filePath: string): Promise<IPCStatus> => {
    const fileName = path.basename(filePath);
    const destinationPath = path.join(downloadsDir, fileName);

    await fs.promises.rename(filePath, destinationPath);
    const success = await showFileDownloadedDialog(destinationPath);
    return { success };
  });

  ipcMain.handle("export-presentation", async (_, id: string, title: string, exportAs: "pptx" | "pdf" | "png") => {
    try {
      const params = new URLSearchParams({ id });
      if (process.env.NEXT_PUBLIC_FAST_API) {
        params.set("fastapiUrl", process.env.NEXT_PUBLIC_FAST_API);
      }
      const pptUrl = `${process.env.NEXT_PUBLIC_URL}/pdf-maker?${params.toString()}`;

      let exportTask = {
        type: "export",
        url: pptUrl,
        format: exportAs,
        title: title,
        fastapiUrl: process.env.NEXT_PUBLIC_FAST_API,
      }

      const randomUuid = uuidv4();
      const exportTempDir = path.join(tempDir, randomUuid);
      await fs.promises.mkdir(exportTempDir, { recursive: true });

      const exportTaskPath = path.join(exportTempDir, "export_task.json");
      await fs.promises.writeFile(exportTaskPath, JSON.stringify(exportTask));

      const exportScriptPath = path.join(baseDir, "resources", "export", "index.js");
      const pythonModulePath = await resolveConverterPath(baseDir);
      const puppeteerExecutablePath = await getPuppeteerExecutablePath();
      console.log("[Export] Spawning export task with config:", {
        exportAs,
        id,
        title,
        pptUrl,
        exportTaskPath,
        exportScriptPath,
        pythonModulePath,
        puppeteerExecutablePath,
        NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
        NEXT_PUBLIC_FAST_API: process.env.NEXT_PUBLIC_FAST_API,
      });
      // Use the current Electron binary in Node-compatible mode so export does
      // not depend on a system-wide `node` being available in PATH.
      const exportTaskProcess = spawn(process.execPath, [exportScriptPath, exportTaskPath], {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: baseDir,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          TEMP_DIRECTORY: tempDir,
          APP_DATA_DIRECTORY: appDataDir,
          NODE_ENV: "development",
          BUILT_PYTHON_MODULE_PATH: pythonModulePath,
          ...(puppeteerExecutablePath && {
            PUPPETEER_EXECUTABLE_PATH: puppeteerExecutablePath,
          }),
        },
      });

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      exportTaskProcess.stdout.on("data", (data: Buffer) => {
        const text = data.toString();
        stdoutChunks.push(text);
        console.log(`[Export] ${text}`);
      });
      exportTaskProcess.stderr.on("data", (data: Buffer) => {
        const text = data.toString();
        stderrChunks.push(text);
        console.error(`[Export] ${text}`);
      });

      await new Promise<void>((resolve, reject) => {
        exportTaskProcess.on("error", reject);
        exportTaskProcess.on("exit", (code) => {
          if (code === 0) {
            resolve();
          } else {
            const stderrText = stderrChunks.join("").trim() || "(no stderr)";
            const stdoutText = stdoutChunks.join("").trim();
            const detail =
              stderrText !== "(no stderr)"
                ? stderrText
                : stdoutText
                  ? `stdout: ${stdoutText}`
                  : "";
            reject(
              new Error(
                `Export process exited with code ${code}${detail ? `. ${detail}` : ""}`
              )
            );
          }
        });
      });

      const responsePath = exportTaskPath.replace(".json", ".response.json");
      const responseRaw = await fs.promises.readFile(responsePath, "utf8");
      const responseData = JSON.parse(responseRaw);
      const exportFilePath = resolveExportedFilePath(responseData);

      if (!exportFilePath) {
        return { success: false, message: "Export finished but output file was not found." };
      }

      const destinationPath = path.join(downloadsDir, path.basename(exportFilePath));
      await moveFile(exportFilePath, destinationPath);
      const success = await showFileDownloadedDialog(destinationPath);
      return { success, message: success ? "Export completed." : "Export completed but dialog failed." };
    } catch (error: any) {
      console.error("[Export] Error exporting presentation:", error);
      return { success: false, message: error?.message ?? "Export failed." };
    }
  })

}

async function resolveConverterPath(currentBaseDir: string): Promise<string> {
  const pyDir = path.join(currentBaseDir, "resources", "export", "py");
  const extension = process.platform === "win32" ? ".exe" : "";
  const converterCandidates = [
    path.join(pyDir, `convert-${process.platform}-${process.arch}${extension}`),
    path.join(pyDir, `convert-${process.platform}${extension}`),
    ...(process.platform === "win32"
      ? [path.join(pyDir, "convert.exe"), path.join(pyDir, "convert")]
      : [path.join(pyDir, "convert")]),
  ];

  const converterPath = await findFirstExistingPath(converterCandidates);
  if (!converterPath) {
    throw new Error(
      [
        "No converter binary found for export.",
        "Expected one of:",
        ...converterCandidates.map((candidate) => `  - ${candidate}`),
      ].join("\n")
    );
  }

  const format = await detectBinaryFormat(converterPath);
  if (!isBinaryFormatCompatible(format)) {
    throw new Error(
      [
        `Converter binary is not valid for ${process.platform}/${process.arch}.`,
        `Selected converter: ${converterPath}`,
        `Detected format: ${format}`,
        "Please bundle a platform-correct converter binary (for example convert-darwin-arm64 or convert-darwin-x64).",
      ].join("\n")
    );
  }

  return converterPath;
}

async function findFirstExistingPath(paths: string[]): Promise<string | null> {
  for (const candidate of paths) {
    try {
      await fs.promises.access(candidate, fs.constants.F_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

async function detectBinaryFormat(binaryPath: string): Promise<BinaryFormat> {
  const fd = await fs.promises.open(binaryPath, "r");
  try {
    const header = Buffer.alloc(4);
    await fd.read(header, 0, 4, 0);

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
    await fd.close();
  }
}

function isBinaryFormatCompatible(format: BinaryFormat): boolean {
  if (process.platform === "darwin") return format === "mach-o";
  if (process.platform === "linux") return format === "elf";
  if (process.platform === "win32") return format === "pe";
  return true;
}

function resolveExportedFilePath(responseData: any): string | null {
  if (responseData?.path && typeof responseData.path === "string") {
    return path.isAbsolute(responseData.path)
      ? responseData.path
      : path.join(appDataDir, responseData.path);
  }

  if (responseData?.url && typeof responseData.url === "string") {
    try {
      const parsed = new URL(responseData.url);
      if (parsed.protocol === "file:") {
        const filePath = decodeURIComponent(parsed.pathname);
        if (process.platform === "win32" && filePath.startsWith("/")) {
          return filePath.slice(1);
        }
        return filePath;
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function moveFile(sourcePath: string, destinationPath: string) {
  try {
    await fs.promises.rename(sourcePath, destinationPath);
  } catch (error: any) {
    if (error?.code !== "EXDEV") {
      throw error;
    }
    await fs.promises.copyFile(sourcePath, destinationPath);
    await fs.promises.unlink(sourcePath);
  }
}
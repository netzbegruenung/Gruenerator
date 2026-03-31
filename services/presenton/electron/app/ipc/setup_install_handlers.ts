/**
 * IPC handlers for the unified setup installer (LibreOffice + Chromium).
 * - setup:get-status — which dependencies are missing
 * - setup:install-chrome — download Chromium (browser-snapshots) with progress
 */

import { ipcMain, WebContents } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import puppeteer from "puppeteer";
import {
  Browser,
  detectBrowserPlatform,
  getInstalledBrowsers,
  install,
  resolveBuildId,
} from "@puppeteer/browsers";
import { getSetupStatus } from "../utils/setup-dependencies";

function getPuppeteerCacheDir(): string {
  const configCache =
    (puppeteer as any).configuration?.cacheDirectory ??
    (puppeteer as any).defaultDownloadPath;
  return configCache ?? path.join(os.homedir(), ".cache", "puppeteer");
}

function sendChromeProgress(
  wc: WebContents,
  phase: "downloading" | "extracting" | "done" | "error",
  percent?: number,
  message?: string
) {
  if (!wc.isDestroyed()) {
    wc.send("setup:chrome-progress", { phase, percent, message });
  }
}

function sendChromeLog(wc: WebContents, level: string, text: string) {
  if (!wc.isDestroyed()) {
    wc.send("setup:chrome-log", { level, text });
  }
}

export function setupSetupInstallHandlers() {
  ipcMain.handle("setup:get-status", () => {
    return getSetupStatus() ?? { needsLibreOffice: false, needsChrome: false };
  });

  ipcMain.handle(
    "setup:install-chrome",
    async (event): Promise<{ ok: boolean; error?: string }> => {
      const wc = event.sender;

      const cacheDir = getPuppeteerCacheDir();
      const platform = detectBrowserPlatform();
      if (!platform) {
        const msg = "Unable to detect platform.";
        sendChromeLog(wc, "error", msg);
        sendChromeProgress(wc, "error", undefined, msg);
        return { ok: false, error: msg };
      }

      let buildId: string;
      try {
        buildId = await resolveBuildId(
          Browser.CHROMIUM,
          platform,
          "latest" as "latest"
        );
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Unable to resolve Chromium revision.";
        sendChromeLog(wc, "error", msg);
        sendChromeProgress(wc, "error", undefined, msg);
        return { ok: false, error: msg };
      }

      sendChromeLog(wc, "info", `Downloading Chromium r${buildId}…`);
      sendChromeProgress(wc, "downloading", 0, "Connecting…");

      try {
        await install({
          cacheDir,
          platform,
          browser: Browser.CHROMIUM,
          buildId,
          downloadProgressCallback: (downloadedBytes, totalBytes) => {
            if (totalBytes > 0 && !wc.isDestroyed()) {
              const percent = Math.min(
                99,
                Math.round((downloadedBytes / totalBytes) * 100)
              );
              const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
              sendChromeProgress(
                wc,
                "downloading",
                percent,
                `${mb(downloadedBytes)} / ${mb(totalBytes)} MB`
              );
            }
          },
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Chromium download failed.";
        sendChromeLog(wc, "error", message);
        sendChromeProgress(wc, "error", undefined, message);
        return { ok: false, error: message };
      }

      sendChromeProgress(wc, "extracting", 100, "Extracting…");
      const browsers = await getInstalledBrowsers({ cacheDir });
      const chromium = browsers.find((b) => b.browser === Browser.CHROMIUM);
      if (chromium?.executablePath && fs.existsSync(chromium.executablePath)) {
        sendChromeLog(wc, "ok", `Chromium ready at ${chromium.executablePath}`);
      }
      sendChromeProgress(wc, "done", 100);
      return { ok: true };
    }
  );
}

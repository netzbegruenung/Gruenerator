import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("setupInstaller", {
  getStatus: () => ipcRenderer.invoke("setup:get-status"),

  installLibreOffice: () => ipcRenderer.invoke("lo:start-install"),
  installChrome: () => ipcRenderer.invoke("setup:install-chrome"),

  done: () => ipcRenderer.send("setup:done"),

  onLibreOfficeProgress: (
    cb: (data: { phase: string; percent?: number; message?: string }) => void
  ) => {
    ipcRenderer.on("lo:progress", (_event, data) => cb(data));
  },
  onLibreOfficeLog: (cb: (data: { level: string; text: string }) => void) => {
    ipcRenderer.on("lo:log", (_event, data) => cb(data));
  },

  onChromeProgress: (
    cb: (data: { phase: string; percent?: number; message?: string }) => void
  ) => {
    ipcRenderer.on("setup:chrome-progress", (_event, data) => cb(data));
  },
  onChromeLog: (cb: (data: { level: string; text: string }) => void) => {
    ipcRenderer.on("setup:chrome-log", (_event, data) => cb(data));
  },
});

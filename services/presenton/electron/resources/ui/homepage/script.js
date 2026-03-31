window.addEventListener("DOMContentLoaded", () => {
  const statusMap = {
    checking: "Checking...",
    installed: "Installed",
    missing: "Missing",
    installing: "Installing...",
    downloading: "Downloading...",
    downloaded: "Downloaded",
    skipped: "Skipped",
    failed: "Failed",
  };
  const labelMap = {
    libreoffice: "LibreOffice",
    puppeteer: "Chromium",
  };

  const dependenciesEl = document.getElementById("status-dependencies");
  const dependenciesIcon = document.getElementById("icon-dependencies");
  const dependenciesTooltip = document.getElementById("dependencies-tooltip");
  const libreofficeTooltip = document.getElementById("tooltip-libreoffice");
  const puppeteerTooltip = document.getElementById("tooltip-puppeteer");
  const libreofficeLabel = document.getElementById("tooltip-label-libreoffice");
  const puppeteerLabel = document.getElementById("tooltip-label-puppeteer");
  const currentStatus = {
    libreoffice: "checking",
    puppeteer: "checking",
  };

  function setStatus(name, status) {
    if (currentStatus[name] !== undefined) {
      currentStatus[name] = status;
    }
    if (dependenciesEl) dependenciesEl.textContent = "Dependencies";

    const statuses = Object.values(currentStatus);
    const hasError = statuses.some((s) => s === "missing" || s === "failed");
    const isBusy = statuses.some((s) => s === "checking" || s === "installing" || s === "downloading");
    const isDone = statuses.every((s) => s === "installed" || s === "downloaded" || s === "skipped");

    let iconClass = "loading";
    let iconText = "";
    if (hasError) {
      iconClass = "error";
      iconText = "×";
    } else if (isDone && !isBusy) {
      iconClass = "ok";
      iconText = "✓";
    } else {
      iconClass = "loading";
      iconText = "";
    }

    if (dependenciesIcon) {
      dependenciesIcon.className = `status-icon ${iconClass}`;
    }

    const libreofficeStatus = currentStatus.libreoffice;
    const puppeteerStatus = currentStatus.puppeteer;
    const libreofficeText = statusMap[libreofficeStatus] || libreofficeStatus;
    const puppeteerText = statusMap[puppeteerStatus] || puppeteerStatus;

    const toDotClass = (value) => {
      if (value === "missing" || value === "failed") return "error";
      if (value === "installed" || value === "downloaded" || value === "skipped") return "ok";
      return "loading";
    };

    if (libreofficeTooltip) libreofficeTooltip.textContent = libreofficeText;
    if (puppeteerTooltip) puppeteerTooltip.textContent = puppeteerText;
    if (libreofficeLabel) libreofficeLabel.className = `status-tooltip-label ${toDotClass(libreofficeStatus)}`;
    if (puppeteerLabel) puppeteerLabel.className = `status-tooltip-label ${toDotClass(puppeteerStatus)}`;
    if (dependenciesTooltip) dependenciesTooltip.setAttribute("aria-live", "polite");
  }

  if (window.electron?.onStartupStatus) {
    window.electron.onStartupStatus((payload) => {
      if (!payload) return;
      setStatus(payload.name, payload.status);
    });
  }
  if (window.electron?.getStartupStatus) {
    window.electron.getStartupStatus().then((statusMap) => {
      if (!statusMap) return;
      if (statusMap.libreoffice) setStatus("libreoffice", statusMap.libreoffice);
      if (statusMap.puppeteer) setStatus("puppeteer", statusMap.puppeteer);
    });
  }
});
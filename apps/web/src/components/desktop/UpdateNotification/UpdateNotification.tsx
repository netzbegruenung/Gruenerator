import { useEffect } from 'react';

import { cn } from '../../../utils/cn';
import {
  useDesktopUpdateStore,
  useUpdateStatus,
  useDownloadProgress,
  useUpdateInfo,
} from '../../../stores/desktopUpdateStore';
import {
  initAutoUpdater,
  cleanupAutoUpdater,
  downloadUpdate,
  installUpdate,
  checkForUpdates,
} from '../../../utils/desktopUpdater';
import { isDesktopApp } from '../../../utils/platform';

interface UpdateNotificationProps {
  onDismiss?: () => void;
}

export function UpdateNotification({ onDismiss }: UpdateNotificationProps) {
  const status = useUpdateStatus();
  const progress = useDownloadProgress();
  const updateInfo = useUpdateInfo();
  const dismissUpdate = useDesktopUpdateStore((state) => state.dismissUpdate);
  const isUpdateDismissed = useDesktopUpdateStore((state) => state.isUpdateDismissed);

  useEffect(() => {
    if (!isDesktopApp()) return;

    void initAutoUpdater();

    return () => {
      cleanupAutoUpdater();
    };
  }, []);

  const handleDismiss = () => {
    dismissUpdate();
    onDismiss?.();
  };

  const handleDownload = async () => {
    await downloadUpdate();
  };

  const handleInstall = async () => {
    await installUpdate();
  };

  const handleRetry = async () => {
    useDesktopUpdateStore.getState().reset();
    await checkForUpdates();
  };

  if (!isDesktopApp() || isUpdateDismissed) {
    return null;
  }

  if (status === 'idle' || status === 'checking' || status === 'up-to-date') {
    return null;
  }

  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[9999] min-w-[320px] max-w-[520px] bg-background border border-grey-200 dark:border-grey-700 rounded-xl shadow-lg p-md animate-[slideDown_0.3s_ease-out] max-[600px]:left-md max-[600px]:right-md max-[600px]:translate-x-0 max-[600px]:max-w-none max-[600px]:min-w-0">
      <div className="flex items-start gap-sm flex-wrap max-[600px]:flex-col">
        {status === 'available' && (
          <>
            <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-grey-700 dark:text-neutral-600">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-xxs">
              <span className="text-sm font-semibold text-foreground leading-[1.4]">
                Update verfügbar: v{updateInfo?.version}
              </span>
              {updateInfo?.body && (
                <span className="text-[13px] text-foreground opacity-80 leading-[1.4] overflow-hidden text-ellipsis whitespace-nowrap">
                  {updateInfo.body}
                </span>
              )}
            </div>
            <div className="flex gap-xs ml-auto shrink-0 max-[600px]:ml-0 max-[600px]:mt-sm max-[600px]:w-full">
              <button
                className={cn(
                  'px-sm py-xs border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap max-[600px]:flex-1',
                  'bg-primary-600 text-white hover:bg-primary-700 dark:bg-secondary-600 dark:hover:bg-secondary-700'
                )}
                onClick={handleDownload}
              >
                Jetzt herunterladen
              </button>
              <button
                className="px-sm py-xs border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap bg-transparent text-foreground hover:bg-hover-alt max-[600px]:flex-1"
                onClick={handleDismiss}
              >
                Später
              </button>
            </div>
          </>
        )}

        {status === 'downloading' && (
          <>
            <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-grey-700 dark:text-neutral-600 animate-spin">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-xxs">
              <span className="text-sm font-semibold text-foreground leading-[1.4]">
                Update wird heruntergeladen... {progress}%
              </span>
              <div className="w-full h-1 bg-grey-200 dark:bg-grey-700 rounded-sm overflow-hidden mt-xxs">
                <div
                  className="h-full bg-primary-600 dark:bg-neutral-600 rounded-sm transition-[width] duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </>
        )}

        {status === 'ready' && (
          <>
            <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-grey-700 dark:text-neutral-600">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-xxs">
              <span className="text-sm font-semibold text-foreground leading-[1.4]">
                Update bereit zur Installation
              </span>
              <span className="text-[13px] text-foreground opacity-80 leading-[1.4] overflow-hidden text-ellipsis whitespace-nowrap">
                Die App wird neu gestartet, um das Update zu installieren.
              </span>
            </div>
            <div className="flex gap-xs ml-auto shrink-0 max-[600px]:ml-0 max-[600px]:mt-sm max-[600px]:w-full">
              <button
                className={cn(
                  'px-sm py-xs border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap max-[600px]:flex-1',
                  'bg-primary-600 text-white hover:bg-primary-700 dark:bg-secondary-600 dark:hover:bg-secondary-700'
                )}
                onClick={handleInstall}
              >
                Jetzt neu starten
              </button>
              <button
                className="px-sm py-xs border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap bg-transparent text-foreground hover:bg-hover-alt max-[600px]:flex-1"
                onClick={handleDismiss}
              >
                Später
              </button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-[#ffeaea] text-[var(--error-red)] dark:bg-[rgba(211,47,47,0.2)] dark:text-[#ff6b6b]">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-xxs">
              <span className="text-sm font-semibold text-foreground leading-[1.4]">
                Update fehlgeschlagen
              </span>
            </div>
            <div className="flex gap-xs ml-auto shrink-0 max-[600px]:ml-0 max-[600px]:mt-sm max-[600px]:w-full">
              <button
                className="px-sm py-xs border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap bg-transparent text-foreground hover:bg-hover-alt max-[600px]:flex-1"
                onClick={handleRetry}
              >
                Erneut versuchen
              </button>
              <button
                className="px-sm py-xs border-none rounded-md text-[13px] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap bg-transparent text-foreground hover:bg-hover-alt max-[600px]:flex-1"
                onClick={handleDismiss}
              >
                Schließen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default UpdateNotification;

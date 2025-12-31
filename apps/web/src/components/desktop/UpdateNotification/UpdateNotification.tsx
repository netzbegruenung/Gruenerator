import { useEffect } from 'react';
import { isDesktopApp } from '../../../utils/platform';
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
import './update-notification.css';

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

    initAutoUpdater();

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
    <div className={`update-notification update-notification--${status}`}>
      <div className="update-notification__content">
        {status === 'available' && (
          <>
            <div className="update-notification__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div className="update-notification__text">
              <span className="update-notification__title">
                Update verfügbar: v{updateInfo?.version}
              </span>
              {updateInfo?.body && (
                <span className="update-notification__description">{updateInfo.body}</span>
              )}
            </div>
            <div className="update-notification__actions">
              <button
                className="update-notification__button update-notification__button--primary"
                onClick={handleDownload}
              >
                Jetzt herunterladen
              </button>
              <button
                className="update-notification__button update-notification__button--secondary"
                onClick={handleDismiss}
              >
                Später
              </button>
            </div>
          </>
        )}

        {status === 'downloading' && (
          <>
            <div className="update-notification__icon update-notification__icon--spinning">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
            <div className="update-notification__text">
              <span className="update-notification__title">
                Update wird heruntergeladen... {progress}%
              </span>
              <div className="update-notification__progress">
                <div
                  className="update-notification__progress-bar"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </>
        )}

        {status === 'ready' && (
          <>
            <div className="update-notification__icon update-notification__icon--success">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className="update-notification__text">
              <span className="update-notification__title">
                Update bereit zur Installation
              </span>
              <span className="update-notification__description">
                Die App wird neu gestartet, um das Update zu installieren.
              </span>
            </div>
            <div className="update-notification__actions">
              <button
                className="update-notification__button update-notification__button--primary"
                onClick={handleInstall}
              >
                Jetzt neu starten
              </button>
              <button
                className="update-notification__button update-notification__button--secondary"
                onClick={handleDismiss}
              >
                Später
              </button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="update-notification__icon update-notification__icon--error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="update-notification__text">
              <span className="update-notification__title">
                Update fehlgeschlagen
              </span>
            </div>
            <div className="update-notification__actions">
              <button
                className="update-notification__button update-notification__button--secondary"
                onClick={handleRetry}
              >
                Erneut versuchen
              </button>
              <button
                className="update-notification__button update-notification__button--secondary"
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

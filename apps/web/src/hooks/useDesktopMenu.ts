import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { useSettingsDialogStore } from '../features/settings/settingsDialogStore';
import { useDesktopUpdateStore } from '../stores/desktopUpdateStore';
import { listenToDesktopMenu } from '../utils/desktopMenu';
import { getCurrentVersion, manualCheckForUpdates } from '../utils/desktopUpdater';
import { isDesktopApp } from '../utils/platform';

/** Wires the native desktop menu (Einstellungen…, Neuer Text, Zoom …) to the app. Needs the router. */
export function useDesktopMenu(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isDesktopApp()) return;

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    void listenToDesktopMenu({
      newChat: () => void navigate('/chat'),
      openSettings: () => useSettingsDialogStore.getState().openSettings(),
      reload: () => window.location.reload(),
      setZoom: async (scale) => {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        await getCurrentWebview().setZoom(scale);
      },
      openUrl: async (url) => {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(url);
      },
      showAbout: async () => {
        toast(`Grünerator ${await getCurrentVersion()}`);
      },
      checkForUpdates: async () => {
        await manualCheckForUpdates();
        // Only an available update or an error shows the update banner; say so when there is nothing to do.
        if (useDesktopUpdateStore.getState().status === 'up-to-date') {
          toast('Grünerator ist auf dem neuesten Stand.');
        }
      },
    }).then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [navigate]);
}

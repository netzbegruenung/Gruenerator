import { useCallback, useEffect, useRef } from 'react';

import useUserDefaults from '../hooks/useUserDefaults';

import { isDesktopApp } from './platform';
import { getSafeCurrentWindow } from './tauriWindow';

export type DesktopNotificationKind = 'transcription' | 'reel' | 'sharepic';

const MESSAGES: Record<DesktopNotificationKind, { title: string; body: string }> = {
  transcription: { title: 'Transkription fertig', body: 'Deine Transkription ist fertig.' },
  reel: { title: 'Reel fertig', body: 'Dein Reel ist fertig verarbeitet.' },
  sharepic: { title: 'Bild fertig', body: 'Dein Bild ist fertig generiert.' },
};

let permissionPromise: Promise<boolean> | null = null;

async function ensurePermission(): Promise<boolean> {
  const { isPermissionGranted, requestPermission } =
    await import('@tauri-apps/plugin-notification');
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === 'granted';
}

/**
 * System notification for a finished long-running flow. Fires only in the
 * desktop app and only while the window is not focused. Never throws.
 */
export async function notifyDesktop(kind: DesktopNotificationKind): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    const win = await getSafeCurrentWindow();
    if (!win || (await win.isFocused())) return;

    permissionPromise ??= ensurePermission().catch(() => false);
    const granted = await permissionPromise;
    if (!granted) {
      permissionPromise = null;
      return;
    }

    const { sendNotification } = await import('@tauri-apps/plugin-notification');
    sendNotification(MESSAGES[kind]);
  } catch (error) {
    console.warn('[desktopNotification] failed:', error);
  }
}

/**
 * Preference key in the `notifications` user-defaults record. Absent means on;
 * only an explicit `false` opts out. There is no UI for these keys yet.
 */
export const desktopNotificationPrefKey = (kind: DesktopNotificationKind): string =>
  `desktop_${kind}`;

export function useDesktopNotify(): (kind: DesktopNotificationKind) => void {
  const { get } = useUserDefaults<boolean>('notifications');
  // `get` changes identity on every user-defaults write anywhere in the app.
  // A stable callback keeps polling effects that depend on it from restarting.
  const getRef = useRef(get);
  useEffect(() => {
    getRef.current = get;
  }, [get]);
  return useCallback((kind) => {
    if (getRef.current(desktopNotificationPrefKey(kind), true) === false) return;
    void notifyDesktop(kind);
  }, []);
}

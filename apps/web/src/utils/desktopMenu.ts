/**
 * Native app menu of the desktop build (Tauri).
 *
 * `apps/desktop/src-tauri/src/lib.rs` (`handle_menu_event`) turns every custom
 * menu item into a window event; this module is the only listener for them.
 * Predefined items (copy, quit, fullscreen …) are handled natively and never
 * arrive here.
 */
import { isDesktopApp } from './platform';

export const DESKTOP_MENU_EVENTS = [
  'menu-new',
  'menu-settings',
  'menu-reload',
  'menu-zoom',
  'menu-open-url',
  'menu-about',
  'menu-check-updates',
] as const;

export type DesktopMenuEvent = (typeof DESKTOP_MENU_EVENTS)[number];

export interface DesktopMenuActions {
  newChat: () => void;
  openSettings: () => void;
  reload: () => void;
  setZoom: (scale: number) => Promise<void>;
  openUrl: (url: string) => Promise<void>;
  showAbout: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
}

export const ZOOM_STEP = 0.1;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;

/** Next zoom level for a `menu-zoom` payload (`in`, `out`, `reset`), or null for anything else. */
export function nextZoom(current: number, direction: string): number | null {
  const round = (value: number) => Math.round(value * 10) / 10;
  if (direction === 'reset') return 1;
  if (direction === 'in') return Math.min(ZOOM_MAX, round(current + ZOOM_STEP));
  if (direction === 'out') return Math.max(ZOOM_MIN, round(current - ZOOM_STEP));
  return null;
}

/**
 * Builds the dispatcher. Holds the zoom level, because the webview API can set
 * it but not read it back; a reload starts again at 100 %, like the webview.
 */
export function createDesktopMenuHandler(actions: DesktopMenuActions) {
  let zoom = 1;

  return async (event: DesktopMenuEvent, payload: unknown): Promise<void> => {
    switch (event) {
      case 'menu-new':
        actions.newChat();
        return;
      case 'menu-settings':
        actions.openSettings();
        return;
      case 'menu-reload':
        actions.reload();
        return;
      case 'menu-zoom': {
        const next = nextZoom(zoom, typeof payload === 'string' ? payload : '');
        if (next === null || next === zoom) return;
        await actions.setZoom(next);
        zoom = next;
        return;
      }
      case 'menu-open-url':
        if (typeof payload === 'string' && /^https:\/\//.test(payload)) {
          await actions.openUrl(payload);
        }
        return;
      case 'menu-about':
        await actions.showAbout();
        return;
      case 'menu-check-updates':
        await actions.checkForUpdates();
        return;
    }
  };
}

/** Subscribes to every menu event. Resolves to an unsubscribe function; a no-op outside the desktop app. */
export async function listenToDesktopMenu(actions: DesktopMenuActions): Promise<() => void> {
  if (!isDesktopApp()) return () => {};

  const { listen } = await import('@tauri-apps/api/event');
  const handle = createDesktopMenuHandler(actions);
  const unlisteners = await Promise.all(
    DESKTOP_MENU_EVENTS.map((event) =>
      listen<unknown>(event, ({ payload }) => {
        handle(event, payload).catch((error: unknown) => {
          console.error(`[DesktopMenu] ${event} failed:`, error);
        });
      })
    )
  );
  return () => unlisteners.forEach((unlisten) => unlisten());
}

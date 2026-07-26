/**
 * Chunk and data loading for the settings dialog.
 *
 * Opening settings used to cost three sequential round trips before the first
 * row of content appeared: the dialog shell chunk, then the active tab's chunk,
 * and only once React had mounted the tab did its query start. This module
 * makes every one of them warmable ahead of the click — `preloadSettingsTab`
 * fetches the tab chunk and, the moment it lands, runs the `prefetch` the tab
 * module exports, so the query is already in the React Query cache by the time
 * the body mounts.
 *
 * Nothing here is imported statically, so the tabs stay code-split: a user who
 * never opens settings never downloads them.
 */
import { type QueryClient } from '@tanstack/react-query';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

import { type SettingsTab } from './settingsDialogStore';

interface SettingsTabModule {
  default: ComponentType;
  /** Warms this tab's own queries. Runs as soon as the chunk has landed. */
  prefetch?: (queryClient: QueryClient) => void;
}

const LOADERS: Record<SettingsTab, () => Promise<SettingsTabModule>> = {
  allgemein: () => import('./tabs/GeneralTab'),
  barrierefreiheit: () => import('./tabs/AccessibilityTab'),
  konto: () => import('./tabs/AccountTab'),
  friends: () => import('./tabs/FriendsTab'),
  personalisierung: () => import('./tabs/PersonalizationTab'),
  briefkoepfe: () => import('./tabs/LetterheadsSection'),
  'texte-anlernen': () => import('./tabs/TexteAnlernenTab'),
  erinnerungen: () => import('./tabs/MemoriesSection'),
  benachrichtigungen: () => import('./tabs/NotificationsTab'),
  wolke: () => import('./tabs/WolkeTab'),
  websites: () => import('./tabs/WebsitesTab'),
  konnektoren: () => import('./tabs/ConnectorsTab'),
  nutzung: () => import('./tabs/UsageTab'),
  support: () => import('./tabs/SupportTab'),
};

const SETTINGS_TABS = Object.keys(LOADERS) as SettingsTab[];

const pendingModules = new Map<SettingsTab, Promise<SettingsTabModule>>();
const loadedTabs = new Map<SettingsTab, ComponentType>();
const servedTabs = new Map<SettingsTab, ComponentType | LazyExoticComponent<ComponentType>>();

function loadTab(tab: SettingsTab): Promise<SettingsTabModule> {
  let pending = pendingModules.get(tab);
  if (!pending) {
    pending = LOADERS[tab]().then(
      (mod) => {
        loadedTabs.set(tab, mod.default);
        return mod;
      },
      (error: unknown) => {
        // Drop the rejected promise so a later attempt retries the import
        // instead of replaying the failure forever.
        pendingModules.delete(tab);
        throw error;
      }
    );
    pendingModules.set(tab, pending);
  }
  return pending;
}

/**
 * Load a tab's chunk and prefetch its data, without rendering it.
 *
 * Fire this on any signal that the tab is about to be needed: hovering the
 * account button, hovering a tab in the dialog's nav, or an idle moment.
 */
export function preloadSettingsTab(tab: SettingsTab, queryClient?: QueryClient): void {
  void loadTab(tab).then(
    (mod) => {
      if (queryClient) mod.prefetch?.(queryClient);
    },
    // Speculative: whatever eventually renders this tab calls loadTab() again
    // and reports the failure there, so there is nothing to surface from here.
    () => {}
  );
}

/**
 * Preload only once the pointer has settled on an entry.
 *
 * Nav entries sit directly above one another, so a pointer travelling to the
 * bottom of the list crosses every one of them. Firing on each would turn one
 * mouse movement into fourteen chunk requests and nine API calls. One shared
 * timer means the entry the pointer is merely passing over gets cancelled by
 * the next, and only where it comes to rest actually loads.
 */
const HOVER_INTENT_MS = 120;
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

export function preloadSettingsTabOnHover(tab: SettingsTab, queryClient?: QueryClient): void {
  cancelSettingsHoverPreload();
  hoverTimer = setTimeout(() => {
    hoverTimer = null;
    preloadSettingsTab(tab, queryClient);
  }, HOVER_INTENT_MS);
}

export function cancelSettingsHoverPreload(): void {
  if (hoverTimer === null) return;
  clearTimeout(hoverTimer);
  hoverTimer = null;
}

/**
 * The component for a tab — the already-loaded module if it was preloaded, a
 * lazy wrapper otherwise.
 *
 * Handing back the loaded module directly is the point: React.lazy suspends on
 * first render even when the code is in memory, costing a frame of fallback for
 * a tab that was ready all along.
 *
 * The choice is then frozen per tab. Swapping a mounted lazy wrapper for its
 * resolved module changes the element type, which would unmount the tab and
 * throw away its state on the next unrelated re-render (a window resize, say).
 */
export function getSettingsTabComponent(tab: SettingsTab): ComponentType {
  let served = servedTabs.get(tab);
  if (!served) {
    served = loadedTabs.get(tab) ?? lazy(() => loadTab(tab));
    servedTabs.set(tab, served);
  }
  return served;
}

let shellModule: Promise<{ default: ComponentType }> | null = null;

/** The dialog shell itself — the first of the two chunks an open has to wait for. */
export function loadSettingsShell(): Promise<{ default: ComponentType }> {
  if (!shellModule) {
    shellModule = import('./SettingsDialog').then(undefined, (error: unknown) => {
      shellModule = null;
      throw error;
    });
  }
  return shellModule;
}

/** Runs `task` when the browser is idle; returns a cancel function. */
export function whenIdle(task: () => void, timeout = 2_000): () => void {
  if (typeof window === 'undefined') return () => {};
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(task, 300);
  return () => window.clearTimeout(handle);
}

/**
 * Warm the shell and the tab the dialog will open on, at the next idle moment.
 *
 * Called once the user is logged in, so the very first click on "Einstellungen"
 * already finds both chunks in memory.
 */
export function preloadSettingsEntry(tab: SettingsTab, queryClient?: QueryClient): () => void {
  return whenIdle(() => {
    void loadSettingsShell().catch(() => {});
    preloadSettingsTab(tab, queryClient);
  });
}

/**
 * Once the dialog is open, pull the remaining tab chunks in one at a time
 * during idle time, so switching tabs never hits the network.
 *
 * Chunks only — prefetching fourteen tabs' worth of data would put a burst of
 * requests on the API for tabs most users never open. Data still follows the
 * hover or the visit.
 */
export function preloadRemainingSettingsTabs(active: SettingsTab): () => void {
  const queue = SETTINGS_TABS.filter((tab) => tab !== active && !loadedTabs.has(tab));
  let cancelled = false;
  let cancelIdle = () => {};

  const step = () => {
    if (cancelled) return;
    const next = queue.shift();
    if (!next) return;
    const scheduleNext = () => {
      cancelIdle = whenIdle(step);
    };
    void loadTab(next).then(scheduleNext, scheduleNext);
  };

  cancelIdle = whenIdle(step);
  return () => {
    cancelled = true;
    cancelIdle();
  };
}

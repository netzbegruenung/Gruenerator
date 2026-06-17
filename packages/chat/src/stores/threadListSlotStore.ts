'use client';

import { useSyncExternalStore } from 'react';

/**
 * Tracks the DOM node the global chat thread-list should portal into.
 *
 * The runtime is mounted once at the app root, but the sidebar slot it renders
 * into lives deep in a per-route layout (PageLayout → Sidebar), so it is
 * destroyed/recreated on every navigation. The previous approach re-found the
 * slot with a `MutationObserver` on the whole `document.body` subtree — an
 * ASYNC callback that lags a frame behind the actual remount. During that lag
 * the portal rendered into a detached node, so the thread list blinked out and
 * back on every navigation / body mutation (extreme flicker on desktop, where
 * the tab system mutates the body constantly).
 *
 * Instead the slot registers its node here via a ref callback. React invokes
 * ref callbacks SYNCHRONOUSLY during commit, so the portal target updates in
 * the same commit the slot mounts/unmounts — no detached-node window, no
 * flicker. This mirrors mobile's deterministic wiring (the list is a direct
 * child of the runtime tree) without restructuring the web layout.
 */

let slotEl: HTMLElement | null = null;
const listeners = new Set<() => void>();

/** Ref callback for the sidebar slot div: `<div ref={setThreadListSlot} />`. */
export function setThreadListSlot(el: HTMLElement | null): void {
  if (el === slotEl) return;
  slotEl = el;
  listeners.forEach((listener) => listener());
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): HTMLElement | null {
  return slotEl;
}

/** Reactive read of the current thread-list slot node (null until registered). */
export function useThreadListSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

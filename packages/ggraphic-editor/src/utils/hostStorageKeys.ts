// SPDX-License-Identifier: MPL-2.0
/**
 * localStorage keys the editor persists under. The defaults are neutral; a host
 * that already shipped the editor registers the key its users' browsers hold
 * (renaming one would orphan what they stored). Register at start-up; a store
 * created before that is told through `onHostStorageKeysChange`.
 */
const DEFAULTS = {
  /** The „zuletzt verwendet" row of the Elemente panel. */
  recentElements: 'ggraphic-recent-elements',
} as const;

export type HostStorageKeyName = keyof typeof DEFAULTS;

const registered: Partial<Record<HostStorageKeyName, string>> = {};
const listeners = new Set<() => void>();

export function getHostStorageKey(name: HostStorageKeyName): string {
  return registered[name] ?? DEFAULTS[name];
}

export function registerHostStorageKeys(keys: Partial<Record<HostStorageKeyName, string>>): void {
  Object.assign(registered, keys);
  listeners.forEach((listener) => listener());
}

/** Calls `listener` after every `registerHostStorageKeys`; returns the unsubscribe. */
export function onHostStorageKeysChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

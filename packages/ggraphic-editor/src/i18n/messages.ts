// SPDX-License-Identifier: MPL-2.0
/**
 * The message catalogue the editor renders with. A module-level register, like
 * the brand packs and the asset catalogue, because commands, factories and
 * offscreen roots read texts with no React context. Without a host the editor
 * speaks German (`de`). Register before the first render; switching later
 * re-renders `useMessages()` consumers, while texts already stored in
 * module-level data are read lazily and follow too.
 */
import { useSyncExternalStore } from 'react';

import { de, type Messages } from './de.js';
import { en } from './en.js';

export type { Messages };
export type MessageLocale = 'de' | 'en';

const BUILT_IN: Readonly<Record<MessageLocale, Messages>> = { de, en };

let registered: Messages = de;
const listeners = new Set<() => void>();

/** A built-in locale, or a host's own catalogue of the same shape. */
export function registerMessages(source: MessageLocale | Messages): void {
  registered = typeof source === 'string' ? BUILT_IN[source] : source;
  for (const listener of listeners) listener();
}

/** The active catalogue, for code outside React. */
export function messages(): Messages {
  return registered;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The active catalogue, for components. */
export function useMessages(): Messages {
  return useSyncExternalStore(subscribe, messages, messages);
}

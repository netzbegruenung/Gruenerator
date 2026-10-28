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

import { de, type Messages as CoreMessages } from './de.js';
import { en } from './en.js';

export type MessageLocale = 'de' | 'en';

/**
 * Texts a host adds for its own parts of the editor (its element kinds, their
 * sections). Empty in the core; a host augments it
 * (`declare module '@ggraphic/editor/i18n/messages'`) and registers the texts
 * per locale with `registerHostMessages`. They nest into the catalogue, so a
 * host text is read like a core one (`t.layers.…`).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HostMessages {}

/** The catalogue the editor reads: the core's texts and the host's. */
export type Messages = CoreMessages & HostMessages;

const BUILT_IN: Readonly<Record<MessageLocale, CoreMessages>> = { de, en };

let base: CoreMessages = de;
let baseLocale: MessageLocale = 'de';
let hostTexts: Partial<Record<MessageLocale, HostMessages>> = {};
let registered = de as Messages;
const listeners = new Set<() => void>();

type Tree = Record<string, unknown>;
const isTree = (value: unknown): value is Tree =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `over` laid into `under`, branch by branch; `under` wins where both have a leaf. */
function nest(under: Tree, over: Tree): Tree {
  const out: Tree = { ...over, ...under };
  for (const [key, value] of Object.entries(over)) {
    const own = under[key];
    if (isTree(own) && isTree(value)) out[key] = nest(own, value);
  }
  return out;
}

function update(): void {
  const host = hostTexts[baseLocale] ?? hostTexts.de;
  // Boundary: the host's texts complete the catalogue to `Messages`.
  registered = (host ? nest(base as Tree, host as Tree) : base) as Messages;
  for (const listener of listeners) listener();
}

/**
 * A built-in locale, or a host's own catalogue of the same shape. A host
 * catalogue counts as German for the host's texts unless it brings them.
 */
export function registerMessages(source: MessageLocale | CoreMessages): void {
  base = typeof source === 'string' ? BUILT_IN[source] : source;
  baseLocale = typeof source === 'string' ? source : 'de';
  update();
}

/** The host's texts per locale (`HostMessages`); German is the fallback. */
export function registerHostMessages(
  texts: { de: HostMessages } & Partial<Record<MessageLocale, HostMessages>>
): void {
  hostTexts = texts;
  update();
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

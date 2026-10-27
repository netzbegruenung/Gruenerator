// SPDX-License-Identifier: MPL-2.0
/**
 * Die Befehle des Canvas-Editors — Name, Reichweite und Tastenkürzel an einer
 * Stelle. Das Kontextmenü, die Tastatur und die Leisten lesen hier; ein Kürzel,
 * das im Menü steht, ist damit genau das, auf das die Tastatur hört
 * (`canvasShortcuts.vitest.tsx` prüft das).
 *
 * Ebenen bekommen bewusst kein Kürzel: `[` und `]` liegen auf deutschen
 * Tastaturen hinter AltGr.
 */

import { messages, type Messages } from '@ggraphic/editor/i18n/messages';

export interface CommandShortcut {
  /** `KeyboardEvent.key`; Buchstaben klein. */
  readonly key: string;
  /** Strg, auf dem Mac ⌘ — wie bisher genügt eins von beiden. */
  readonly mod: boolean;
  /** Umschalt gehört zum Kürzel — und wird sonst verlangt, dass sie fehlt. */
  readonly shift: boolean;
  readonly alsoKeys: readonly string[];
}

interface CommandSpec {
  readonly label: string;
  /** `page`: läuft auf der Seite (`GenericCanvasRef.runCommand`); `editor`: im Editor drumherum. */
  readonly scope: 'page' | 'editor';
  readonly shortcut: CommandShortcut | null;
}

const mod = (key: string): CommandShortcut => ({ key, mod: true, shift: false, alsoKeys: [] });
const shift = (key: string): CommandShortcut => ({ key, mod: false, shift: true, alsoKeys: [] });

/** `label` is read on access, so the active message catalogue decides — not the one at import time. */
function command<S extends CommandSpec['scope']>(
  id: keyof Messages['commands'],
  scope: S,
  shortcut: CommandShortcut | null
): { readonly label: string; readonly scope: S; readonly shortcut: CommandShortcut | null } {
  return {
    get label() {
      return messages().commands[id];
    },
    scope,
    shortcut,
  };
}

export const CANVAS_COMMANDS = {
  copy: command('copy', 'page', mod('c')),
  cut: command('cut', 'page', mod('x')),
  paste: command('paste', 'page', mod('v')),
  pasteHere: command('pasteHere', 'page', null),
  duplicate: command('duplicate', 'page', mod('d')),
  delete: command('delete', 'page', {
    key: 'Delete',
    mod: false,
    shift: false,
    alsoKeys: ['Backspace'],
  }),
  selectAll: command('selectAll', 'page', mod('a')),
  bringToFront: command('bringToFront', 'page', null),
  bringForward: command('bringForward', 'page', null),
  sendBackward: command('sendBackward', 'page', null),
  sendToBack: command('sendToBack', 'page', null),
  toggleLock: command('toggleLock', 'page', null),
  editText: command('editText', 'page', { key: 'F2', mod: false, shift: false, alsoKeys: [] }),
  insertFrameImage: command('insertFrameImage', 'page', {
    key: 'Enter',
    mod: false,
    shift: false,
    alsoKeys: [],
  }),
  flipHorizontal: command('flipHorizontal', 'page', shift('h')),
  flipVertical: command('flipVertical', 'page', shift('v')),
  resetRotation: command('resetRotation', 'page', null),
  // Ausrichten: einzeln an der Seite, mehrere an der Auswahl. Ohne Kürzel.
  alignLeft: command('alignLeft', 'page', null),
  alignCenterH: command('alignCenterH', 'page', null),
  alignRight: command('alignRight', 'page', null),
  alignTop: command('alignTop', 'page', null),
  alignMiddle: command('alignMiddle', 'page', null),
  alignBottom: command('alignBottom', 'page', null),
  distributeHorizontal: command('distributeHorizontal', 'page', null),
  distributeVertical: command('distributeVertical', 'page', null),
  editImage: command('editImage', 'editor', null),
  setAsBackground: command('setAsBackground', 'editor', null),
  replaceBackground: command('replaceBackground', 'editor', null),
  cropBackground: command('cropBackground', 'editor', null),
  removeBackground: command('removeBackground', 'editor', null),
  duplicatePage: command('duplicatePage', 'editor', null),
  deletePage: command('deletePage', 'editor', null),
} as const satisfies Record<string, CommandSpec>;

export type CanvasCommandId = keyof typeof CANVAS_COMMANDS;

export type PageCommandId = {
  [K in CanvasCommandId]: (typeof CANVAS_COMMANDS)[K]['scope'] extends 'page' ? K : never;
}[CanvasCommandId];

export const CANVAS_COMMAND_IDS = Object.keys(CANVAS_COMMANDS) as CanvasCommandId[];

export function isPageCommand(id: CanvasCommandId): id is PageCommandId {
  return CANVAS_COMMANDS[id].scope === 'page';
}

export function shortcutOf(id: CanvasCommandId): CommandShortcut | null {
  const spec: CommandSpec = CANVAS_COMMANDS[id];
  return spec.shortcut;
}

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Der Befehl, auf den dieser Tastendruck hört, oder `null`. */
export function commandForKey(e: KeyLike): CanvasCommandId | null {
  if (e.altKey) return null;
  const isMod = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  for (const id of CANVAS_COMMAND_IDS) {
    const shortcut = shortcutOf(id);
    if (!shortcut || shortcut.mod !== isMod || shortcut.shift !== e.shiftKey) continue;
    if (shortcut.key === key || shortcut.alsoKeys.includes(key)) return id;
  }
  return null;
}

const KEY_LABELS: Record<string, { mac: string; other: string }> = {
  Delete: {
    mac: '⌫',
    get other() {
      return messages().keys.delete;
    },
  },
  Backspace: {
    mac: '⌫',
    get other() {
      return messages().keys.backspace;
    },
  },
  Enter: { mac: '↩', other: 'Enter' },
};

/** Wie das Kürzel im Menü steht: `⌘C`/`⇧H` auf dem Mac, sonst `Strg+C`/`Umschalt+H`. */
export function formatShortcut(shortcut: CommandShortcut, isMac: boolean): string {
  const named = KEY_LABELS[shortcut.key];
  const key = named ? (isMac ? named.mac : named.other) : shortcut.key.toUpperCase();
  if (isMac) return `${shortcut.shift ? '⇧' : ''}${shortcut.mod ? '⌘' : ''}${key}`;
  return [shortcut.mod && messages().keys.ctrl, shortcut.shift && messages().keys.shift, key]
    .filter(Boolean)
    .join('+');
}

/** Dasselbe Kürzel für `aria-keyshortcuts` (`Control+C`, `Meta+C`, `Shift+H`, `Delete`). */
export function ariaShortcut(shortcut: CommandShortcut, isMac: boolean): string {
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  const modKey = isMac ? 'Meta' : 'Control';
  return [shortcut.mod && modKey, shortcut.shift && 'Shift', key].filter(Boolean).join('+');
}

export const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

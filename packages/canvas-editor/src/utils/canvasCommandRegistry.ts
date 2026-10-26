/**
 * Die Befehle des Canvas-Editors — Name, Reichweite und Tastenkürzel an einer
 * Stelle. Das Kontextmenü, die Tastatur und die Leisten lesen hier; ein Kürzel,
 * das im Menü steht, ist damit genau das, auf das die Tastatur hört
 * (`canvasShortcuts.vitest.tsx` prüft das).
 *
 * Ebenen bekommen bewusst kein Kürzel: `[` und `]` liegen auf deutschen
 * Tastaturen hinter AltGr.
 */

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

export const CANVAS_COMMANDS = {
  copy: { label: 'Kopieren', scope: 'page', shortcut: mod('c') },
  cut: { label: 'Ausschneiden', scope: 'page', shortcut: mod('x') },
  paste: { label: 'Einfügen', scope: 'page', shortcut: mod('v') },
  pasteHere: { label: 'Hier einfügen', scope: 'page', shortcut: null },
  duplicate: { label: 'Duplizieren', scope: 'page', shortcut: mod('d') },
  delete: {
    label: 'Löschen',
    scope: 'page',
    shortcut: { key: 'Delete', mod: false, shift: false, alsoKeys: ['Backspace'] },
  },
  selectAll: { label: 'Alles auswählen', scope: 'page', shortcut: mod('a') },
  bringToFront: { label: 'Ganz nach vorne', scope: 'page', shortcut: null },
  bringForward: { label: 'Nach vorne', scope: 'page', shortcut: null },
  sendBackward: { label: 'Nach hinten', scope: 'page', shortcut: null },
  sendToBack: { label: 'Ganz nach hinten', scope: 'page', shortcut: null },
  toggleLock: { label: 'Sperren', scope: 'page', shortcut: null },
  editText: {
    label: 'Text bearbeiten',
    scope: 'page',
    shortcut: { key: 'F2', mod: false, shift: false, alsoKeys: [] },
  },
  insertFrameImage: {
    label: 'Bild einsetzen',
    scope: 'page',
    shortcut: { key: 'Enter', mod: false, shift: false, alsoKeys: [] },
  },
  flipHorizontal: { label: 'Horizontal spiegeln', scope: 'page', shortcut: shift('h') },
  flipVertical: { label: 'Vertikal spiegeln', scope: 'page', shortcut: shift('v') },
  resetRotation: { label: 'Drehung zurücksetzen', scope: 'page', shortcut: null },
  // Ausrichten: einzeln an der Seite, mehrere an der Auswahl. Ohne Kürzel.
  alignLeft: { label: 'Links', scope: 'page', shortcut: null },
  alignCenterH: { label: 'Zentriert', scope: 'page', shortcut: null },
  alignRight: { label: 'Rechts', scope: 'page', shortcut: null },
  alignTop: { label: 'Oben', scope: 'page', shortcut: null },
  alignMiddle: { label: 'Mitte', scope: 'page', shortcut: null },
  alignBottom: { label: 'Unten', scope: 'page', shortcut: null },
  distributeHorizontal: { label: 'Horizontal verteilen', scope: 'page', shortcut: null },
  distributeVertical: { label: 'Vertikal verteilen', scope: 'page', shortcut: null },
  editImage: { label: 'Bild bearbeiten', scope: 'editor', shortcut: null },
  setAsBackground: { label: 'Als Hintergrund', scope: 'editor', shortcut: null },
  replaceBackground: { label: 'Bild ersetzen …', scope: 'editor', shortcut: null },
  toggleBackgroundFixed: { label: 'Hintergrund fixieren', scope: 'editor', shortcut: null },
  removeBackground: { label: 'Hintergrundbild entfernen', scope: 'editor', shortcut: null },
  duplicatePage: { label: 'Seite duplizieren', scope: 'editor', shortcut: null },
  deletePage: { label: 'Seite löschen', scope: 'editor', shortcut: null },
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
  Delete: { mac: '⌫', other: 'Entf' },
  Backspace: { mac: '⌫', other: 'Rücktaste' },
  Enter: { mac: '↩', other: 'Enter' },
};

/** Wie das Kürzel im Menü steht: `⌘C`/`⇧H` auf dem Mac, sonst `Strg+C`/`Umschalt+H`. */
export function formatShortcut(shortcut: CommandShortcut, isMac: boolean): string {
  const named = KEY_LABELS[shortcut.key];
  const key = named ? (isMac ? named.mac : named.other) : shortcut.key.toUpperCase();
  if (isMac) return `${shortcut.shift ? '⇧' : ''}${shortcut.mod ? '⌘' : ''}${key}`;
  return [shortcut.mod && 'Strg', shortcut.shift && 'Umschalt', key].filter(Boolean).join('+');
}

/** Dasselbe Kürzel für `aria-keyshortcuts` (`Control+C`, `Meta+C`, `Shift+H`, `Delete`). */
export function ariaShortcut(shortcut: CommandShortcut, isMac: boolean): string {
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  const modKey = isMac ? 'Meta' : 'Control';
  return [shortcut.mod && modKey, shortcut.shift && 'Shift', key].filter(Boolean).join('+');
}

export const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

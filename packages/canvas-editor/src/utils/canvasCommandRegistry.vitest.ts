import { describe, expect, it } from 'vitest';

import {
  CANVAS_COMMAND_IDS,
  CANVAS_COMMANDS,
  ariaShortcut,
  commandForKey,
  formatShortcut,
  shortcutOf,
  type CommandShortcut,
} from './canvasCommandRegistry';

const press = (key: string, mods: Partial<Record<'ctrl' | 'meta' | 'shift' | 'alt', boolean>>) => ({
  key,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

const pressFor = (shortcut: CommandShortcut, key = shortcut.key) =>
  press(key, { ctrl: shortcut.mod });

describe('CANVAS_COMMANDS', () => {
  it('benennt jeden Befehl anders', () => {
    const labels = CANVAS_COMMAND_IDS.map((id) => CANVAS_COMMANDS[id].label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('vergibt kein Kürzel doppelt', () => {
    const keys = CANVAS_COMMAND_IDS.flatMap((id) => {
      const s = shortcutOf(id);
      return s ? [s.key, ...s.alsoKeys].map((k) => `${s.mod}:${k}`) : [];
    });
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('commandForKey', () => {
  it.each(CANVAS_COMMAND_IDS.filter((id) => shortcutOf(id) !== null))(
    'findet %s über sein eigenes Kürzel',
    (id) => {
      const shortcut = shortcutOf(id)!;
      expect(commandForKey(pressFor(shortcut))).toBe(id);
      for (const key of shortcut.alsoKeys) expect(commandForKey(pressFor(shortcut, key))).toBe(id);
    }
  );

  it('nimmt ⌘ wie Strg', () => {
    expect(commandForKey(press('c', { meta: true }))).toBe('copy');
  });

  it('liest Großbuchstaben wie kleine (Feststelltaste)', () => {
    expect(commandForKey(press('D', { ctrl: true }))).toBe('duplicate');
  });

  it('hört nicht auf Shift oder Alt dazu — Strg+Shift+Z ist Wiederholen', () => {
    expect(commandForKey(press('d', { ctrl: true, shift: true }))).toBeNull();
    expect(commandForKey(press('c', { ctrl: true, alt: true }))).toBeNull();
  });

  it('verlangt die Modifikatortaste, wo das Kürzel eine hat', () => {
    expect(commandForKey(press('c', {}))).toBeNull();
    expect(commandForKey(press('Delete', { ctrl: true }))).toBeNull();
  });
});

describe('formatShortcut', () => {
  it('schreibt auf dem Mac ⌘ und Symbole', () => {
    expect(formatShortcut(shortcutOf('copy')!, true)).toBe('⌘C');
    expect(formatShortcut(shortcutOf('delete')!, true)).toBe('⌫');
  });

  it('schreibt sonst Strg und deutsche Tastennamen', () => {
    expect(formatShortcut(shortcutOf('copy')!, false)).toBe('Strg+C');
    expect(formatShortcut(shortcutOf('delete')!, false)).toBe('Entf');
  });

  it('liefert für aria-keyshortcuts die Tastennamen der Spezifikation', () => {
    expect(ariaShortcut(shortcutOf('copy')!, false)).toBe('Control+C');
    expect(ariaShortcut(shortcutOf('copy')!, true)).toBe('Meta+C');
    expect(ariaShortcut(shortcutOf('delete')!, false)).toBe('Delete');
  });
});

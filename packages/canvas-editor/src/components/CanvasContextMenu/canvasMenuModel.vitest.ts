import { describe, expect, it } from 'vitest';

import { formatShortcut, shortcutOf } from '../../utils/canvasCommandRegistry';

import {
  buildCanvasMenu,
  type CanvasMenuEntry,
  type CanvasMenuEnv,
  type CanvasMenuSnapshot,
} from './canvasMenuModel';

import type { SelectionCapabilities } from '../../utils/selectionCapabilities';

const CAPS: SelectionCapabilities = {
  count: 1,
  canCopy: true,
  canDelete: true,
  canBringForward: true,
  canSendBackward: true,
  lock: 'none',
  canLock: true,
  canRotate: true,
  canFlip: true,
  rotation: 0,
  canAlign: true,
  canDistribute: false,
};

const snapshot = (over: Partial<CanvasMenuSnapshot> = {}): CanvasMenuSnapshot => ({
  selection: ['shape-1'],
  module: { type: 'shape', data: { id: 'shape-1' } },
  caps: CAPS,
  canSelectAll: true,
  isCropping: false,
  background: null,
  ...over,
});

const ENV: CanvasMenuEnv = {
  isMac: false,
  hasPoint: true,
  hasClipboard: true,
  pageIndex: 0,
  pageCount: 2,
  canAddPage: true,
  canEditImage: true,
};

const flat = (entries: CanvasMenuEntry[]): CanvasMenuEntry[] =>
  entries.flatMap((e) => (e.kind === 'sub' ? [e, ...flat(e.entries)] : [e]));
const labels = (entries: CanvasMenuEntry[]) =>
  flat(entries).flatMap((e) => (e.kind === 'separator' ? [] : [e.label]));
const find = (entries: CanvasMenuEntry[], label: string) =>
  flat(entries).find((e) => e.kind !== 'separator' && e.label === label);

describe('buildCanvasMenu', () => {
  it('zeigt für ein Element Bearbeiten, Ebenen und Sperren', () => {
    const menu = buildCanvasMenu(snapshot(), ENV);
    expect(menu).toMatchObject({ kind: 'element', label: 'Element' });
    expect(labels(menu.entries)).toEqual([
      'Kopieren',
      'Ausschneiden',
      'Einfügen',
      'Hier einfügen',
      'Duplizieren',
      'Löschen',
      'Ebene',
      'Ganz nach vorne',
      'Nach vorne',
      'Nach hinten',
      'Ganz nach hinten',
      'Sperren',
      'Alles auswählen',
    ]);
  });

  it('beginnt bei Text, Bild und Rahmen mit dem, was nur sie können', () => {
    const first = (type: 'text' | 'user-image' | 'frame') =>
      labels(buildCanvasMenu(snapshot({ module: { type, data: { id: 'x' } } }), ENV).entries)[0];
    expect(first('text')).toBe('Text bearbeiten');
    expect(first('user-image')).toBe('Bild bearbeiten');
    expect(first('frame')).toBe('Bild einsetzen');
  });

  it('sagt bei gesperrter Auswahl Entsperren und schaltet Löschen und Ausschneiden ab', () => {
    const menu = buildCanvasMenu(
      snapshot({ caps: { ...CAPS, lock: 'all', canDelete: false } }),
      ENV
    );
    expect(find(menu.entries, 'Entsperren')).toBeDefined();
    expect(find(menu.entries, 'Löschen')).toMatchObject({ disabled: true, destructive: true });
    expect(find(menu.entries, 'Ausschneiden')).toMatchObject({ disabled: true });
  });

  it('bietet „Hier einfügen“ nur mit einem Punkt auf der Bühne', () => {
    const menu = buildCanvasMenu(snapshot(), { ...ENV, hasPoint: false });
    expect(find(menu.entries, 'Hier einfügen')).toBeUndefined();
  });

  it('schaltet Einfügen bei leerer Zwischenablage ab', () => {
    const menu = buildCanvasMenu(snapshot(), { ...ENV, hasClipboard: false });
    expect(find(menu.entries, 'Einfügen')).toMatchObject({ disabled: true });
  });

  it('nennt bei Mehrfachauswahl die Zahl und lässt die Ebenen weg', () => {
    const menu = buildCanvasMenu(
      snapshot({ selection: ['a', 'b', 'c'], module: null, caps: { ...CAPS, count: 3 } }),
      ENV
    );
    expect(menu).toMatchObject({ kind: 'multi', label: '3 Elemente' });
    expect(find(menu.entries, 'Ebene')).toBeUndefined();
  });

  it('bietet auf leerer Fläche Seitenbefehle, „Seite löschen“ nur bei mehreren Seiten', () => {
    const page = snapshot({ selection: [], module: null, caps: { ...CAPS, count: 0 } });
    const menu = buildCanvasMenu(page, ENV);
    expect(menu).toMatchObject({ kind: 'page', label: 'Seite 1' });
    expect(find(menu.entries, 'Seite löschen')).toBeDefined();
    expect(
      find(buildCanvasMenu(page, { ...ENV, pageCount: 1 }).entries, 'Seite löschen')
    ).toBeUndefined();
  });

  it('zeigt am Hintergrundfoto Ersetzen, Fixieren und Entfernen', () => {
    const menu = buildCanvasMenu(
      snapshot({
        module: { type: 'image', data: { id: 'background-image', isPhoto: true } },
        background: {
          currentImageSrc: '/foto.jpg',
          onImageChange: () => {},
          isLocked: true,
          onToggleLock: () => {},
        },
      }),
      ENV
    );
    expect(menu.kind).toBe('background');
    expect(find(menu.entries, 'Bild ersetzen …')).toBeDefined();
    expect(find(menu.entries, 'Hintergrund fixieren')).toMatchObject({
      kind: 'check',
      checked: true,
    });
    expect(find(menu.entries, 'Hintergrundbild entfernen')).toMatchObject({ destructive: true });
  });

  it('setzt keine Trennlinie an den Rand und keine zwei hintereinander', () => {
    const menu = buildCanvasMenu(snapshot({ caps: { ...CAPS, canLock: false } }), ENV);
    const kinds = menu.entries.map((e) => e.kind);
    expect(kinds[0]).not.toBe('separator');
    expect(kinds.at(-1)).not.toBe('separator');
    expect(kinds.join(' ')).not.toContain('separator separator');
  });

  it('zeigt jedes Kürzel so, wie das Register es formatiert', () => {
    for (const isMac of [false, true]) {
      const entries = flat(buildCanvasMenu(snapshot(), { ...ENV, isMac }).entries);
      for (const entry of entries) {
        if (entry.kind !== 'item') continue;
        const shortcut = shortcutOf(entry.id);
        expect(entry.shortcut).toBe(shortcut ? formatShortcut(shortcut, isMac) : null);
      }
    }
  });
});

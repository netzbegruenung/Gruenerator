/**
 * Das Kontextmenü am ganzen Editor: ein Rechtsklick auf die Bühne öffnet es
 * für die Auswahl, ein Eintrag läuft über dieselbe Tür wie Taste und Leiste,
 * und Strg+Z nimmt ihn zurück.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Konva from 'konva';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadCanvasConfig } from '../../../configs/configLoader';
import { axe } from '../../../test-utils';
import { CanvasClipboard } from '../../../utils/canvasClipboard';
import { createShape } from '../../../utils/shapes';
import { CanvasEditor } from '../index';

vi.mock('../../../sidebar/UserUploadsProvider', () => ({
  UserUploadsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUserUploads: () => ({
    items: [],
    isLoading: false,
    error: null,
    search: '',
    setSearch: () => {},
    upload: async () => null,
    hasMore: false,
    loadMore: async () => {},
  }),
}));

// Ein jsdom-<img> lädt nie; ohne Bild zeichnet CanvasImage das Hintergrundfoto nicht.
vi.mock('use-image', async () => {
  const { Image, createCanvas } = await import('@napi-rs/canvas');
  const bitmap = new Image();
  bitmap.src = createCanvas(4, 4).toBuffer('image/png');
  return { default: (url: string) => (url ? [bitmap, 'loaded'] : [undefined, 'loading']) };
});
vi.spyOn(Konva.Node.prototype, 'cache').mockReturnThis();

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

let mobile = false;
vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: mobile && query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
);

vi.spyOn(Konva.Stage.prototype, 'toDataURL').mockReturnValue('data:,');
Element.prototype.scrollIntoView ??= () => {};

const shape = (id: string, x: number) => ({
  ...createShape('rect', x, 300, '#005538', '#005538'),
  id,
  width: 120,
  height: 120,
});

// Der Editor holt die Freeform-Config per dynamischem Import, und erst danach
// steht die Bühne. Kalt kostete das im ersten Test 80 ms, unter Last der ganzen
// Suite mehr als die ~1 s, die `renderEditor` auf die Bühne wartet (#4967).
// Hier vorgewärmt, zählt der Import gegen keinen Test.
beforeAll(async () => {
  await loadCanvasConfig('freeform');
}, 120_000);

afterEach(() => {
  mobile = false;
  CanvasClipboard.clear();
});

const tick = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

async function renderEditor(pageState: Record<string, unknown> = {}) {
  await act(async () => {
    render(
      <CanvasEditor
        initialConfigId="freeform"
        initialProps={{}}
        initialPages={[
          {
            id: 'p1',
            configId: 'freeform',
            state: { shapeInstances: [shape('a', 200), shape('b', 500)], ...pageState },
          },
        ]}
        onExport={() => {}}
        onCancel={() => {}}
      />
    );
  });
  for (let i = 0; i < 50 && Konva.stages.length < 1; i++) await tick();
  const stage = Konva.stages[Konva.stages.length - 1];
  if (!stage) throw new Error('Die Bühne kam nicht innerhalb von 50 Ticks.');
  // Der erste Verlaufseintrag wird nach dem Mounten nachgeholt.
  await tick();
  return stage;
}

const shapes = (stage: Konva.Stage) =>
  stage.find((node: Konva.Node) => node.name().startsWith('shape-'));

async function select(stage: Konva.Stage, id: string) {
  await act(async () => {
    stage.findOne(`.shape-${id}`)!.fire('mousedown', { evt: new MouseEvent('mousedown') }, true);
  });
}

async function rightClick(stage: Konva.Stage) {
  let event: MouseEvent | null = null;
  await act(async () => {
    event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 40,
      clientY: 40,
    });
    stage.content.dispatchEvent(event);
  });
  return event!;
}

describe('Kontextmenü', () => {
  it('öffnet sich für das ausgewählte Element, mit Kürzeln aus dem Register', async () => {
    const stage = await renderEditor();
    await select(stage, 'a');
    const event = await rightClick(stage);

    expect((event as MouseEvent).defaultPrevented).toBe(true);
    const menu = await screen.findByRole('menu', { name: 'Element' });
    const duplicate = within(menu).getByRole('menuitem', { name: /^Duplizieren/ });
    expect(duplicate).toHaveTextContent('Strg+D');
    expect(duplicate).toHaveAttribute('aria-keyshortcuts', 'Control+D');
    expect(within(menu).getByRole('menuitem', { name: /^Einfügen/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(within(menu).getByRole('menuitem', { name: 'Ebene' })).toBeInTheDocument();
  });

  it('dupliziert über das Menü, und Strg+Z nimmt es zurück', async () => {
    const stage = await renderEditor();
    expect(shapes(stage)).toHaveLength(2);
    await select(stage, 'a');
    await rightClick(stage);
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Duplizieren/ }));
    await tick();
    expect(shapes(stage)).toHaveLength(3);
    expect(screen.queryByRole('menu')).toBeNull();

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })
      );
    });
    await tick();
    expect(shapes(stage)).toHaveLength(2);
  });

  it('kopiert und fügt an der Stelle des Rechtsklicks ein', async () => {
    const stage = await renderEditor();
    await select(stage, 'a');
    await rightClick(stage);
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Kopieren/ }));
    expect(CanvasClipboard.paste()?.entries).toHaveLength(1);

    await rightClick(stage);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Hier einfügen' }));
    await tick();
    expect(shapes(stage)).toHaveLength(3);
  });

  it('zeigt bei einer Mehrfachauswahl die Zahl und keine Ebenen', async () => {
    const stage = await renderEditor();
    await select(stage, 'a');
    await rightClick(stage);
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Alles auswählen/ }));
    await rightClick(stage);
    const menu = await screen.findByRole('menu', { name: '2 Elemente' });
    expect(within(menu).queryByRole('menuitem', { name: 'Ebene' })).toBeNull();
    // Die Leiste darüber kennt die Mehrfachauswahl jetzt auch.
    expect(screen.getByRole('toolbar', { name: '2 Elemente' })).toBeInTheDocument();
  });

  it('zeigt auf leerer Fläche die Seiten-Befehle', async () => {
    const stage = await renderEditor();
    await rightClick(stage);
    const menu = await screen.findByRole('menu', { name: 'Seite 1' });
    expect(within(menu).getByRole('menuitem', { name: 'Seite duplizieren' })).toBeInTheDocument();
    // Eine einzige Seite lässt sich nicht löschen.
    expect(within(menu).queryByRole('menuitem', { name: 'Seite löschen' })).toBeNull();
  });

  it('sperrt über das Menü: danach bietet es Entsperren, und Löschen ist aus', async () => {
    const stage = await renderEditor();
    await select(stage, 'a');
    await rightClick(stage);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sperren' }));
    await tick();
    expect(stage.findOne(`.shape-a`)!.draggable()).toBe(false);

    await rightClick(stage);
    const menu = await screen.findByRole('menu', { name: 'Element' });
    expect(within(menu).getByRole('menuitem', { name: 'Entsperren' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /^Löschen/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('öffnet mit Umschalt+F10, und die Pfeiltasten bewegen sich im Menü', async () => {
    const stage = await renderEditor();
    await select(stage, 'a');
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true })
      );
    });
    const menu = await screen.findByRole('menu', { name: 'Element' });
    await userEvent.keyboard('{ArrowDown}');
    expect(menu.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toHaveAttribute('role', 'menuitem');
  });

  it('hat geöffnet keine axe-Verstöße', async () => {
    const stage = await renderEditor();
    await select(stage, 'a');
    await rightClick(stage);
    const menu = await screen.findByRole('menu', { name: 'Element' });
    expect(await axe(menu)).toHaveNoViolations();
  });

  it('öffnet auf dem Handy nicht und lässt das Ereignis in Ruhe', async () => {
    mobile = true;
    const stage = await renderEditor();
    const event = await rightClick(stage);
    expect((event as MouseEvent).defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('„Ausschnitt anpassen“ öffnet den Ausschnitt-Modus, Escape beendet ihn', async () => {
    const stage = await renderEditor({
      backgroundMode: 'image',
      hasBackgroundImage: true,
      currentImageSrc: 'https://example.org/foto.png',
    });
    const photo = () => stage.findOne<Konva.Image>('#background-image')!;
    expect(photo()).toBeTruthy();
    await act(async () => {
      photo().fire('mousedown', { evt: new MouseEvent('mousedown') }, true);
    });
    expect(photo().draggable()).toBe(false);

    await rightClick(stage);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ausschnitt anpassen' }));
    await tick();
    expect(photo().draggable()).toBe(true);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(photo().draggable()).toBe(false);
  });
});

/**
 * Der Hintergrund hat keinen Seitenleisten-Tab mehr: ein Klick auf die Fläche
 * wählt sie aus, und die Leiste über der Fläche zeigt Farbe und Bild. Bis dahin
 * war die Farbfläche `listening={false}` gezeichnet — der Klick fiel auf die
 * Bühne durch und hob nur die Auswahl auf.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasEditor } from '../index';

// Der Upload-Provider zieht react-query mit einer zweiten React-Kopie herein.
vi.mock('@ggraphic/editor/sidebar/UserUploadsProvider', () => ({
  // ToolbarStateBridge liest die Uploads optional (Erweitern).
  useOptionalUserUploads: () => null,
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

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

// Desktop: die schwebende Leiste, nicht die mobile Auswahl-Leiste.
vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
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

async function renderPage() {
  await act(async () => {
    render(
      <CanvasEditor
        initialConfigId="zitat-pure"
        initialProps={{}}
        initialPages={[{ id: 'p1', configId: 'zitat-pure', state: {} }]}
        onExport={() => {}}
        onCancel={() => {}}
      />
    );
  });
  for (let i = 0; i < 50 && Konva.stages.length < 1; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  expect(Konva.stages.length).toBe(1);
  return Konva.stages[0]!;
}

async function click(node: Konva.Node) {
  await act(async () => {
    node.fire('click', { evt: {} }, true);
  });
}

const plane = (stage: Konva.Stage) => stage.findOne<Konva.Rect>('.canvas-background')!;

describe('Klick auf den Hintergrund', () => {
  it('wählt die Farbfläche aus und zeigt ihre Farben und das Bild, kein Ebenen-Menü', async () => {
    const stage = await renderPage();
    expect(plane(stage).listening()).toBe(true);

    await click(plane(stage));

    expect(await screen.findByLabelText('Farbpalette öffnen')).toBeInTheDocument();
    expect(screen.getByLabelText('Hintergrundbild: Bild')).toBeInTheDocument();
    expect(screen.queryByTitle('Ebene nach oben')).toBeNull();
    expect(screen.queryByLabelText('Duplizieren (Strg+D)')).toBeNull();
  });

  it('setzt eine Farbe aus der Palette der Vorlage', async () => {
    const stage = await renderPage();
    await click(plane(stage));
    await act(async () => {
      screen.getByLabelText('Farbpalette öffnen').click();
    });
    await act(async () => {
      screen.getByTitle('Sand').click();
    });
    expect(String(plane(Konva.stages[0]!).fill()).toLowerCase()).toBe('#f5f1e9');
  });

  it('hebt die Auswahl über den Knopf wieder auf', async () => {
    const stage = await renderPage();
    await click(plane(stage));
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Auswahl aufheben (Esc)'));
    });
    expect(screen.queryByLabelText('Farbpalette öffnen')).toBeNull();
  });
});

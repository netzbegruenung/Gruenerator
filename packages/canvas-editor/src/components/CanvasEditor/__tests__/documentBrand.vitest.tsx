/**
 * Die Marke eines Dokuments kommt vom Dokument, nicht aus der Registry: apps/web
 * trägt `[GRUENE_DE, GRUENE_AT]` ein, und `activeBrand()` ist damit immer die
 * deutsche. Ein österreichisches Dokument zeigte die Text-Kacheln trotzdem in
 * GrueneTypeNeue. Hier läuft die ganze Strecke: Config → Shell → Seitenleiste.
 */
import { act, render, screen } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasEditor } from '../index';

vi.mock('@ggraphic/editor/sidebar/UserUploadsProvider', () => ({
  useOptionalUserUploads: () => null,
  UserUploadsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUserUploads: () => ({ uploads: [], refresh: () => {} }),
}));

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

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

/** The font of the sidebar's "Titel" tile: what a header added next would use. */
async function headerTileFont(configId: 'freeform' | 'freeform-at'): Promise<string> {
  await act(async () => {
    render(
      <CanvasEditor
        initialConfigId={configId}
        initialProps={{}}
        onExport={() => {}}
        onCancel={() => {}}
        initialTab="text"
      />
    );
  });
  const tile = await screen.findByText('Titel', {}, { timeout: 10_000 });
  return tile.style.fontFamily;
}

describe('the text tab offers the font of the document brand', () => {
  it('freeform: German', async () => {
    expect(await headerTileFont('freeform')).toContain('GrueneTypeNeue');
  });

  it('freeform-at: Austrian', async () => {
    const font = await headerTileFont('freeform-at');
    expect(font).toContain('GothamNarrow-Ultra');
    expect(font).not.toContain('GrueneTypeNeue');
  });
});

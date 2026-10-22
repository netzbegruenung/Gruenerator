/**
 * Ein Viewer (#4869): der Server verwirft seine Schreibzugriffe, also bietet
 * der Editor keine an — blättern und ansehen geht weiter.
 */
import { act, render, screen } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasEditor } from '../index';

vi.mock('../../../sidebar/UserUploadsProvider', () => ({
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

async function renderDeck(readOnly: boolean) {
  await act(async () => {
    render(
      <CanvasEditor
        initialConfigId="dreizeilen"
        initialProps={{}}
        initialPages={[
          { id: 'a', configId: 'dreizeilen', state: {} },
          { id: 'b', configId: 'dreizeilen', state: {} },
        ]}
        onExport={() => {}}
        onCancel={() => {}}
        readOnly={readOnly}
      />
    );
  });
  for (let i = 0; i < 50 && Konva.stages.length < 2; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  expect(Konva.stages.length).toBeGreaterThanOrEqual(2);
}

describe('CanvasEditor readOnly', () => {
  it('bietet einer Bearbeiterin Seitenaktionen, Reiter und eine hörende Fläche', async () => {
    await renderDeck(false);
    expect(document.querySelector('[title="Seite löschen"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /KI-Chat/ })).not.toBeNull();
    expect(Konva.stages.at(-1)!.listening()).toBe(true);
  });

  it('bietet einem Viewer nichts an, was schreibt, lässt ihn aber blättern', async () => {
    await renderDeck(true);
    expect(document.querySelector('[title="Seite löschen"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /KI-Chat/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Seite hinzufügen/ })).toBeNull();
    expect(Konva.stages.every((stage) => stage.listening() === false)).toBe(true);

    await act(async () => {
      document.querySelector<HTMLElement>('[data-page-index="1"]')!.click();
    });
    expect(document.querySelector('[data-page-index="1"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

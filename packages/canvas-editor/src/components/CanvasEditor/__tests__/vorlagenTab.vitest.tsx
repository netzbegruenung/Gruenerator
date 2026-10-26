/**
 * Der Reiter „Vorlagen" hängt der Editor selbst ein — direkt über „Text", nur
 * wenn der Host Vorlagen liefert und es für das Format welche gibt.
 */
import { act, render, screen } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider, type CanvasEditorServices } from '../../../CanvasEditorProvider';
import { CanvasEditor } from '../index';

vi.mock('../../../sidebar/UserUploadsProvider', () => ({
  // ToolbarStateBridge liest die Uploads optional (Erweitern).
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

/** Tab by its tour id — read via the attribute, a literal selector would count as a tour anchor (check-tour-anchors). */
const tabButton = (id: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-tour]')].find(
    (el) => el.dataset.tour === `canvas-tab-${id}`
  ) ?? null;

const vorlagen: NonNullable<CanvasEditorServices['vorlagen']> = {
  listSeiten: async () => [],
  composeSeite: async () => [],
};

async function renderEditor(services: CanvasEditorServices, formatId = 'post-portrait') {
  await act(async () => {
    render(
      <CanvasEditorProvider services={services}>
        <CanvasEditor
          initialConfigId="freeform"
          formatId={formatId}
          initialProps={{}}
          onExport={() => {}}
          onCancel={() => {}}
        />
      </CanvasEditorProvider>
    );
  });
  for (let i = 0; i < 50 && !tabButton('text'); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  return [...document.querySelectorAll('[data-tour^="canvas-tab-"]')].map((el) =>
    el.getAttribute('data-tour')!.replace('canvas-tab-', '')
  );
}

describe('CanvasEditor Vorlagen-Reiter', () => {
  it('steht direkt über Text und öffnet die Vorlagen', async () => {
    const tabs = await renderEditor({ vorlagen });
    expect(tabs.indexOf('vorlagen')).toBe(tabs.indexOf('text') - 1);

    await act(async () => {
      screen.getByRole('button', { name: 'Vorlagen: Grünerator-Vorlagen anwenden' }).click();
    });
    expect(
      await screen.findByText('Für dieses Format gibt es noch keine Seiten.')
    ).toBeInTheDocument();
  });

  it('fehlt, wenn der Host keine Vorlagen liefert', async () => {
    const tabs = await renderEditor({});
    expect(tabs).toContain('text');
    expect(tabs).not.toContain('vorlagen');
  });

  it('steht auch beim Profilbild-Format (Canvas-Vorlagen)', async () => {
    const tabs = await renderEditor({ vorlagen }, 'profile-square');
    expect(tabs).toContain('text');
    expect(tabs).toContain('vorlagen');
  });
});

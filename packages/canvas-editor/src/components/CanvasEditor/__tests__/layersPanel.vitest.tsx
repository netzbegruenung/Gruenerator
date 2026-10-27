/**
 * „Ebenen" im ganzen Editor (#4953): der Bereich liest die aktive Seite über
 * ihren Bericht und wählt über ihren Store aus — eine Auswahl auf der Fläche
 * erscheint in der Liste, eine in der Liste auf der Fläche.
 */
import { defaultCanvasEditorStore } from '@ggraphic/editor/stores/createCanvasEditorStore';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';
import { CanvasEditor } from '../index';

vi.mock('../../../sidebar/UserUploadsProvider', () => ({
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

// `useIsCanvasMobile` fragt `(max-width: 899px)`; je Fall umschaltbar.
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

async function renderEditor() {
  const view = await act(async () =>
    render(
      <CanvasEditor
        initialConfigId="zitat-pure"
        initialProps={{}}
        initialPages={[
          { id: 'p1', configId: 'zitat-pure', state: { quote: 'Klimaschutz jetzt', name: 'Anna' } },
        ]}
        onExport={() => {}}
        onCancel={() => {}}
      />
    )
  );
  for (let i = 0; i < 50 && Konva.stages.length < 1; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  return { stage: Konva.stages[0]!, view };
}

async function openLayers() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Ebenen/ }));
  });
  return screen.findByRole('listbox', { name: 'Ebenen' });
}

describe('Ebenen im Editor', () => {
  afterEach(() => {
    mobile = false;
  });

  it('listet die Elemente der Seite, vorderstes zuerst', async () => {
    const { view } = await renderEditor();
    const list = await openLayers();
    const names = within(list)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(names).toContain('Text: Klimaschutz jetzt');
    expect(names.at(-1)).toBe('Hintergrund');
    expect(await axe(view.container)).toHaveNoViolations();
  });

  it('zeigt eine Auswahl auf der Fläche als ausgewählten Eintrag', async () => {
    const { stage } = await renderEditor();
    await openLayers();
    await act(async () => {
      stage.findOne('.canvas-background')!.fire('click', { evt: {} }, true);
    });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Hintergrund' })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    );
  });

  it('wählt mit Pfeil runter das nächste Element auf der Seite aus', async () => {
    await renderEditor();
    const list = await openLayers();
    const [first, second] = within(list).getAllByRole('option');
    await act(async () => {
      first!.focus();
      fireEvent.keyDown(first!, { key: 'ArrowDown' });
    });
    await waitFor(() => expect(second).toHaveAttribute('aria-selected', 'true'));
    expect(first).toHaveAttribute('aria-selected', 'false');
  });

  it('bearbeitet mit Enter auf einem Text den Text', async () => {
    await renderEditor();
    await openLayers();
    const text = screen.getByRole('option', { name: 'Text: Klimaschutz jetzt' });
    await act(async () => {
      text.focus();
      fireEvent.keyDown(text, { key: 'Enter' });
    });
    expect(await screen.findByRole('textbox')).toHaveTextContent('Klimaschutz jetzt');
  });

  it('springt mit „Zu den Ebenen" in die Liste', async () => {
    await renderEditor();
    expect(screen.queryByRole('listbox', { name: 'Ebenen' })).toBeNull();
    const skip = screen.getByRole('button', { name: 'Zu den Ebenen' });
    expect(skip).toHaveClass('sr-only');
    await act(async () => {
      fireEvent.click(skip);
    });
    const list = await screen.findByRole('listbox', { name: 'Ebenen' });
    await waitFor(() => expect(list).toContainElement(document.activeElement as HTMLElement));
    expect(document.activeElement).toHaveAttribute('role', 'option');
  });

  it('bietet „Zu den Ebenen" nicht an, solange die Seitenleiste inert ist', async () => {
    await renderEditor();
    expect(screen.getByRole('button', { name: 'Zu den Ebenen' })).toBeInTheDocument();
    try {
      await act(async () => {
        defaultCanvasEditorStore.getState().setPendingAiSuggestion({ title: 'Vorschlag' });
      });
      expect(screen.queryByRole('button', { name: 'Zu den Ebenen' })).toBeNull();
    } finally {
      await act(async () => {
        defaultCanvasEditorStore.getState().setPendingAiSuggestion(null);
      });
    }
    expect(screen.getByRole('button', { name: 'Zu den Ebenen' })).toBeInTheDocument();
  });

  it('steht mobil ohne Auswahl in der Leiste der Bereiche und öffnet das Sheet', async () => {
    mobile = true;
    await renderEditor();
    const bar = screen.getByRole('navigation', { name: 'Editor-Bereiche' });
    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: /^Ebenen/ }));
    });
    expect(
      await screen.findByRole('listbox', { name: 'Ebenen' }, { timeout: 2000 })
    ).toBeInTheDocument();
  });
});

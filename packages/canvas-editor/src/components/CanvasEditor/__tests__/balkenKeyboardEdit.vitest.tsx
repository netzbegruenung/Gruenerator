/**
 * Die Zeilen des Dreizeilen-Balkens mit der Tastatur bearbeiten: Enter/F2 auf
 * dem Eintrag „Balken: …“ öffnet Zeile 1, Tab springt zur nächsten Zeile,
 * Umschalt+Tab zur vorigen, Tab hinter der letzten gibt den Fokus an den
 * Eintrag zurück. Entf auf dem Balken sagt an, warum er stehen bleibt.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasEditor } from '../index';

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
  value: {
    check: () => true,
    load: async () => [],
    ready: Promise.resolve(),
    add() {},
    addEventListener() {},
    removeEventListener() {},
  },
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

const BALKEN = 'Balken: Klimaschutz / jetzt / handeln';

async function renderEditor() {
  await act(async () =>
    render(
      <CanvasEditor
        initialConfigId="dreizeilen"
        initialProps={{}}
        initialPages={[
          {
            id: 'p1',
            configId: 'dreizeilen',
            state: { line1: 'Klimaschutz', line2: 'jetzt', line3: 'handeln' },
          },
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
}

async function openLayers() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Ebenen/ }));
  });
  return screen.findByRole('listbox', { name: 'Ebenen' }, { timeout: 2000 });
}

const balkenOption = () => screen.getByRole('option', { name: BALKEN });

async function press(target: Element, key: string, init: { shiftKey?: boolean } = {}) {
  await act(async () => {
    fireEvent.keyDown(target, { key, ...init });
  });
}

/** Enter auf dem Balken-Eintrag; liefert das Feld der ersten Zeile. */
async function editFromList() {
  await openLayers();
  const option = balkenOption();
  await act(async () => {
    option.focus();
  });
  await press(option, 'Enter');
  return screen.findByRole('textbox', { name: 'Zeile 1 bearbeiten' });
}

afterEach(() => {
  mobile = false;
  document.body.querySelectorAll('body > input').forEach((el) => el.remove());
});

describe('Balken-Zeilen mit der Tastatur', () => {
  it('öffnet mit Enter auf dem Eintrag die erste Zeile, fokussiert', async () => {
    await renderEditor();
    const line1 = await editFromList();
    expect(line1).toHaveFocus();
    expect(line1).toHaveValue('Klimaschutz');
  });

  it('springt mit Tab zur nächsten und mit Umschalt+Tab zur vorigen Zeile', async () => {
    await renderEditor();
    const line1 = await editFromList();
    // Der Fokus geht vom alten Feld direkt ins neue, nie über <body>.
    const handedTo: (EventTarget | null)[] = [];
    const onFocusOut = (e: FocusEvent) => handedTo.push(e.relatedTarget);
    document.addEventListener('blur', onFocusOut, true);
    await press(line1, 'Tab');
    document.removeEventListener('blur', onFocusOut, true);
    const line2 = screen.getByRole('textbox', { name: 'Zeile 2 bearbeiten' });
    expect(handedTo).toEqual([line2]);
    expect(line2).toHaveFocus();
    expect(line2).toHaveValue('jetzt');
    expect(screen.queryByRole('textbox', { name: 'Zeile 1 bearbeiten' })).toBeNull();

    await press(line2, 'Tab', { shiftKey: true });
    expect(screen.getByRole('textbox', { name: 'Zeile 1 bearbeiten' })).toHaveFocus();
  });

  it('übernimmt jede Zeile beim Weiterspringen', async () => {
    await renderEditor();
    const line1 = await editFromList();
    fireEvent.input(line1, { target: { value: 'Klimaschutz!' } });
    await press(line1, 'Tab');
    expect(
      await screen.findByRole('option', { name: 'Balken: Klimaschutz! / jetzt / handeln' })
    ).toBeInTheDocument();
  });

  it('gibt nach Tab auf der letzten Zeile den Fokus an den Eintrag zurück', async () => {
    await renderEditor();
    const line1 = await editFromList();
    await press(line1, 'Tab');
    await press(screen.getByRole('textbox', { name: 'Zeile 2 bearbeiten' }), 'Tab');
    await press(screen.getByRole('textbox', { name: 'Zeile 3 bearbeiten' }), 'Tab');
    expect(screen.queryByRole('textbox', { name: /^Zeile \d bearbeiten$/ })).toBeNull();
    await waitFor(() => expect(balkenOption()).toHaveFocus());
  });

  it('bietet im Kontextmenü „Text bearbeiten“ an', async () => {
    await renderEditor();
    await openLayers();
    await act(async () => {
      fireEvent.click(balkenOption());
    });
    const stage = Konva.stages[0]!;
    await act(async () => {
      fireEvent.contextMenu(stage.container(), { clientX: 10, clientY: 10 });
    });
    expect(await screen.findByRole('menuitem', { name: /^Text bearbeiten/ })).toBeInTheDocument();
  });

  it('sagt bei Entf an, dass der Balken zur Vorlage gehört, und lässt ihn stehen', async () => {
    await renderEditor();
    await openLayers();
    const option = balkenOption();
    await act(async () => {
      fireEvent.click(option);
      option.focus();
    });
    await waitFor(() => expect(option).toHaveAttribute('aria-selected', 'true'));
    await press(option, 'Delete');
    const message = `Gehört zur Vorlage und lässt sich nicht löschen: ${BALKEN}`;
    await waitFor(() =>
      expect(screen.getAllByRole('status').map((s) => s.textContent)).toContain(message)
    );
    expect(balkenOption()).toBeInTheDocument();
  });

  it('öffnet die erste Zeile auch mobil mit Enter auf dem Eintrag', async () => {
    mobile = true;
    await renderEditor();
    const bar = screen.getByRole('navigation', { name: 'Editor-Bereiche' });
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('button', { name: /^Ebenen/ }).find((b) => bar.contains(b))!
      );
    });
    await screen.findByRole('listbox', { name: 'Ebenen' }, { timeout: 2000 });
    const option = balkenOption();
    await act(async () => {
      option.focus();
    });
    await press(option, 'Enter');
    expect(await screen.findByRole('textbox', { name: 'Zeile 1 bearbeiten' })).toHaveFocus();
  });
});

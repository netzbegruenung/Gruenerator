import { CanvasActionSheet } from '@ggraphic/editor/components/CanvasContextMenu/CanvasActionSheet';
import { buildCanvasMenu } from '@ggraphic/editor/components/CanvasContextMenu/canvasMenuModel';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import type { CanvasContextMenuHandle } from '@ggraphic/editor/components/CanvasContextMenu/CanvasContextMenu';
import type { SelectionCapabilities } from '@ggraphic/editor/utils/selectionCapabilities';

/**
 * „…“ in der Pille öffnet mobil ein Sheet mit demselben Menü wie der
 * Rechtsklick am Desktop: gleiches Modell, gleiche Befehle, andere Form.
 */

const CAPS: SelectionCapabilities = {
  count: 1,
  canCopy: true,
  canDelete: false,
  canBringForward: true,
  canSendBackward: false,
  lock: 'none',
  canLock: true,
  canRotate: true,
  canFlip: true,
  rotation: 0,
  canAlign: true,
  canDistribute: false,
  canEditText: false,
};

const ENV = {
  isMac: false,
  hasPoint: false,
  hasClipboard: false,
  pageIndex: 0,
  pageCount: 1,
  canAddPage: true,
  canEditImage: true,
};

function openSheet(caps: SelectionCapabilities = CAPS, selection = ['s1']) {
  const ref = createRef<CanvasContextMenuHandle>();
  const run = vi.fn();
  const view = render(<CanvasActionSheet handleRef={ref} />);
  const menu = buildCanvasMenu(
    {
      selection,
      module: { type: 'shape', data: { id: 's1' } },
      caps,
      canSelectAll: true,
      isCropping: false,
      background: null,
    },
    ENV
  );
  act(() => ref.current?.open({ point: { clientX: 0, clientY: 0 }, menu, run }));
  return { run, ...view };
}

async function flushFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

describe('Aktions-Sheet', () => {
  it('zeigt das Menü der Auswahl als Dialog mit Zeilen, ohne Tastenkürzel', async () => {
    const { baseElement } = openSheet();
    const sheet = screen.getByRole('dialog', { name: 'Element' });
    for (const name of ['Kopieren', 'Duplizieren', 'Ebene', 'Ausrichten', 'Sperren']) {
      expect(within(sheet).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(sheet).not.toHaveTextContent('Strg');
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('lässt Gesperrtes stehen und ausgegraut: Löschen ohne Recht, Einfügen ohne Inhalt', () => {
    openSheet();
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Einfügen' })).toBeDisabled();
  });

  it('öffnet ein Untermenü als eigene Ansicht und kehrt mit „Zurück“ zurück', async () => {
    openSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Ebene' }));
    expect(screen.getByRole('dialog', { name: 'Ebene' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nach hinten' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Kopieren' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(screen.getByRole('dialog', { name: 'Element' })).toBeInTheDocument();
  });

  it('schließt sich und führt den Befehl danach aus', async () => {
    const { run } = openSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Ebene' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ganz nach vorne' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await flushFrame();
    expect(run).toHaveBeenCalledWith('bringToFront');
  });

  it('trägt bei mehreren Elementen deren Anzahl im Kopf', () => {
    openSheet({ ...CAPS, count: 3, canDistribute: true }, ['a', 'b', 'c']);
    expect(screen.getByRole('dialog', { name: '3 Elemente' })).toBeInTheDocument();
  });
});

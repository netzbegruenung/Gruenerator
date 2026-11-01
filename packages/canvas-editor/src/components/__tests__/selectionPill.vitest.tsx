import {
  SelectionPill,
  type SelectionPillProps,
  placePill,
} from '@ggraphic/editor/components/SelectionPill';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Die Pille steht über dem ausgewählten Objekt (darunter, wenn oben kein
 * Platz ist), verschwindet beim Ziehen und trägt Duplizieren/Löschen/Mehr;
 * am Desktop (`pointer`) dazu Sperren.
 */

// Seitenfläche 390 × 600: darunter beginnt die Auswahl-Leiste (390 × 844, iPhone 13).
const VISIBLE = { left: 0, top: 52, right: 390, bottom: 600 };

async function flushFrames() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

function setup(overrides: Partial<SelectionPillProps> = {}) {
  let manipulate: (active: boolean) => void = () => {};
  const props: SelectionPillProps = {
    measureKey: 'a',
    zoom: 1,
    getBox: () => ({ left: 100, top: 300, width: 80, height: 60, visible: VISIBLE, rotaters: [] }),
    subscribeManipulation: (listener) => {
      manipulate = listener;
      return () => {};
    },
    canDuplicate: true,
    canDelete: true,
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onMore: vi.fn(),
    ...overrides,
  };
  render(<SelectionPill {...props} />);
  return { props, manipulate: (active: boolean) => act(() => manipulate(active)) };
}

describe('SelectionPill (touch)', () => {
  it('steht über der Auswahl und ruft ihre Aktionen', async () => {
    const { props } = setup();
    await flushFrames();
    const pill = screen.getByRole('toolbar', { name: 'Element' });
    expect(pill.style.top).toBe(`${300 - 12 - 44}px`);
    await userEvent.click(screen.getByRole('button', { name: 'Duplizieren' }));
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mehr Optionen' }));
    expect(props.onDuplicate).toHaveBeenCalledOnce();
    expect(props.onDelete).toHaveBeenCalledOnce();
    expect(props.onMore).toHaveBeenCalledOnce();
  });

  it('spiegelt nur, wenn die Mehrfachauswahl es anbietet', async () => {
    const onFlip = vi.fn();
    setup({ onFlip, onMore: undefined });
    await flushFrames();
    await userEvent.click(screen.getByRole('button', { name: 'Horizontal spiegeln' }));
    await userEvent.click(screen.getByRole('button', { name: 'Vertikal spiegeln' }));
    expect(onFlip.mock.calls).toEqual([['x'], ['y']]);
  });

  it('zeigt ohne onFlip keine Spiegeln-Knöpfe', async () => {
    setup();
    await flushFrames();
    expect(screen.queryByRole('button', { name: /spiegeln/ })).toBeNull();
  });

  it('rutscht unter das Objekt, wenn oben die Kopfzeile ist', async () => {
    setup({
      getBox: () => ({ left: 100, top: 70, width: 80, height: 60, visible: VISIBLE, rotaters: [] }),
    });
    await flushFrames();
    expect(screen.getByRole('toolbar', { name: 'Element' }).style.top).toBe(`${70 + 60 + 12}px`);
  });

  it('verschwindet beim Ziehen und kommt danach wieder', async () => {
    const { manipulate } = setup();
    await flushFrames();
    manipulate(true);
    expect(screen.queryByRole('toolbar', { name: 'Element' })).toBeNull();
    manipulate(false);
    await flushFrames();
    expect(screen.getByRole('toolbar', { name: 'Element' })).toBeInTheDocument();
  });

  it('sperrt Löschen bei Vorlagen-Elementen', async () => {
    setup({ canDelete: false });
    await flushFrames();
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeDisabled();
  });
});

describe('SelectionPill (pointer)', () => {
  const pointer = (overrides: Partial<SelectionPillProps> = {}) =>
    setup({ variant: 'pointer', onToggleLock: vi.fn(), ...overrides });

  it('sperrt, dupliziert, löscht und öffnet das Menü am Knopf', async () => {
    const { props } = pointer();
    await flushFrames();
    const lock = screen.getByRole('button', { name: 'Sperren' });
    expect(lock).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(lock);
    await userEvent.click(screen.getByRole('button', { name: 'Duplizieren' }));
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    const more = screen.getByRole('button', { name: 'Mehr Optionen' });
    await userEvent.click(more);
    expect(props.onToggleLock).toHaveBeenCalledOnce();
    expect(props.onDuplicate).toHaveBeenCalledOnce();
    expect(props.onDelete).toHaveBeenCalledOnce();
    expect(props.onMore).toHaveBeenCalledWith(more);
  });

  it('nennt das Kürzel und, wenn Löschen nicht geht, den Grund', async () => {
    pointer();
    await flushFrames();
    expect(screen.getByRole('button', { name: 'Löschen' }).title).toMatch(/^Löschen \((Entf|⌫)\)$/);
  });

  it.each([
    [{ isLocked: true }, 'Gesperrt — zum Löschen erst entsperren'],
    [{ isMulti: true }, 'Nichts davon lässt sich löschen'],
    [{}, 'Dieses Element gehört zur Vorlage und lässt sich nicht löschen'],
  ])('gesperrtes Löschen %o erklärt sich', async (state, title) => {
    pointer({ canDelete: false, ...state });
    await flushFrames();
    const remove = screen.getByRole('button', { name: 'Löschen' });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute('title', title);
  });

  it('gesperrt: Entsperren gedrückt, Löschen bleibt sichtbar', async () => {
    pointer({ isLocked: true, canDelete: false });
    await flushFrames();
    expect(screen.getByRole('button', { name: 'Entsperren' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeDisabled();
  });

  it('ohne Sperr-Fähigkeit kein Sperren-Knopf', async () => {
    pointer({ onToggleLock: undefined });
    await flushFrames();
    expect(screen.queryByRole('button', { name: /perren$/ })).toBeNull();
  });
});

describe('placePill: am sichtbaren Teil der Seitenfläche', () => {
  const box = (top: number, height: number) => ({
    left: 100,
    top,
    width: 80,
    height,
    visible: VISIBLE,
    rotaters: [] as { left: number; top: number; right: number; bottom: number }[],
  });

  it('über der Auswahl, wenn dort Platz ist', () => {
    expect(placePill(box(300, 60), 120).top).toBe(300 - 12 - 44);
  });

  it('darunter, wenn oben die Kopfzeile ist und unten Platz', () => {
    expect(placePill(box(70, 60), 120).top).toBe(70 + 60 + 12);
  });

  // #4950: hohes Element endet 15 px über der Leiste, oben kein Platz.
  it('liegt nie auf der Auswahl-Leiste: dann in der Auswahl an ihrer Unterkante', () => {
    const { top } = placePill(box(70, 515), 120);
    expect(top + 44).toBeLessThanOrEqual(VISIBLE.bottom - 8);
    expect(top).toBe(70 + 515 - 12 - 44);
  });

  // Review #4960: Element endet bei 530, Drehgriff (Finger, 32 px) darunter bei 542–574.
  it('legt sich in der Auswahl nicht über den Drehgriff', () => {
    const rotater = { left: 124, top: 542, right: 156, bottom: 574 };
    const { top } = placePill({ ...box(70, 574 - 70), rotaters: [rotater] }, 120);
    expect(top + 44).toBeLessThanOrEqual(rotater.top);
    expect(top).toBe(542 - 12 - 44);
  });

  it('ein Drehgriff neben der Pille schiebt sie nicht hoch', () => {
    const rotater = { left: 0, top: 300, right: 20, bottom: 332 };
    const { top } = placePill({ ...box(70, 515), rotaters: [rotater] }, 120);
    expect(top).toBe(70 + 515 - 12 - 44);
  });

  it('zu wenig Platz: lieber unter die Kopfzeile als auf die Leiste', () => {
    const tiny = { left: 0, top: 52, right: 390, bottom: 100 };
    const { top } = placePill({ ...box(60, 30), visible: tiny }, 120);
    expect(top + 44).toBeLessThanOrEqual(tiny.bottom - 8);
  });

  it('ragt die Auswahl unter die Leiste, steht die Pille über deren Oberkante', () => {
    const { top } = placePill(box(70, 700), 120);
    expect(top).toBe(VISIBLE.bottom - 12 - 44);
  });

  it('bleibt seitlich in der sichtbaren Fläche', () => {
    expect(placePill({ ...box(300, 60), left: 360 }, 120).left).toBe(390 - 120 - 8);
    expect(placePill({ ...box(300, 60), left: -100 }, 120).left).toBe(8);
  });
});

describe('placePill: pointer', () => {
  // Desktop: oben über der Fläche schwebt die Kontextleiste (56 px Band).
  const DESK = { left: 0, top: 100, right: 1200, bottom: 800 };
  const box = (top: number) => ({
    left: 400,
    top,
    width: 200,
    height: 100,
    visible: DESK,
    rotaters: [] as { left: number; top: number; right: number; bottom: number }[],
  });

  it('über der Auswahl, kleiner als am Handy', () => {
    expect(placePill(box(400), 140, 'pointer').top).toBe(400 - 12 - 36);
  });

  it('rutscht nicht unter die Kontextleiste, sondern unter das Objekt', () => {
    // Darüber wäre 180 - 48 = 132, das Band reicht bis 100 + 56 + 8 = 164.
    expect(placePill(box(180), 140, 'pointer').top).toBe(180 + 100 + 12);
  });
});

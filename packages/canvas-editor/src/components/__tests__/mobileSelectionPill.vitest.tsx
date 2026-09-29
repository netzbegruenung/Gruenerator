import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MobileSelectionPill, type MobileSelectionPillProps } from '../MobileSelectionPill';

/**
 * Die Pille steht über dem ausgewählten Objekt (darunter, wenn oben kein
 * Platz ist), verschwindet beim Ziehen und trägt Duplizieren/Löschen/Mehr.
 */

async function flushFrames() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

function setup(overrides: Partial<MobileSelectionPillProps> = {}) {
  let manipulate: (active: boolean) => void = () => {};
  const props: MobileSelectionPillProps = {
    measureKey: 'a',
    zoom: 1,
    getBox: () => ({ left: 100, top: 300, width: 80, height: 60 }),
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
  render(<MobileSelectionPill {...props} />);
  return { props, manipulate: (active: boolean) => act(() => manipulate(active)) };
}

describe('MobileSelectionPill', () => {
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

  it('rutscht unter das Objekt, wenn oben die Kopfzeile ist', async () => {
    setup({ getBox: () => ({ left: 100, top: 70, width: 80, height: 60 }) });
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

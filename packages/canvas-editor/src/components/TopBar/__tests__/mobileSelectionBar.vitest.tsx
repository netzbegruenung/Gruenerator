import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CanvasStoreProvider } from '../../../stores/CanvasStoreProvider';
import { MobileSelectionBar } from '../MobileSelectionBar';

/**
 * Mobil öffnet eine Auswahl kein Sheet mehr: die untere Leiste trägt die
 * Formatierung, „Mehr" öffnet den Bereich ausdrücklich, ✓ beendet die Auswahl.
 * Duplizieren und Löschen liegen in der Pille am Objekt, nicht hier.
 */

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

function renderBar(props: { onOpenArea?: () => void; onDone?: () => void } = {}) {
  return render(
    <CanvasStoreProvider>
      <MobileSelectionBar
        selectedElement="shape-1"
        activeFloatingModule={{ type: 'shape', data: { id: 'shape-1', fill: '#005538' } }}
        canMoveUp
        canMoveDown={false}
        canDuplicate
        handlers={HANDLERS}
        onDelete={() => {}}
        onDeselect={() => {}}
        onDone={props.onDone ?? (() => {})}
        onOpenArea={props.onOpenArea}
      />
    </CanvasStoreProvider>
  );
}

describe('MobileSelectionBar', () => {
  it('trägt die Formatierung, aber keine Objekt-Aktionen', () => {
    renderBar();
    expect(screen.getByRole('toolbar', { name: 'Auswahl bearbeiten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Farbpalette öffnen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duplizieren (Strg+D)' })).toBeNull();
    expect(screen.queryByTitle('Seite löschen')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Auswahl aufheben (Esc)' })).toBeNull();
  });

  it('öffnet den Bereich über „Mehr" und beendet über ✓', async () => {
    const onOpenArea = vi.fn();
    const onDone = vi.fn();
    renderBar({ onOpenArea, onDone });
    await userEvent.click(screen.getByRole('button', { name: 'Mehr' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(onOpenArea).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('zeigt „Mehr" nur, wenn die Auswahl einen Bereich hat', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: 'Mehr' })).toBeNull();
  });
});

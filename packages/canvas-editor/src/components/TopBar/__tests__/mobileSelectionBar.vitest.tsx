import { CanvasStoreProvider } from '@ggraphic/editor/stores/CanvasStoreProvider';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileSelectionBar } from '@ggraphic/editor/components/TopBar/MobileSelectionBar';

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
        onDeletePage={() => {}}
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

describe('MobileSelectionBar: Zuschneiden per Tastatur', () => {
  afterEach(() => {
    delete document.documentElement.dataset.focusModality;
  });

  function renderPhotoBar(handleCropImage: () => void) {
    return render(
      <CanvasStoreProvider>
        <div aria-current="page">
          <button type="button" data-page-focus-target="p1">
            Seite 1 bearbeiten
          </button>
        </div>
        <MobileSelectionBar
          selectedElement="photo"
          activeFloatingModule={{
            type: 'user-image',
            data: { id: 'photo', src: '/photo.jpg', width: 600, height: 400 },
          }}
          canMoveUp={false}
          canMoveDown={false}
          canDuplicate
          handlers={{ ...HANDLERS, handleCropImage }}
          onDeletePage={() => {}}
          onDeselect={() => {}}
          onDone={() => {}}
        />
      </CanvasStoreProvider>
    );
  }

  // In der Werkzeugleiste gehören die Pfeile dem Wechsel zwischen den Knöpfen;
  // der Ausschnitt liesse sich von dort nicht verschieben.
  it('gibt den Fokus an die Seite, damit die Pfeile den Ausschnitt schieben', async () => {
    const crop = vi.fn();
    renderPhotoBar(crop);
    document.documentElement.dataset.focusModality = 'keyboard';
    screen.getByRole('button', { name: 'Zuschneiden' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(crop).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Seite 1 bearbeiten' })).toHaveFocus();
  });

  it('lässt den Fokus beim Antippen, wo er ist', async () => {
    const crop = vi.fn();
    renderPhotoBar(crop);
    document.documentElement.dataset.focusModality = 'pointer';
    await userEvent.click(screen.getByRole('button', { name: 'Zuschneiden' }));
    expect(crop).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Seite 1 bearbeiten' })).not.toHaveFocus();
  });
});

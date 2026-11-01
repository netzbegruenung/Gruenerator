import { BarTilesProvider } from '@ggraphic/editor/components/TopBar/barTiles';
import { ContextControls } from '@ggraphic/editor/components/TopBar/ContextControls';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe } from '../../../test-utils';

import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';

/**
 * Mobil stehen die Werkzeuge der Auswahl als Kacheln: Icon oben, Wort darunter.
 * Der Name jedes Knopfs beginnt mit dem Wort, das man sieht (WCAG 2.5.3).
 */

const freeText: FloatingModuleState = {
  type: 'text',
  data: { id: 't1', fill: '#005538', isInstanceText: true, fontSize: 24, align: 'left' },
};

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
  handleTextAlignChange: () => {},
  onOpenEffects: () => {},
};

function renderControls({ tiles }: { tiles: boolean }) {
  const controls = (
    <div role="toolbar" aria-label="Auswahl bearbeiten">
      <ContextControls
        selectedElement="t1"
        activeFloatingModule={freeText}
        canMoveUp={false}
        canMoveDown={false}
        canDuplicate
        hideObjectActions
        handlers={HANDLERS}
      />
    </div>
  );
  return render(tiles ? <BarTilesProvider>{controls}</BarTilesProvider> : controls);
}

describe('Kacheln der mobilen Auswahl-Leiste', () => {
  it('beschriftet jedes Werkzeug, und der Name beginnt mit dem Wort', async () => {
    const { container } = renderControls({ tiles: true });
    for (const name of ['Farbe', 'Ausrichtung: linksbündig', 'Deckkraft', 'Effekte', 'Position']) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveTextContent(name.split(':')[0]!);
    }
    // Die Schriftgröße bleibt ein Stepper; „Größe“ beschriftet die Gruppe.
    expect(screen.getByText('Größe')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Schrift vergrößern' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('beschriftet Schrift und Formatknöpfe nach einem Klick, ohne Wort ohne Liste', () => {
    render(
      <BarTilesProvider>
        <ContextControls
          selectedElement="t1"
          activeFloatingModule={{
            type: 'text',
            data: { ...freeText.data, text: 'Hallo', fontFamily: 'Arial' },
          }}
          canMoveUp={false}
          canMoveDown={false}
          canDuplicate
          hideObjectActions
          handlers={{
            ...HANDLERS,
            handleFontRoleChange: () => {},
            handleTextFormatChange: () => {},
          }}
        />
      </BarTilesProvider>
    );
    expect(screen.getByText('Format')).toHaveAttribute('aria-hidden', 'true');
    // „Schrift“ steht genau dann, wenn die Marke etwas zur Wahl hat.
    expect(screen.queryAllByText('Schrift')).toHaveLength(
      screen.queryAllByRole('combobox', { name: /Schrift/ }).length
    );
  });

  it('kommt ohne Trennstriche aus — die Wörter trennen schon', () => {
    const tiles = renderControls({ tiles: true }).container.innerHTML;
    const bar = renderControls({ tiles: false }).container.innerHTML;
    const separators = (html: string) => html.split('w-px').length - 1;
    expect(separators(tiles)).toBe(0);
    expect(separators(bar)).toBeGreaterThan(0);
  });

  it('lässt die Desktop-Leiste, wie sie ist', () => {
    renderControls({ tiles: false });
    expect(screen.getByRole('button', { name: 'Farbpalette öffnen' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Textausrichtung: linksbündig' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Größe')).toBeNull();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CanvasStoreProvider } from '../../../stores/CanvasStoreProvider';
import { MobileSelectionControls } from '../MobileSelectionControls';

/**
 * Mobil gibt es keine eigene Kontextleiste mehr: der Auswahl-Block oben im
 * Sheet trägt dieselben Bedienteile. Hält fest, dass sie dort ankommen.
 */

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

describe('MobileSelectionControls', () => {
  it('benennt die Auswahl und trägt die Bedienteile der Kontextleiste', () => {
    render(
      <CanvasStoreProvider>
        <MobileSelectionControls
          selectedElement="shape-1"
          activeFloatingModule={{ type: 'shape', data: { id: 'shape-1', fill: '#005538' } }}
          canMoveUp
          canMoveDown={false}
          canDuplicate
          handlers={HANDLERS}
        />
      </CanvasStoreProvider>
    );
    expect(screen.getByText('Auswahl · Form')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplizieren (Strg+D)' })).toBeEnabled();
  });
});

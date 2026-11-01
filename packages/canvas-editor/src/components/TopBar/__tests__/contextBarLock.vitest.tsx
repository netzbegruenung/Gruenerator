import { ContextControls } from '@ggraphic/editor/components/TopBar/ContextControls';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';

/**
 * Sperren in den Auswahl-Steuerungen (mobil im Auswahl-Block des Sheets). Am
 * Desktop sperrt die Pille am Objekt, Löschen steht ebenfalls dort
 * (`selectionPill.vitest.tsx`).
 */

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
  handleToggleLock: () => {},
};

const shapeModule: FloatingModuleState = {
  type: 'shape',
  data: { id: 'shape-1', fill: '#005538' },
};

function renderBar(overrides: Partial<React.ComponentProps<typeof ContextControls>> = {}) {
  return render(
    <ContextControls
      selectedElement="shape-1"
      activeFloatingModule={shapeModule}
      canMoveUp={false}
      canMoveDown={false}
      canDuplicate
      canLock
      handlers={HANDLERS}
      {...overrides}
    />
  );
}

describe('Sperren-Knopf', () => {
  it('schaltet die Sperre und zeigt, ob sie gilt', async () => {
    const handleToggleLock = vi.fn();
    const { rerender } = renderBar({ handlers: { ...HANDLERS, handleToggleLock } });
    const lock = screen.getByRole('button', { name: 'Sperren' });
    expect(lock).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(lock);
    expect(handleToggleLock).toHaveBeenCalledTimes(1);

    rerender(
      <ContextControls
        selectedElement="shape-1"
        activeFloatingModule={shapeModule}
        canMoveUp={false}
        canMoveDown={false}
        canDuplicate
        canLock
        lockState="all"
        handlers={HANDLERS}
      />
    );
    expect(screen.getByRole('button', { name: 'Entsperren' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('fehlt für Elemente, die sich nicht sperren lassen', () => {
    renderBar({ canLock: false });
    expect(screen.queryByRole('button', { name: 'Sperren' })).toBeNull();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ContextControls } from '@ggraphic/editor/components/TopBar/ContextControls';

import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';

/**
 * Löschen und Sperren in der Desktop-Leiste. Ein Element zu löschen ging am
 * Desktop nur mit Entf; der Mülleimer daneben löschte die ganze Seite.
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
      canDelete
      canLock
      onDeleteElement={() => {}}
      handlers={HANDLERS}
      {...overrides}
    />
  );
}

const deleteButton = () => screen.getByRole('button', { name: /^Löschen/ });

describe('Löschen-Knopf', () => {
  it('löscht das Element und nennt das Kürzel', async () => {
    const onDeleteElement = vi.fn();
    renderBar({ onDeleteElement });
    expect(deleteButton()).toHaveAccessibleName(/^Löschen \((Entf|⌫)\)$/);
    await userEvent.click(deleteButton());
    expect(onDeleteElement).toHaveBeenCalledTimes(1);
  });

  it('bleibt bei einem Vorlagen-Element sichtbar, aber aus', () => {
    renderBar({ canDelete: false });
    expect(deleteButton()).toBeDisabled();
    expect(deleteButton()).toHaveAttribute(
      'title',
      'Dieses Element gehört zur Vorlage und lässt sich nicht löschen'
    );
  });

  it('sagt bei einem gesperrten Element, warum es nicht geht', () => {
    renderBar({ canDelete: false, lockState: 'all' });
    expect(deleteButton()).toHaveAttribute('title', 'Gesperrt — zum Löschen erst entsperren');
  });

  it('fehlt, wo die Leiste ihn nicht mitbekommt (mobil liegt Löschen in der Pille)', () => {
    renderBar({ onDeleteElement: undefined });
    expect(screen.queryByRole('button', { name: /^Löschen/ })).toBeNull();
  });
});

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

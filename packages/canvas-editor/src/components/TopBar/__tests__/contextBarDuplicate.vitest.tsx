import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ContextControls } from '../ContextControls';

import type { FloatingModuleState } from '../../../hooks/useFloatingModuleState';

/**
 * Der Duplizieren-Knopf in der Kontextleiste.
 *
 * Duplizieren gab es vorher nur als unsichtbares Strg+D und als zwei Knöpfe
 * tief in der Seitenleiste (Balken, Illustrationen). Diese Zusicherungen halten
 * fest, was die Leiste zeigen muss — vor allem, dass ein nicht duplizierbares
 * Element den Knopf DEAKTIVIERT zeigt statt ihn verschwinden zu lassen.
 */

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

function shapeModule(id: string): FloatingModuleState {
  return { type: 'shape', data: { id, fill: '#005538' } };
}

function renderBar(overrides: Partial<React.ComponentProps<typeof ContextControls>> = {}) {
  return render(
    <ContextControls
      selectedElement="shape-1"
      activeFloatingModule={shapeModule('shape-1')}
      canMoveUp={false}
      canMoveDown={false}
      canDuplicate
      handlers={HANDLERS}
      {...overrides}
    />
  );
}

const duplicateButton = () => screen.getByRole('button', { name: 'Duplizieren (Strg+D)' });

describe('Duplizieren-Knopf', () => {
  it('steht neben den Ebenen-Knöpfen zur Verfügung', () => {
    renderBar();
    expect(duplicateButton()).toBeEnabled();
  });

  it('nennt das Tastenkürzel, damit es überhaupt auffindbar ist', () => {
    renderBar();
    expect(duplicateButton()).toHaveAttribute('title', 'Duplizieren (Strg+D)');
  });

  it('meldet den Klick genau einmal', async () => {
    const handleDuplicate = vi.fn();
    renderBar({ handlers: { ...HANDLERS, handleDuplicate } });

    await userEvent.click(duplicateButton());

    expect(handleDuplicate).toHaveBeenCalledTimes(1);
  });

  /**
   * Vorlagen-Elemente liegen in keiner Instanz-Sammlung. Sie verschwinden zu
   * lassen wäre irreführend: unklar, ob die Aktion fehlt oder nur hier nicht
   * geht. (Icons standen bis #3404 mit in dieser Zeile.)
   */
  it('zeigt den Knopf bei Vorlagen-Elementen deaktiviert statt ihn zu verbergen', () => {
    renderBar({ canDuplicate: false });

    const button = duplicateButton();
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'title',
      'Dieses Element gehört zur Vorlage und lässt sich nicht duplizieren'
    );
  });

  it('löst deaktiviert nichts aus', async () => {
    const handleDuplicate = vi.fn();
    renderBar({ canDuplicate: false, handlers: { ...HANDLERS, handleDuplicate } });

    await userEvent.click(duplicateButton());

    expect(handleDuplicate).not.toHaveBeenCalled();
  });

  it('bleibt ohne Auswahl ganz weg', () => {
    renderBar({ selectedElement: null, activeFloatingModule: null });
    expect(screen.queryByRole('button', { name: 'Duplizieren (Strg+D)' })).not.toBeInTheDocument();
  });
});

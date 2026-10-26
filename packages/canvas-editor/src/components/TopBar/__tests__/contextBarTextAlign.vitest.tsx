/**
 * Die Textausrichtung in der Kontextleiste (#4963): ein Knopf bei jedem Text,
 * der die aktuelle Ausrichtung nennt und links → zentriert → rechts
 * weiterschaltet. Bei Formen fehlt er — dort gibt es keinen Text.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';
import { ContextControls } from '../ContextControls';

import type { FloatingModuleState } from '../../../hooks/useFloatingModuleState';

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

function renderBar(module: FloatingModuleState) {
  const handleTextAlignChange = vi.fn();
  const view = render(
    <ContextControls
      selectedElement={module.data.id}
      activeFloatingModule={module}
      canMoveUp
      canMoveDown
      canDuplicate
      handlers={{ ...HANDLERS, handleTextAlignChange }}
    />
  );
  return { ...view, handleTextAlignChange };
}

const text = (align?: 'left' | 'center' | 'right'): FloatingModuleState => ({
  type: 'text',
  data: { id: 'quote-text', fontSize: 56, fill: '#ffffff', ...(align ? { align } : {}) },
});

describe('Kontextleiste: Textausrichtung', () => {
  it.each([
    ['center', 'zentriert', 'right'],
    ['right', 'rechtsbündig', 'left'],
    ['left', 'linksbündig', 'center'],
  ] as const)('%s: nennt „%s“ und schaltet weiter auf %s', (align, label, next) => {
    const { handleTextAlignChange } = renderBar(text(align));

    fireEvent.click(screen.getByRole('button', { name: `Textausrichtung: ${label}` }));

    expect(handleTextAlignChange).toHaveBeenCalledWith('quote-text', next);
  });

  it('ohne Angabe gilt linksbündig', () => {
    renderBar(text());
    expect(screen.getByRole('button', { name: 'Textausrichtung: linksbündig' })).toBeTruthy();
  });

  it('fehlt bei einer Form', () => {
    renderBar({ type: 'shape', data: { id: 'shape-1', fill: '#000000' } });
    expect(screen.queryByRole('button', { name: /Textausrichtung/ })).toBeNull();
  });

  it('hat keine axe-Verstöße', async () => {
    const { container } = renderBar(text('center'));
    expect(await axe(container)).toHaveNoViolations();
  });
});

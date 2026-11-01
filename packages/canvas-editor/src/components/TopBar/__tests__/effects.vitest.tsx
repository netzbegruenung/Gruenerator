import { ContextControls } from '@ggraphic/editor/components/TopBar/ContextControls';
import { EffectsSection } from '@ggraphic/editor/sidebar/sections/EffectsSection';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';

/**
 * „Effekte“: ein Text-Knopf in der Leiste öffnet den Bereich mit Verlauf,
 * Kontur und Schatten — wer was davon hat, entscheidet `effectsFor`.
 */

const freeText: FloatingModuleState = {
  type: 'text',
  data: { id: 't1', fill: '#005538', isInstanceText: true },
};
const templateText: FloatingModuleState = { type: 'text', data: { id: 't2', fill: '#005538' } };
const line: FloatingModuleState = { type: 'shape', data: { id: 's1', type: 'line' } };

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

function renderBar(module: FloatingModuleState, onOpenEffects = vi.fn()) {
  render(
    <ContextControls
      selectedElement={module.data.id}
      activeFloatingModule={module}
      canMoveUp={false}
      canMoveDown={false}
      canDuplicate
      handlers={{ ...HANDLERS, onOpenEffects }}
    />
  );
  return onOpenEffects;
}

const effectSections = () =>
  screen.queryAllByRole('region').map((r) => r.getAttribute('aria-labelledby') && r.textContent);

describe('Knopf „Effekte“', () => {
  it('öffnet den Bereich', async () => {
    const onOpenEffects = renderBar(freeText);
    await userEvent.click(screen.getByRole('button', { name: 'Effekte' }));
    expect(onOpenEffects).toHaveBeenCalledOnce();
  });

  it('fehlt, wo es keine Effekte gibt (Vorlagen-Text)', () => {
    renderBar(templateText);
    expect(screen.queryByRole('button', { name: 'Effekte' })).toBeNull();
  });
});

describe('Bereich „Effekte“', () => {
  const handlers = () => ({
    onGradientChange: vi.fn(),
    onOutlineChange: vi.fn(),
    onShadowChange: vi.fn(),
  });

  it('zeigt einem freien Text Verlauf, Kontur und Schatten', async () => {
    const h = handlers();
    const { baseElement } = render(<EffectsSection module={freeText} {...h} />);
    for (const name of ['Farbverlauf', 'Kontur', 'Schatten']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole('button', { name: 'Kontur: Aktivieren' }));
    expect(h.onOutlineChange).toHaveBeenCalledWith('t1', { stroke: '#ffffff', strokeWidth: 2 });
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('gibt einer Linie nur den Schatten', () => {
    render(<EffectsSection module={line} {...handlers()} />);
    expect(screen.getByRole('heading', { name: 'Schatten' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Farbverlauf' })).toBeNull();
    expect(effectSections()).toHaveLength(1);
  });

  it('sagt es, wenn die Auswahl keine Effekte hat', () => {
    render(<EffectsSection module={templateText} {...handlers()} />);
    expect(screen.getByText('Für diese Auswahl gibt es keine Effekte.')).toBeInTheDocument();
  });
});

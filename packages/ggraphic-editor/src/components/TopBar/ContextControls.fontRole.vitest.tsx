// SPDX-License-Identifier: MPL-2.0
import { brandDefault } from '@ggraphic/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { activeBrand, registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { ContextControls } from '@ggraphic/editor/components/TopBar/ContextControls';
import { messages } from '@ggraphic/editor/i18n/messages';

import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';

const original = activeBrand();
beforeEach(() =>
  registerBrandPacks([
    {
      ...brandDefault,
      fonts: {
        headline: 'Alpha Sans',
        body: 'Beta Serif',
        quoteShort: 'Alpha Sans',
        quoteEmphasis: 'Gamma Slab',
      },
    },
  ])
);
afterEach(() => registerBrandPacks([original]));

const base = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

const freeText = {
  type: 'text',
  data: {
    id: 'free-1',
    isInstanceText: true,
    fontSize: 40,
    fontFamily: 'Beta Serif, Arial, sans-serif',
    bind: { fontFamily: { ref: 'font.body', value: 'Beta Serif' } },
  },
} as FloatingModuleState;

const templateText = {
  type: 'text',
  data: { id: 'headline', fontSize: 40 },
} as FloatingModuleState;

function show(module: FloatingModuleState, { handler = true } = {}) {
  const handleFontRoleChange = vi.fn();
  render(
    <ContextControls
      selectedElement={module.data.id}
      activeFloatingModule={module}
      canMoveUp={false}
      canMoveDown={false}
      canDuplicate={false}
      handlers={{ ...base, ...(handler ? { handleFontRoleChange } : {}) }}
    />
  );
  return handleFontRoleChange;
}

const picker = () => screen.queryByRole('combobox', { name: messages().topBar.fontRole });

describe('the font role picker in the context bar', () => {
  it('shows the role of a free text on a plain selection and reports a pick for that text', () => {
    const handleFontRoleChange = show(freeText);
    expect((picker() as HTMLSelectElement).value).toBe('body');
    fireEvent.change(picker()!, { target: { value: 'quoteEmphasis' } });
    expect(handleFontRoleChange).toHaveBeenCalledWith('free-1', 'quoteEmphasis');
  });

  it('is not shown without a handler', () => {
    show(freeText, { handler: false });
    expect(picker()).toBeNull();
  });

  it('is not shown for a text of the template', () => {
    show(templateText);
    expect(picker()).toBeNull();
    expect(screen.getByLabelText(messages().topBar.fontLarger)).toBeInTheDocument();
  });
});

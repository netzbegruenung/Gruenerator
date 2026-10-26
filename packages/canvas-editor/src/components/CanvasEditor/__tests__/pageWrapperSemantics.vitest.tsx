import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';
import { isWidgetOwnedKey } from '../../../utils/keyboardOwnership';
import { PageWrapper } from '../PageWrapper';

vi.mock('../../GenericCanvas', () => ({
  GenericCanvas: () => (
    <div role="img" aria-label="Seite 2: Text: Klimaschutz">
      <canvas />
    </div>
  ),
}));
vi.mock('../../PageToolbar', () => ({
  PageToolbar: () => <button type="button">Seite duplizieren</button>,
}));
vi.mock('../../ZoomableViewport', () => ({
  ZoomableViewport: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function setup(isActive = false) {
  const onSelect = vi.fn();
  const utils = render(
    <PageWrapper
      {...({
        page: { id: 'p2', configId: 'x', state: {} },
        index: 1,
        pageCount: 2,
        config: { canvas: { width: 100, height: 100 } },
        isActive,
        canDelete: true,
        canvasRef: { current: null },
        onSelect,
        onDelete: vi.fn(),
        onMovePage: vi.fn(),
        onDuplicatePage: vi.fn(),
        onExport: vi.fn(),
        onCancel: vi.fn(),
        callbacks: {},
        onStateChange: vi.fn(),
      } as unknown as React.ComponentProps<typeof PageWrapper>)}
    />
  );
  return { onSelect, ...utils };
}

describe('PageWrapper semantics', () => {
  it('is a labelled group, current when active', () => {
    const a = setup(false);
    expect(screen.getByRole('group', { name: 'Seite 2' })).not.toHaveAttribute('aria-current');
    a.unmount();
    setup(true);
    expect(screen.getByRole('group', { name: 'Seite 2' })).toHaveAttribute('aria-current', 'page');
  });

  it('has no nested interactive controls', async () => {
    const { container } = setup(true);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('activates the page with Enter and Space on its focus target', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    const target = screen.getByRole('button', { name: 'Seite 2 bearbeiten' });
    expect(target).toHaveAttribute('data-page-focus-target', 'p2');
    target.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('leaves arrow keys to the editor (nudge) while the focus target has focus', () => {
    setup();
    const target = screen.getByRole('button', { name: 'Seite 2 bearbeiten' });
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    target.dispatchEvent(arrow);
    expect(isWidgetOwnedKey(arrow)).toBe(false);
  });
});

import { createEvent, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PageWrapper } from '../PageWrapper';

vi.mock('../../GenericCanvas', () => ({
  GenericCanvas: () => (
    <div className="konvajs-content">
      <canvas data-testid="stage" />
    </div>
  ),
}));
vi.mock('../../PageToolbar', () => ({
  PageToolbar: () => <button data-testid="toolbar-btn">Hoch</button>,
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
      } as never)}
    />
  );
  return { onSelect, ...utils };
}

function pointerDown(el: Element, init: Record<string, unknown>) {
  const ev = createEvent.pointerDown(el);
  for (const [k, v] of Object.entries(init)) Object.defineProperty(ev, k, { value: v });
  fireEvent(el, ev);
}

describe('PageWrapper activation', () => {
  it('activates on a primary touch pointer-down on the stage', () => {
    const { onSelect, getByTestId } = setup();
    pointerDown(getByTestId('stage'), { pointerType: 'touch', isPrimary: true, button: 0 });
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('ignores a pinch second finger', () => {
    const { onSelect, getByTestId } = setup();
    pointerDown(getByTestId('stage'), { pointerType: 'touch', isPrimary: false, button: 0 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not activate on a touch pointer-down outside the stage', () => {
    const { onSelect, container } = setup();
    pointerDown(container.firstElementChild!, { pointerType: 'touch', isPrimary: true, button: 0 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not activate from toolbar buttons or when already active', () => {
    const a = setup();
    pointerDown(a.getByTestId('toolbar-btn'), { pointerType: 'touch', isPrimary: true, button: 0 });
    expect(a.onSelect).not.toHaveBeenCalled();
    a.unmount();
    const b = setup(true);
    pointerDown(b.getByTestId('stage'), { pointerType: 'touch', isPrimary: true, button: 0 });
    expect(b.onSelect).not.toHaveBeenCalled();
  });

  it('mouse: pointer-down activates, click while still inactive does not double-fire after re-render', () => {
    const { onSelect, getByTestId } = setup();
    pointerDown(getByTestId('stage'), { pointerType: 'mouse', isPrimary: true, button: 0 });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

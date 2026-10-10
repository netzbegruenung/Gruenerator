import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useWorkAreaDeselect } from '../hooks/useWorkAreaDeselect';

function Harness({ onDeselect }: { onDeselect: () => void }) {
  const onPointerDown = useWorkAreaDeselect(onDeselect);
  return (
    <div data-testid="area" onPointerDown={onPointerDown}>
      <div data-testid="page" />
    </div>
  );
}

function setup() {
  const onDeselect = vi.fn();
  const utils = render(<Harness onDeselect={onDeselect} />);
  return { onDeselect, area: utils.getByTestId('area'), page: utils.getByTestId('page') };
}

const touch = (x: number, y: number) => ({
  pointerType: 'touch',
  isPrimary: true,
  pointerId: 1,
  clientX: x,
  clientY: y,
});

describe('work area deselect', () => {
  it('deselects on mouse pointerdown', () => {
    const { area, onDeselect } = setup();
    fireEvent.pointerDown(area, { pointerType: 'mouse', clientX: 1, clientY: 1 });
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it('ignores pointerdown bubbling up from a page', () => {
    const { page, onDeselect } = setup();
    fireEvent.pointerDown(page, { pointerType: 'mouse' });
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('deselects on a touch tap, on release', () => {
    const { area, onDeselect } = setup();
    fireEvent.pointerDown(area, touch(5, 5));
    expect(onDeselect).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, touch(6, 7));
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it('keeps the selection when a scroll happened in between', () => {
    const { area, onDeselect } = setup();
    fireEvent.pointerDown(area, touch(5, 5));
    fireEvent.scroll(document.body);
    fireEvent.pointerUp(window, touch(5, 6));
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('keeps the selection when the finger moved past the tap slop', () => {
    const { area, onDeselect } = setup();
    fireEvent.pointerDown(area, touch(5, 5));
    fireEvent.pointerUp(window, touch(5, 40));
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('keeps the selection when the browser cancels the touch to scroll', () => {
    const { area, onDeselect } = setup();
    fireEvent.pointerDown(area, touch(5, 5));
    fireEvent.pointerCancel(window, touch(5, 5));
    fireEvent.pointerUp(window, touch(5, 5));
    expect(onDeselect).not.toHaveBeenCalled();
  });
});

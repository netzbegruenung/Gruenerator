import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import { BevBoxOverlay, BevBoxPanel } from './BevBoxes';
import { type BevBox } from './types';
import { type BildEditorV2 } from './useBildEditorV2';

const boxes: BevBox[] = [
  {
    id: 'sky_1',
    bbox: [0, 0, 400, 1000],
    source: [0, 0, 400, 1000],
    desc: 'Blauer Himmel',
    action: 'keep',
    change: '',
  },
  {
    id: 'moth_1',
    bbox: [350, 150, 480, 300],
    source: [350, 150, 480, 300],
    desc: 'Motte links',
    action: 'remove',
    change: '',
  },
];

// The components read a handful of fields; the full hook needs a router and stores.
function fakeBev(patch: Partial<BildEditorV2> = {}): BildEditorV2 {
  return {
    boxes,
    boxesLoading: false,
    boxesError: null,
    selectedBoxId: null,
    setSelectedBoxId: vi.fn(),
    updateBox: vi.fn(),
    addBox: vi.fn(),
    removeAddedBox: vi.fn(),
    resetBoxes: vi.fn(),
    submit: vi.fn(),
    generating: false,
    ...patch,
  } as unknown as BildEditorV2;
}

describe('BevBoxOverlay', () => {
  it('names every box after its element and state', () => {
    render(<BevBoxOverlay bev={fakeBev()} />);
    expect(screen.getByRole('button', { name: 'Blauer Himmel (Behalten)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Motte links (Entfernen)' })).toBeInTheDocument();
  });

  it('moves a box by one grid step per arrow key and resizes with shift', () => {
    const bev = fakeBev();
    render(<BevBoxOverlay bev={bev} />);
    const moth = screen.getByRole('button', { name: /Motte links/ });
    fireEvent.keyDown(moth, { key: 'ArrowDown' });
    expect(bev.updateBox).toHaveBeenLastCalledWith('moth_1', { bbox: [360, 150, 490, 300] });
    fireEvent.keyDown(moth, { key: 'ArrowRight', shiftKey: true });
    expect(bev.updateBox).toHaveBeenLastCalledWith('moth_1', { bbox: [350, 150, 480, 310] });
  });

  it('announces detection while it runs', () => {
    render(<BevBoxOverlay bev={fakeBev({ boxes: null, boxesLoading: true })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Elemente werden erkannt');
  });

  it('has no axe violations', async () => {
    const { container } = render(<BevBoxOverlay bev={fakeBev({ selectedBoxId: 'moth_1' })} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('BevBoxPanel', () => {
  it('marks itself experimental and counts the changes', () => {
    render(<BevBoxPanel bev={fakeBev()} />);
    expect(screen.getByText('Experimentell')).toBeInTheDocument();
    expect(screen.getByText('2 Elemente · 1 geändert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 Änderung anwenden' })).toBeInTheDocument();
  });

  it('switches the action of the selected element', () => {
    const bev = fakeBev({ selectedBoxId: 'sky_1' });
    render(<BevBoxPanel bev={bev} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ändern' }));
    expect(bev.updateBox).toHaveBeenCalledWith('sky_1', { action: 'change' });
  });

  it('shows the detection error instead of an empty count', () => {
    render(
      <BevBoxPanel
        bev={fakeBev({ boxes: null, boxesError: 'Im Bild wurden keine Elemente erkannt.' })}
      />
    );
    expect(screen.getByText('Im Bild wurden keine Elemente erkannt.')).toBeInTheDocument();
  });

  it('has no axe violations with an element selected', async () => {
    const { container } = render(
      <BevBoxPanel
        bev={fakeBev({ selectedBoxId: 'sky_1', boxes: [{ ...boxes[0], action: 'change' }] })}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

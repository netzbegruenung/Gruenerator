import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import { BevBoxBar, BevBoxOverlay } from './BevBoxes';
import { type BevBox } from './types';
import { type BildEditorV2 } from './useBildEditorV2';

const boxes: BevBox[] = [
  {
    id: 'sky_1',
    bbox: [0, 0, 400, 1000],
    source: [0, 0, 400, 1000],
    desc: 'A clear blue sky.',
    label: 'Himmel',
    action: 'keep',
    change: '',
  },
  {
    id: 'umbrella_1',
    bbox: [350, 150, 480, 300],
    source: [350, 150, 480, 300],
    desc: 'A closed green patio umbrella.',
    label: 'Sonnenschirm',
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
    generating: false,
    submit: vi.fn(() => Promise.resolve(true)),
    ...patch,
  } as unknown as BildEditorV2;
}

describe('BevBoxOverlay', () => {
  it('names every box with its German label and what happens to it', () => {
    render(<BevBoxOverlay bev={fakeBev()} />);
    expect(screen.getByRole('button', { name: 'Himmel (unverändert)' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sonnenschirm (wird entfernt)' })
    ).toBeInTheDocument();
  });

  it('moves a box by one grid step per arrow key and resizes with shift', () => {
    const bev = fakeBev();
    render(<BevBoxOverlay bev={bev} />);
    const umbrella = screen.getByRole('button', { name: /Sonnenschirm/ });
    fireEvent.keyDown(umbrella, { key: 'ArrowDown' });
    expect(bev.updateBox).toHaveBeenLastCalledWith('umbrella_1', { bbox: [360, 150, 490, 300] });
    fireEvent.keyDown(umbrella, { key: 'ArrowRight', shiftKey: true });
    expect(bev.updateBox).toHaveBeenLastCalledWith('umbrella_1', { bbox: [350, 150, 480, 310] });
  });

  it('opens a menu at the selected element that replaces or removes it', () => {
    const bev = fakeBev({ selectedBoxId: 'sky_1' });
    render(<BevBoxOverlay bev={bev} />);
    const menu = screen.getByRole('group', { name: 'Himmel' });
    expect(menu).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Ersetzen durch' }), {
      target: { value: 'ein Sonnenuntergang' },
    });
    expect(bev.updateBox).toHaveBeenLastCalledWith('sky_1', {
      change: 'ein Sonnenuntergang',
      action: 'change',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
    expect(bev.updateBox).toHaveBeenLastCalledWith('sky_1', { action: 'remove', change: '' });
  });

  it('undoes a removal', () => {
    const bev = fakeBev({ selectedBoxId: 'umbrella_1' });
    render(<BevBoxOverlay bev={bev} />);
    expect(screen.getByText('Wird beim Anwenden entfernt.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(bev.updateBox).toHaveBeenLastCalledWith('umbrella_1', {
      action: 'keep',
      change: '',
      bbox: [350, 150, 480, 300],
    });
  });

  it('stays out of the way while the image is being reworked', () => {
    const { container } = render(<BevBoxOverlay bev={fakeBev({ generating: true })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('has no axe violations with the menu open', async () => {
    const { container } = render(<BevBoxOverlay bev={fakeBev({ selectedBoxId: 'sky_1' })} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('BevBoxBar', () => {
  it('counts the changes and applies them without chat text', () => {
    const bev = fakeBev();
    render(<BevBoxBar bev={bev} />);
    expect(screen.getByRole('status')).toHaveTextContent('1 Änderung');
    fireEvent.click(screen.getByRole('button', { name: 'Anwenden' }));
    expect(bev.submit).toHaveBeenCalledWith('');
  });

  it('announces detection while it runs', () => {
    render(<BevBoxBar bev={fakeBev({ boxes: null, boxesLoading: true })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Elemente werden erkannt');
    expect(screen.getByRole('button', { name: 'Anwenden' })).toBeDisabled();
  });

  it('shows the detection error', () => {
    render(
      <BevBoxBar
        bev={fakeBev({ boxes: null, boxesError: 'Im Bild wurden keine Elemente erkannt.' })}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Im Bild wurden keine Elemente erkannt.');
  });

  it('has no axe violations', async () => {
    const { container } = render(<BevBoxBar bev={fakeBev()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

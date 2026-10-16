import { createEvent, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { VORLAGE_DRAG_TYPE } from '../../../utils/mediaDrop';
import { PageWrapper } from '../PageWrapper';

vi.mock('../../GenericCanvas', () => ({ GenericCanvas: () => <canvas /> }));
vi.mock('../../PageToolbar', () => ({ PageToolbar: () => null }));
vi.mock('../../ZoomableViewport', () => ({
  ZoomableViewport: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function setup(onDropVorlage?: (id: string) => void) {
  const onSelect = vi.fn();
  const { getByRole } = render(
    <PageWrapper
      {...({
        page: { id: 'p2', configId: 'x', state: {} },
        index: 1,
        pageCount: 2,
        config: { canvas: { width: 100, height: 100 } },
        isActive: false,
        canDelete: true,
        canvasRef: { current: null },
        onSelect,
        onDelete: vi.fn(),
        onMovePage: vi.fn(),
        onDuplicatePage: vi.fn(),
        onDropVorlage,
        onExport: vi.fn(),
        onCancel: vi.fn(),
        callbacks: {},
        onStateChange: vi.fn(),
      } as unknown as React.ComponentProps<typeof PageWrapper>)}
    />
  );
  return { page: getByRole('button', { name: 'Seite 2' }), onSelect };
}

const vorlageTransfer = {
  types: [VORLAGE_DRAG_TYPE],
  getData: (type: string) => (type === VORLAGE_DRAG_TYPE ? 'zitat' : ''),
  dropEffect: 'none',
};

/** Fires the event and says whether the page accepted it (`preventDefault`). */
function fire(el: Element, kind: 'dragOver' | 'drop') {
  const ev = createEvent[kind](el, { dataTransfer: vorlageTransfer });
  fireEvent(el, ev);
  return ev.defaultPrevented;
}

describe('PageWrapper Vorlage drop', () => {
  it('hands a dropped Vorlage on without selecting the page', () => {
    const onDropVorlage = vi.fn();
    const { page, onSelect } = setup(onDropVorlage);
    expect(fire(page, 'dragOver')).toBe(true);
    expect(fire(page, 'drop')).toBe(true);
    expect(onDropVorlage).toHaveBeenCalledWith('zitat');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('refuses a Vorlage where the design has no Vorlagen tab', () => {
    const { page } = setup();
    expect(fire(page, 'dragOver')).toBe(false);
    expect(fire(page, 'drop')).toBe(false);
  });
});

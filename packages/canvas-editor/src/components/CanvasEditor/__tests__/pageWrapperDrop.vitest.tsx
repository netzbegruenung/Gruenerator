import { createEvent, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ELEMENT_DRAG_TYPE, VORLAGE_DRAG_TYPE } from '../../../utils/mediaDrop';
import { PageWrapper } from '../PageWrapper';

vi.mock('../../GenericCanvas', () => ({ GenericCanvas: () => <canvas /> }));
vi.mock('../../PageToolbar', () => ({ PageToolbar: () => null }));
vi.mock('../../ZoomableViewport', () => ({
  ZoomableViewport: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function setup(onDropVorlage?: (id: string) => void) {
  const onSelect = vi.fn();
  const dropElement = vi.fn(() => true);
  const { getByRole } = render(
    <PageWrapper
      {...({
        page: { id: 'p2', configId: 'x', state: {} },
        index: 1,
        pageCount: 2,
        config: { canvas: { width: 100, height: 100 } },
        isActive: false,
        canDelete: true,
        canvasRef: { current: { dropElement } },
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
  return { page: getByRole('button', { name: 'Seite 2' }), onSelect, dropElement };
}

function transfer(type: string, data: string) {
  return { types: [type], getData: (t: string) => (t === type ? data : ''), dropEffect: 'none' };
}

const vorlageTransfer = transfer(VORLAGE_DRAG_TYPE, 'zitat');
const iconTransfer = transfer(ELEMENT_DRAG_TYPE, JSON.stringify({ kind: 'icon', iconId: 'sun' }));

/** Fires the event and says whether the page accepted it (`preventDefault`). */
function fire(el: Element, kind: 'dragOver' | 'drop', dataTransfer: object = vorlageTransfer) {
  const ev = createEvent[kind](el, { dataTransfer });
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

describe('PageWrapper element drop', () => {
  it('selects the page and hands a dropped icon to its canvas', () => {
    const { page, onSelect, dropElement } = setup();
    expect(fire(page, 'dragOver', iconTransfer)).toBe(true);
    expect(fire(page, 'drop', iconTransfer)).toBe(true);
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(dropElement).toHaveBeenCalledWith(expect.anything(), { kind: 'icon', iconId: 'sun' });
  });
});

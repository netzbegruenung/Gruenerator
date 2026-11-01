import {
  ELEMENT_DRAG_TYPE,
  VORLAGE_DRAG_TYPE,
  takeDropPlaced,
} from '@ggraphic/editor/utils/mediaDrop';
import { createEvent, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { BlockInsertContext, type BlockInsertApi } from '../blockInsert';
import { PageWrapper } from '@ggraphic/editor/components/CanvasEditor/PageWrapper';

vi.mock('@ggraphic/editor/components/GenericCanvas', () => ({ GenericCanvas: () => <canvas /> }));
vi.mock('@ggraphic/editor/components/PageToolbar', () => ({ PageToolbar: () => null }));
vi.mock('@ggraphic/editor/components/ZoomableViewport', () => ({
  ZoomableViewport: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function setup(
  onDropVorlage?: (id: string, pageId: string) => void,
  placed = true,
  blocks: BlockInsertApi | null = null,
  readOnly = false
) {
  const onSelect = vi.fn();
  const dropElement = vi.fn(() => placed);
  const { getByRole } = render(
    <BlockInsertContext.Provider value={blocks}>
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
          readOnly,
        } as unknown as React.ComponentProps<typeof PageWrapper>)}
      />
    </BlockInsertContext.Provider>
  );
  return { page: getByRole('group', { name: 'Seite 2' }), onSelect, dropElement };
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
  it('hands a dropped Vorlage on with the page it landed on, without selecting it', () => {
    const onDropVorlage = vi.fn();
    const { page, onSelect } = setup(onDropVorlage);
    expect(fire(page, 'dragOver')).toBe(true);
    expect(fire(page, 'drop')).toBe(true);
    expect(onDropVorlage).toHaveBeenCalledWith('zitat', 'p2');
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
    expect(takeDropPlaced()).toBe(true);
  });

  it('does not report a drop its canvas refused as placed', () => {
    const { page } = setup(undefined, false);
    expect(fire(page, 'drop', iconTransfer)).toBe(true);
    expect(takeDropPlaced()).toBe(false);
  });
});

describe('PageWrapper block drop', () => {
  const blockTransfer = transfer(
    ELEMENT_DRAG_TYPE,
    JSON.stringify({ kind: 'block', blockId: 'de-block-zitat' })
  );

  it('composes a dropped block for the page it landed on, at the drop point', () => {
    const insert = vi.fn(async () => true);
    const { page, dropElement } = setup(undefined, true, { bloecke: [], isLoading: false, insert });
    const ev = createEvent.drop(page, { dataTransfer: blockTransfer });
    fireEvent(page, ev);
    expect(ev.defaultPrevented).toBe(true);
    // jsdom drops clientX/Y from drag events; the point itself is GenericCanvas's job.
    expect(insert).toHaveBeenCalledWith('de-block-zitat', {
      pageIndex: 1,
      at: expect.objectContaining({}),
    });
    expect(dropElement).not.toHaveBeenCalled();
    expect(takeDropPlaced()).toBe(true);
  });

  it('places nothing where the editor has no blocks', () => {
    const { page } = setup();
    fire(page, 'drop', blockTransfer);
    expect(takeDropPlaced()).toBe(false);
  });
});

describe('PageWrapper drop for a viewer', () => {
  it('accepts neither a Vorlage nor an element', () => {
    const { page, dropElement } = setup(vi.fn(), true, null, true);
    expect(fire(page, 'dragOver')).toBe(false);
    expect(fire(page, 'drop')).toBe(false);
    expect(fire(page, 'dragOver', iconTransfer)).toBe(false);
    expect(fire(page, 'drop', iconTransfer)).toBe(false);
    expect(dropElement).not.toHaveBeenCalled();
  });
});

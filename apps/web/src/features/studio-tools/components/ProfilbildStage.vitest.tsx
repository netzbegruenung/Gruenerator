import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { render } from '../../../test-utils';

import ProfilbildStage, { type ProfilbildStageProps } from './ProfilbildStage';

import type { PlacedSticker } from '../utils/profilbildStickers';

const applyPixelHitArea = vi.fn<(node: unknown) => void>();
vi.mock('../utils/profilbildHitArea', () => ({
  applyPixelHitArea: (node: unknown) => applyPixelHitArea(node),
}));

// Konva needs a real canvas; the stage logic under test only needs nodes behind refs.
vi.mock('react-konva', () => {
  const node = (name: string) => {
    const Node = forwardRef<unknown, { children?: ReactNode }>(({ children }, ref) => {
      useImperativeHandle(ref, () => ({ nodes: vi.fn(), getLayer: () => null }));
      return <>{children}</>;
    });
    Node.displayName = name;
    return Node;
  };
  return {
    Stage: node('Stage'),
    Layer: node('Layer'),
    Image: node('Image'),
    Rect: node('Rect'),
    Circle: node('Circle'),
    Line: node('Line'),
    Transformer: node('Transformer'),
  };
});

const imageA = { width: 10, height: 10 } as unknown as PlacedSticker['image'];
const imageB = { width: 10, height: 10 } as unknown as PlacedSticker['image'];

const sticker = (patch: Partial<PlacedSticker> = {}): PlacedSticker => ({
  uid: 'sticker-1',
  id: 'teamgruen',
  label: '#teamgrün',
  image: imageA,
  x: 100,
  y: 100,
  width: 400,
  height: 200,
  rotation: 0,
  ...patch,
});

const background = document.createElement('canvas');
const person = { width: 10, height: 10 } as ProfilbildStageProps['person'];

function props(stickers: PlacedSticker[]): ProfilbildStageProps {
  return {
    background,
    person,
    rect: { x: 0, y: 0, width: 500, height: 500 },
    round: false,
    onMove: vi.fn(),
    stickers,
    selectedSticker: null,
    onSelectSticker: vi.fn(),
    onStickerChange: vi.fn(),
  };
}

// Person and rect never change below, so after the first render every call is a sticker re-cache.
const stickerCaches = () => applyPixelHitArea.mock.calls.length;

afterEach(() => vi.restoreAllMocks());

describe('ProfilbildStage sticker hit areas', () => {
  it('re-caches on add and image swap, not on a move, without a deps-size warning', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<ProfilbildStage {...props([])} />);
    applyPixelHitArea.mockClear();

    rerender(<ProfilbildStage {...props([sticker()])} />);
    const afterAdd = stickerCaches();
    expect(afterAdd).toBeGreaterThan(0);

    rerender(<ProfilbildStage {...props([sticker({ x: 300, y: 250 })])} />);
    expect(stickerCaches()).toBe(afterAdd);

    rerender(<ProfilbildStage {...props([sticker({ x: 300, y: 250, image: imageB })])} />);
    expect(stickerCaches()).toBeGreaterThan(afterAdd);

    expect(error.mock.calls.flat().join(' ')).not.toContain('changed size between renders');
  });
});

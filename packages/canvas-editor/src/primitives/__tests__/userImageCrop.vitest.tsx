import { createCanvas } from '@napi-rs/canvas';
import { act, render, waitFor } from '@testing-library/react';
import { type default as Konva } from 'konva';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasItemLockContext } from '../../components/canvasItemLock';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage';
import { UserImagePrimitive } from '../UserImagePrimitive';

beforeEach(() => {
  vi.spyOn(window, 'Image').mockImplementation(function () {
    const image = Object.assign(createCanvas(600, 400), {
      naturalWidth: 600,
      naturalHeight: 400,
      onload: null as (() => void) | null,
    });
    Object.defineProperty(image, 'src', { set: () => queueMicrotask(() => image.onload?.()) });
    return image as unknown as HTMLImageElement;
  });
});
afterEach(() => vi.restoreAllMocks());

async function setup(cropping: boolean, locked = false) {
  const ref = createRef<CanvasStageRef>();
  const onCropEnd = vi.fn();
  const onCroppingChange = vi.fn();
  const onTransformEnd = vi.fn();
  render(
    <CanvasStage ref={ref} width={800} height={600} responsive={false}>
      <CanvasItemLockContext.Provider value={locked}>
        <UserImagePrimitive
          userImage={{
            id: 'photo',
            src: '/photo.jpg',
            fileName: 'photo.jpg',
            x: 50,
            y: 80,
            width: 600,
            height: 400,
            scale: 1,
            rotation: 0,
            opacity: 1,
          }}
          isSelected
          isCropping={cropping}
          onSelect={() => {}}
          onDragEnd={() => {}}
          onTransformEnd={onTransformEnd}
          onCropEnd={onCropEnd}
          onCroppingChange={onCroppingChange}
        />
      </CanvasItemLockContext.Provider>
    </CanvasStage>
  );
  const stage = ref.current!.getStage()!;
  await waitFor(() => expect(stage.findOne('.user-photo')).toBeTruthy());
  return { stage, onCropEnd, onCroppingChange, onTransformEnd };
}

describe('on-canvas crop interaction', () => {
  it('opens ordinary uploaded photos on double click and double tap', async () => {
    const { stage, onCroppingChange } = await setup(false);
    const photo = stage.findOne('.user-photo')!;
    act(() => {
      photo.fire('dblclick', {}, true);
      photo.fire('dbltap', {}, true);
    });
    expect(onCroppingChange.mock.calls).toEqual([[true], [true]]);
  });

  it('previews and commits a free crop as one image update, without resizing the parent', async () => {
    const { stage, onCropEnd, onTransformEnd } = await setup(true);
    const transformer = stage.findOne('Transformer') as Konva.Transformer;
    const frame = transformer.nodes()[0];
    expect(transformer.keepRatio()).toBe(false);
    expect(transformer.enabledAnchors()).toContain('middle-right');
    act(() => {
      frame.position({ x: 100, y: 50 });
      frame.scale({ x: 0.5, y: 0.5 });
      frame.fire('transform', {}, true);
    });
    const photo = stage.findOne('.user-photo') as Konva.Image;
    expect(photo.crop()).toEqual({ x: 100, y: 50, width: 300, height: 200 });
    await act(async () => {
      frame.fire('transformend', {}, true);
    });
    expect(onCropEnd).toHaveBeenCalledExactlyOnceWith({
      x: 150,
      y: 130,
      width: 300,
      height: 200,
      fit: 'cover',
      cropZoom: 2,
      panX: expect.closeTo(1 / 3),
      panY: 0.5,
    });
    expect(onTransformEnd).not.toHaveBeenCalled();
  });

  it('does not enter crop mode or show crop handles for a locked photo', async () => {
    const { stage, onCroppingChange } = await setup(true, true);
    await act(async () => {
      stage.findOne('.user-photo')!.fire('dblclick', {}, true);
    });
    expect(onCroppingChange).not.toHaveBeenCalled();
    expect((stage.findOne('Transformer') as Konva.Transformer).resizeEnabled()).toBe(false);
  });
});

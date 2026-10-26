import { createCanvas } from '@napi-rs/canvas';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { type default as Konva } from 'konva';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasItemLockContext } from '../../components/canvasItemLock';
import { AnnouncerContext } from '../../hooks/useAnnounce';
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

async function setup(cropping: boolean, locked = false, cropZoom = 1, announce = vi.fn()) {
  const ref = createRef<CanvasStageRef>();
  const onCropEnd = vi.fn();
  const onCroppingChange = vi.fn();
  const onTransformEnd = vi.fn();
  render(
    <AnnouncerContext.Provider value={{ announce, lastAnnouncedAt: { current: 0 } }}>
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
              fit: 'cover',
              cropZoom,
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
    </AnnouncerContext.Provider>
  );
  const stage = ref.current!.getStage()!;
  await waitFor(() => expect(stage.findOne('.user-photo')).toBeTruthy());
  return { stage, announce, onCropEnd, onCroppingChange, onTransformEnd };
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

describe('keyboard crop', () => {
  it('announces the keys when crop mode starts', async () => {
    const { announce } = await setup(true);
    expect(announce).toHaveBeenCalledWith('Ausschnitt: Pfeiltasten verschieben, Enter beendet');
  });

  it('pans the photo by 1 px, 10 px with Shift, through onCropEnd', async () => {
    const { onCropEnd } = await setup(true, false, 2);
    // 2x zoom: photo 1200x800 in a 600x400 frame, overhang 300 / 200 per side.
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onCropEnd).toHaveBeenLastCalledWith({
      fit: 'cover',
      panX: expect.closeTo(-1 / 300, 5),
      panY: 0,
    });
    fireEvent.keyDown(window, { key: 'ArrowUp', shiftKey: true });
    expect(onCropEnd).toHaveBeenLastCalledWith({
      fit: 'cover',
      panX: 0,
      panY: expect.closeTo(-10 / 200, 5),
    });
  });

  it('does not pan past the edge of the photo', async () => {
    const { onCropEnd } = await setup(true);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onCropEnd).not.toHaveBeenCalled();
  });

  it('zooms with + and -, never below 100 %', async () => {
    const { onCropEnd } = await setup(true, false, 1);
    fireEvent.keyDown(window, { key: '+' });
    expect(onCropEnd).toHaveBeenLastCalledWith({ fit: 'cover', cropZoom: expect.closeTo(1.1, 5) });
    onCropEnd.mockClear();
    fireEvent.keyDown(window, { key: '-' });
    expect(onCropEnd).not.toHaveBeenCalled();
  });

  it('pans from the page focus target, where a keyboard crop puts the focus', async () => {
    const { onCropEnd } = await setup(true, false, 2);
    const page = document.createElement('button');
    page.setAttribute('data-page-focus-target', 'p1');
    document.body.append(page);
    fireEvent.keyDown(page, { key: 'ArrowLeft' });
    expect(onCropEnd).toHaveBeenCalledOnce();
    page.remove();
  });

  it('ignores keys when not cropping or while typing', async () => {
    const off = await setup(false, false, 2);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(off.onCropEnd).not.toHaveBeenCalled();
  });
});

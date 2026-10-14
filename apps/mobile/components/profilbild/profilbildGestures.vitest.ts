import { PROFILBILD_SIZE } from '@gruenerator/shared/profilbild';
import { type SkImage } from '@shopify/react-native-skia';
import { describe, expect, it, vi } from 'vitest';

import { roundModel } from '../../hooks/profilbild/gestureMath';

import {
  createProfilbildGestureController,
  nextStickerUid,
  type ProfilbildEditorProps,
} from './profilbildGestures';
import { initialModel, type ProfilbildModel } from './sceneModel';

// View and canvas coordinates coincide at this size.
const VIEW = PROFILBILD_SIZE;
const STICKER = { x: 200, y: 200 };

function setup(selected: string | null = null) {
  const model: ProfilbildModel = {
    ...initialModel({ width: 100, height: 100 }, false),
    stickers: [
      {
        uid: 's1',
        id: 'teamgruen',
        src: 'sonnenblume',
        ...STICKER,
        width: 100,
        height: 100,
        rotation: 0,
      },
    ],
  };
  const io = { setDraft: vi.fn(), setGuides: vi.fn(), haptic: vi.fn() };
  const props: ProfilbildEditorProps = {
    model,
    onChange: vi.fn(),
    person: { width: () => 100, height: () => 100 } as unknown as SkImage,
    images: {} as ProfilbildEditorProps['images'],
    isAustria: false,
    viewSize: VIEW,
    selected,
    onSelect: vi.fn(),
  };
  const controller = createProfilbildGestureController(io);
  controller.sync(props, selected);
  return { io, props, model, h: controller.handlers };
}

const lastDraft = (io: { setDraft: ReturnType<typeof vi.fn> }) =>
  io.setDraft.mock.calls.at(-1)?.[0] as ProfilbildModel | null;

describe('createProfilbildGestureController', () => {
  it('drags a sticker and commits the rounded model on release', () => {
    const { io, props, h } = setup();

    h.panBegin(STICKER);
    h.panStart();
    expect(props.onSelect).toHaveBeenCalledWith('s1');
    h.panUpdate({ translationX: 10, translationY: 0 });

    const next = lastDraft(io);
    expect(next?.stickers[0]).toMatchObject({ uid: 's1', x: 210, y: 200 });
    expect(props.onChange).not.toHaveBeenCalled();

    h.end();
    expect(props.onChange).toHaveBeenCalledTimes(1);
    expect(props.onChange).toHaveBeenCalledWith(roundModel(next!));
    expect(lastDraft(io)).toBeNull();
  });

  it('commits once, at the last finger up, when pan and pinch run together', () => {
    const { io, props, h } = setup();

    h.panBegin(STICKER);
    h.panStart();
    h.pinchStart({ focalX: STICKER.x, focalY: STICKER.y });
    h.panUpdate({ translationX: 10, translationY: 0 });
    h.pinchUpdate({ scale: 1.5 });
    const next = lastDraft(io);

    h.end();
    expect(props.onChange).not.toHaveBeenCalled();
    expect(io.setDraft).not.toHaveBeenLastCalledWith(null);

    h.end();
    expect(props.onChange).toHaveBeenCalledTimes(1);
    expect(props.onChange).toHaveBeenCalledWith(roundModel(next!));
    expect(lastDraft(io)).toBeNull();
  });

  it('deselects on a tap on empty space', () => {
    const { props, h } = setup('s1');

    h.tapEnd({ x: 1000, y: 40 }, true);
    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it('ticks once and shows the guide when a move snaps to the centre', () => {
    const { io, h } = setup('s1');

    h.panBegin(STICKER);
    h.panStart();
    h.panUpdate({ translationX: PROFILBILD_SIZE / 2 - STICKER.x, translationY: 0 });
    expect(io.haptic).toHaveBeenCalledTimes(1);
    expect(io.setGuides).toHaveBeenCalledTimes(1);
    expect(io.setGuides).toHaveBeenCalledWith({ x: PROFILBILD_SIZE / 2, y: null });

    h.panUpdate({ translationX: PROFILBILD_SIZE / 2 - STICKER.x, translationY: 0 });
    expect(io.haptic).toHaveBeenCalledTimes(1);
    expect(io.setGuides).toHaveBeenCalledTimes(1);
  });
});

describe('nextStickerUid', () => {
  it('numbers uids per app session', () => {
    const a = nextStickerUid('herz');
    const b = nextStickerUid('herz');
    expect(a).toMatch(/^herz-\d+$/);
    expect(Number(b.split('-')[1])).toBe(Number(a.split('-')[1]) + 1);
  });
});

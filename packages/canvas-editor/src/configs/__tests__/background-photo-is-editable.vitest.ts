import { beforeAll, describe, expect, it } from 'vitest';

import { BACKGROUND_IMAGE_NODE_ID } from '../../utils/printImageInfo';
import { loadCanvasConfig } from '../configLoader';

/**
 * Every template that draws a background photo offers "Bearbeiten" for it in
 * the context bar. The panel behind it only has something to write with when
 * the template's actions carry `updateBackgroundImageAdjustments`, and the
 * section only shows when it gets them. A template without both would open an
 * empty panel.
 */

type CanvasConfigType = Parameters<typeof loadCanvasConfig>[0];

const TEMPLATES: CanvasConfigType[] = [
  'veranstaltung',
  'dreizeilen',
  'zitat',
  'info',
  'slider',
  'freeform',
  'zitat-at',
  'dreizeilen-overlay-at',
  'info-at',
  'freeform-at',
  'slider-at',
];

describe.each(TEMPLATES)('%s: the background photo has a Bearbeiten panel', (type) => {
  let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
  beforeAll(async () => {
    config = await loadCanvasConfig(type);
  }, 120_000);

  it('draws a background photo', () => {
    expect(config.elements.some((e) => e.id === BACKGROUND_IMAGE_NODE_ID)).toBe(true);
  });

  it('hands the panel the photo and a writer that reaches the state', () => {
    let state: Record<string, unknown> = {
      ...config.createInitialState({}),
      currentImageSrc: 'https://example.org/foto.jpg',
    };
    const setState = (next: unknown) => {
      state =
        typeof next === 'function'
          ? (next as (s: typeof state) => typeof state)(state)
          : (next as typeof state);
    };
    const noop = () => {};
    const actions = config.createActions(() => state as never, setState as never, noop, noop, {});

    const props = config.sections['image-adjust']!.propsFactory(state as never, actions, {
      selectedElement: BACKGROUND_IMAGE_NODE_ID,
    }) as { backgroundPhoto: { onUpdate: (p: { vignette: number }) => void } | null };
    expect(props.backgroundPhoto, `${type}: no background photo in the panel`).not.toBeNull();

    props.backgroundPhoto!.onUpdate({ vignette: 0.5 });
    expect(state.backgroundImageAdjustments).toEqual({ vignette: 0.5 });
  });
});

describe.each(TEMPLATES)('%s: a new background photo starts unstraightened', (type) => {
  let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
  beforeAll(async () => {
    config = await loadCanvasConfig(type);
  }, 120_000);

  const replacePhoto = (start: Record<string, unknown>) => {
    let state: Record<string, unknown> = { ...config.createInitialState({}), ...start };
    const setState = (next: unknown) => {
      state =
        typeof next === 'function'
          ? (next as (s: typeof state) => typeof state)(state)
          : { ...state, ...(next as typeof state) };
    };
    const noop = () => {};
    const actions = config.createActions(() => state as never, setState as never, noop, noop, {});
    const file = new File(['x'], 'neu.jpg', { type: 'image/jpeg' });
    const background = config.background?.(state as never, actions);
    expect(background?.onImageChange, `${type}: no photo door`).toBeTypeOf('function');
    background!.onImageChange(file, 'https://example.org/neu.jpg', null);
    return state;
  };

  it('resets a stored angle to 0', () => {
    const state = replacePhoto({
      currentImageSrc: 'https://example.org/alt.jpg',
      backgroundImageRotation: 20,
    });
    expect(state.backgroundImageRotation).toBe(0);
  });

  it('adds no angle where none was stored', () => {
    const state = replacePhoto({ currentImageSrc: 'https://example.org/alt.jpg' });
    expect('backgroundImageRotation' in state).toBe(false);
  });
});

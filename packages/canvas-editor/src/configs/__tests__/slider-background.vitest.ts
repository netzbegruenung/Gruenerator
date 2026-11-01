import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { beforeAll, describe, expect, it } from 'vitest';

import type { StockImageAttribution } from '@ggraphic/editor/common/imageSourceTypes';
import type { BackgroundControls, ImageElementConfig } from '@ggraphic/editor/configs/types';

/**
 * The slider's background controls (context bar): the scheme swatches, the
 * photo, zoom and lock. Its photo pick, credit and scheme changes each used to
 * snapshot the render-time state — undo landed on a mix.
 *
 * Driven with the stale `getState` GenericCanvas hands actions, so a history
 * entry only matches the result when the action snapshots what it produced.
 */

type State = Record<string, unknown> & {
  colorScheme: string;
  backgroundColor: string;
  currentImageSrc?: string;
  imageAttribution: StockImageAttribution | null;
  imageScale?: number;
};

const PHOTO = 'https://example.org/api/share/abc/download';
const OTHER = 'https://example.org/api/share/def/download';
const CREDIT = {
  photographer: 'P',
  profileUrl: 'https://u',
  photoUrl: 'https://p',
} as unknown as StockImageAttribution;

describe.each(['slider', 'slider-at'] as const)('%s background picker', (id) => {
  let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
  beforeAll(async () => {
    config = await loadCanvasConfig(id);
  }, 120_000);

  const initial = (props: Record<string, unknown>) => config.createInitialState(props) as State;

  const harness = (start: State) => {
    let state = start;
    const history: State[] = [];
    const debounced: State[] = [];
    const actions = config.createActions(
      () => start,
      (partial) => {
        state =
          typeof partial === 'function' ? (partial(state) as State) : { ...state, ...partial };
      },
      (s) => history.push(s as State),
      (s) => debounced.push(s as State),
      {}
    );
    const props = config.background!(start, actions) as BackgroundControls;
    return { props, history, debounced, current: () => state };
  };

  it('offers the scheme swatches as the background colours', () => {
    const { props } = harness(initial({}));
    expect(props.colors?.length).toBe(2);
    expect(props.currentColor).toBe(initial({}).backgroundColor);
  });

  it('a swatch switches the scheme, as one history step', () => {
    const start = initial({});
    const { props, history, current } = harness(start);
    const target = props.colors!.find((c) => c.color !== start.backgroundColor)!;

    props.onColorChange!(target.color);

    expect(current().colorScheme).toBe(target.id);
    expect(current().backgroundColor).toBe(target.color);
    expect(history).toEqual([current()]);
  });

  it('a photo pick is one history step', () => {
    const { props, history, current } = harness(initial({}));

    props.onImageChange!(null, PHOTO, null);

    expect(current().currentImageSrc).toBe(PHOTO);
    expect(history).toEqual([current()]);
  });

  it('a pick without a credit drops the previous photo’s credit', () => {
    const { props, current } = harness(
      initial({ currentImageSrc: PHOTO, imageAttribution: CREDIT })
    );
    props.onImageChange!(null, OTHER, null);
    expect(current().currentImageSrc).toBe(OTHER);
    expect(current().imageAttribution).toBeNull();
  });

  it('removing the photo clears its credit in the same step', () => {
    const { props, history, current } = harness(
      initial({ currentImageSrc: PHOTO, imageAttribution: CREDIT })
    );

    props.onImageChange!(null, undefined, null);

    expect(current().currentImageSrc || null).toBeNull();
    expect(current().imageAttribution).toBeNull();
    expect(history).toEqual([current()]);
  });

  it('offers zoom only while a photo is shown', () => {
    const without = harness(initial({})).props;
    expect(without.onScaleChange).toBeUndefined();

    const withPhoto = harness(initial({ currentImageSrc: PHOTO, imageScale: 1.4 })).props;
    expect(withPhoto.currentImageSrc).toBe(PHOTO);
    expect(withPhoto.scale).toBe(1.4);
    expect(withPhoto.onScaleChange).toBeTypeOf('function');
  });

  it('zoom lands in history (debounced) with the new scale', () => {
    const { props, debounced, current } = harness(initial({ currentImageSrc: PHOTO }));
    props.onScaleChange!(1.8);
    expect(current().imageScale).toBe(1.8);
    expect(debounced.at(-1)?.imageScale).toBe(1.8);
  });

  it('the photo has zoom handles and keeps the sidebar as it is when selected', () => {
    const photo = config.elements.find((e) => e.id === 'background-image') as ImageElementConfig;
    expect(photo.transformable).toBe(true);
    expect(photo.scaleKey).toBe('imageScale');
    expect(config.getAutoSwitchTab?.('background-image')).toBeNull();
  });
});

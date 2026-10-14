import { beforeAll, describe, expect, it } from 'vitest';

import { ImageBackgroundSection } from '../../sidebar';
import { loadCanvasConfig } from '../configLoader';

import type { StockImageAttribution } from '../../common/imageSourceTypes';
import type { ImageBackgroundSectionProps } from '../../sidebar/sections/ImageBackgroundSection';
import type { ImageElementConfig } from '../types';

/**
 * The slider used the old colour-only BackgroundSection: no library, no own
 * upload, no zoom or lock, and its photo pick, credit and scheme changes each
 * snapshotted the render-time state — undo landed on a mix.
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
  isBackgroundLocked?: boolean;
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
    const props = config.sections.background.propsFactory(
      start,
      actions,
      undefined
    ) as ImageBackgroundSectionProps;
    return { props, history, debounced, current: () => state };
  };

  it('uses the image picker with the scheme swatches as its colour tab', () => {
    expect(config.sections.background.component).toBe(ImageBackgroundSection);
    const { props } = harness(initial({}));
    expect(props.backgroundColors?.length).toBe(2);
    expect(props.backgroundColor).toBe(initial({}).backgroundColor);
  });

  it('a swatch switches the scheme, as one history step', () => {
    const start = initial({});
    const { props, history, current } = harness(start);
    const target = props.backgroundColors!.find((c) => c.color !== start.backgroundColor)!;

    props.onBackgroundColorChange!(target.color);

    expect(current().colorScheme).toBe(target.id);
    expect(current().backgroundColor).toBe(target.color);
    expect(history).toEqual([current()]);
  });

  it('a photo pick sets photo and credit together, as one history step', () => {
    const { props, history, current } = harness(initial({}));

    props.onImageChange(null, PHOTO, CREDIT);

    expect(current().currentImageSrc).toBe(PHOTO);
    expect(current().imageAttribution).toBe(CREDIT);
    expect(history).toEqual([current()]);
  });

  it('a pick without a credit drops the previous photo’s credit', () => {
    const { props, current } = harness(
      initial({ currentImageSrc: PHOTO, imageAttribution: CREDIT })
    );
    props.onImageChange(null, OTHER, null);
    expect(current().currentImageSrc).toBe(OTHER);
    expect(current().imageAttribution).toBeNull();
  });

  it('removing the photo clears its credit in the same step', () => {
    const { props, history, current } = harness(
      initial({ currentImageSrc: PHOTO, imageAttribution: CREDIT })
    );

    props.onImageChange(null, undefined, null);

    expect(current().currentImageSrc || null).toBeNull();
    expect(current().imageAttribution).toBeNull();
    expect(history).toEqual([current()]);
  });

  it('offers zoom and lock only while a photo is shown', () => {
    const without = harness(initial({})).props;
    expect(without.onScaleChange).toBeUndefined();
    expect(without.onToggleLock).toBeUndefined();

    expect(without.initialSubsection).toBe('background-color');

    const withPhoto = harness(initial({ currentImageSrc: PHOTO, imageScale: 1.4 })).props;
    expect(withPhoto.initialSubsection).toBe('image-search');
    expect(withPhoto.scale).toBe(1.4);
    expect(withPhoto.onScaleChange).toBeTypeOf('function');
    expect(withPhoto.onToggleLock).toBeTypeOf('function');
  });

  it('zoom lands in history (debounced) with the new scale', () => {
    const { props, debounced, current } = harness(initial({ currentImageSrc: PHOTO }));
    props.onScaleChange!(1.8);
    expect(current().imageScale).toBe(1.8);
    expect(debounced.at(-1)?.imageScale).toBe(1.8);
  });

  it('the lock toggles and lands in history', () => {
    const { props, history, current } = harness(initial({ currentImageSrc: PHOTO }));
    props.onToggleLock!();
    expect(current().isBackgroundLocked).toBe(true);
    expect(history).toEqual([current()]);
  });

  it('the photo has zoom handles and opens the picker when selected', () => {
    const photo = config.elements.find((e) => e.id === 'background-image') as ImageElementConfig;
    expect(photo.transformable).toBe(true);
    expect(photo.scaleKey).toBe('imageScale');
    expect(config.getAutoSwitchTab?.('background-image')).toBe('background');
  });
});

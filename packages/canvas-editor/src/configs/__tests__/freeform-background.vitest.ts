import { SHAREPIC_LOCALE_COLORS } from '@gruenerator/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { applyOperation, type CanvasAiActionsBase } from '../../ai/applyOperation';
import { getBrandTheme } from '../../brand/theme';
import { SHAREPIC_COLOR_HEX } from '../../composer/composeSharepic';
import { ImageBackgroundSection } from '../../sidebar';
import { createShape, type ShapeInstance } from '../../utils/shapes';
import { loadCanvasConfig } from '../configLoader';

import type { TemplateAiCapabilities } from '../../ai/types';
import type { StockImageAttribution } from '../../common/imageSourceTypes';
import type { ImageBackgroundSectionProps } from '../../sidebar/sections/ImageBackgroundSection';

/**
 * Freeform shows EITHER the photo OR the colour plane (`backgroundMode`). A
 * sharepic from the free-text creator opens in image mode with a stock photo;
 * its picker used to show no photo and "Tanne" as selected, and removing the
 * photo left the mode on 'image' — a blank canvas.
 *
 * The actions are driven for real, with the stale `getState` GenericCanvas
 * hands them (its render-time state): each user intent must be ONE action
 * whose history snapshot is the state it produces, or undo restores a mix.
 */

type State = Record<string, unknown> & {
  backgroundMode: 'color' | 'image';
  backgroundColor: string;
  currentImageSrc?: string;
  hasBackgroundImage: boolean;
  imageAttribution: StockImageAttribution | null;
  shapeInstances: ShapeInstance[];
  layerOrder: string[];
  stashedComposerPlanes: { shape: ShapeInstance; index: number }[];
};

const PHOTO = 'https://example.org/api/share/abc/download';
const AT = getBrandTheme('de-AT');
const CREDIT = {
  photographer: 'P',
  profileUrl: 'https://u',
  photoUrl: 'https://p',
} as unknown as StockImageAttribution;

const planeShape = (id: string): ShapeInstance => ({
  ...createShape('rect', 540, 540, '#005538', '#005538'),
  id,
  locked: true,
});
const userShape = { ...createShape('rect', 100, 100, '#ff0000', '#ff0000'), id: 'shape-own' };

describe.each(['freeform', 'freeform-at'] as const)('%s background picker', (id) => {
  let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
  beforeAll(async () => {
    config = await loadCanvasConfig(id);
  }, 120_000);

  const initial = (props: Record<string, unknown>) => config.createInitialState(props) as State;

  /** Real actions, stale getState, recorded history. */
  const harness = (start: State) => {
    let state = start;
    const history: State[] = [];
    const actions = config.createActions(
      () => start,
      (partial) => {
        state =
          typeof partial === 'function' ? (partial(state) as State) : { ...state, ...partial };
      },
      (s) => history.push(s as State),
      (s) => history.push(s as State),
      {}
    );
    const props = config.sections.background.propsFactory(
      start,
      actions,
      undefined
    ) as ImageBackgroundSectionProps;
    return { props, actions, history, current: () => state };
  };

  const composed = (props: Record<string, unknown>) =>
    initial({
      ...props,
      shapeInstances: [
        planeShape('sc-bg'),
        planeShape('sc-panel'),
        planeShape('sc-scrim'),
        planeShape('sc-tint'),
        userShape,
      ],
      layerOrder: ['sc-bg', 'sc-panel', 'sc-scrim', 'sc-tint', 'shape-own'],
    });

  const ids = (s: State) => s.shapeInstances.map((shape) => shape.id);

  it('uses the image picker with a colour tab', () => {
    expect(config.sections.background.component).toBe(ImageBackgroundSection);
    const { props } = harness(initial({}));
    expect(props.backgroundColors?.length).toBeGreaterThan(0);
    expect(props.onBackgroundColorChange).toBeTypeOf('function');
  });

  it('in image mode shows the photo as current, selects no colour and offers zoom', () => {
    const { props } = harness(
      initial({ backgroundMode: 'image', currentImageSrc: PHOTO, imageScale: 1.4 })
    );
    expect(props.currentImageSrc).toBe(PHOTO);
    const selectable = props.backgroundColors?.map((c) => c.color) ?? [];
    expect(selectable).not.toContain(props.backgroundColor);
    expect(props.initialSubsection).toBe('image-search');
    expect(props.onActivateImage).toBeUndefined();
    expect(props.scale).toBe(1.4);
    expect(props.onScaleChange).toBeTypeOf('function');
  });

  it('in colour mode selects the plane colour, pins the replaced photo, no zoom', () => {
    const state = initial({ backgroundMode: 'color', currentImageSrc: PHOTO });
    const { props } = harness(state);
    expect(props.currentImageSrc).toBe(PHOTO);
    expect(props.backgroundColor).toBe(state.backgroundColor);
    expect(props.initialSubsection).toBe('background-color');
    expect(props.onActivateImage).toBeTypeOf('function');
    expect(props.scale).toBeUndefined();
    expect(props.onScaleChange).toBeUndefined();
  });

  it('in colour mode without a photo pins nothing', () => {
    const { props } = harness(initial({ backgroundMode: 'color' }));
    expect(props.currentImageSrc).toBeUndefined();
    expect(props.onActivateImage).toBeUndefined();
  });

  it('tapping the replaced photo brings it back untouched, in one history step', () => {
    const start = initial({
      backgroundMode: 'color',
      currentImageSrc: PHOTO,
      imageAttribution: CREDIT,
      imageScale: 1.7,
      imageOffset: { x: 12, y: -30 },
    });
    const { props, history, current } = harness(start);
    props.onActivateImage?.();
    const after = current();
    expect(after).toMatchObject({
      backgroundMode: 'image',
      currentImageSrc: PHOTO,
      imageAttribution: CREDIT,
      imageScale: 1.7,
      imageOffset: { x: 12, y: -30 },
    });
    expect(history).toEqual([after]);
  });

  it('removing the photo falls back to the colour plane, in one history step', () => {
    const start = initial({
      backgroundMode: 'image',
      currentImageSrc: PHOTO,
      imageAttribution: CREDIT,
    });
    const { props, history, current } = harness(start);
    props.onImageChange(null, undefined, null);
    const after = current();
    expect(after).toMatchObject({
      backgroundMode: 'color',
      currentImageSrc: undefined,
      hasBackgroundImage: false,
      imageAttribution: null,
    });
    // Undo restores the entry before this one; this one must be the real result.
    expect(history).toEqual([after]);
  });

  it('choosing a photo switches to image mode with its credit, in one history step', () => {
    const { props, history, current } = harness(initial({}));
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    props.onImageChange(file, PHOTO, CREDIT);
    const after = current();
    expect(after).toMatchObject({
      backgroundMode: 'image',
      currentImageSrc: PHOTO,
      hasBackgroundImage: true,
      imageAttribution: CREDIT,
    });
    expect(history).toEqual([after]);
  });

  it('choosing a colour on a photo switches to colour mode, in one history step', () => {
    const start = initial({ backgroundMode: 'image', currentImageSrc: PHOTO });
    const { props, history, current } = harness(start);
    props.onBackgroundColorChange?.('#123456');
    const after = current();
    expect(after).toMatchObject({ backgroundMode: 'color', backgroundColor: '#123456' });
    // The photo stays in state, one tap away.
    expect(after.currentImageSrc).toBe(PHOTO);
    expect(history).toEqual([after]);
  });

  it('choosing a colour drops every composer plane and keeps own shapes', () => {
    const { props, history, current } = harness(
      composed({ backgroundMode: 'color', backgroundColor: '#005538' })
    );
    props.onBackgroundColorChange?.('#123456');
    const after = current();
    expect(ids(after)).toEqual(['shape-own']);
    expect(after.layerOrder).toEqual(['shape-own']);
    expect(history).toEqual([after]);
  });

  it('choosing a photo drops only the opaque gradient that would cover it', () => {
    const { props, current } = harness(composed({ backgroundMode: 'color' }));
    props.onImageChange(new File(['x'], 'a.jpg'), PHOTO, null);
    expect(ids(current())).toEqual(['sc-panel', 'sc-scrim', 'sc-tint', 'shape-own']);
    expect(current().layerOrder).toEqual(['sc-panel', 'sc-scrim', 'sc-tint', 'shape-own']);
  });

  it('tapping the replaced photo brings back the composed look without the gradient', () => {
    const colour = harness(composed({ backgroundMode: 'image', currentImageSrc: PHOTO }));
    colour.props.onBackgroundColorChange?.('#123456');
    const inColour = colour.current();
    expect(ids(inColour)).toEqual(['shape-own']);

    const back = harness(inColour);
    back.props.onActivateImage?.();
    const after = back.current();
    expect(after.backgroundMode).toBe('image');
    expect(after.layerOrder).toEqual(['sc-panel', 'sc-scrim', 'sc-tint', 'shape-own']);
    expect(ids(after).sort()).toEqual(['sc-panel', 'sc-scrim', 'sc-tint', 'shape-own']);
    expect(after.stashedComposerPlanes).toEqual([]);
    expect(back.history).toEqual([after]);
  });

  it('a new photo after a colour also gets the composed look back', () => {
    const colour = harness(composed({ backgroundMode: 'image', currentImageSrc: PHOTO }));
    colour.props.onBackgroundColorChange?.('#123456');
    const next = harness(colour.current());
    next.props.onImageChange(new File(['x'], 'b.jpg'), PHOTO, null);
    expect(next.current().layerOrder).toEqual(['sc-panel', 'sc-scrim', 'sc-tint', 'shape-own']);
  });

  it('switching colours keeps the stash', () => {
    const first = harness(composed({ backgroundMode: 'image', currentImageSrc: PHOTO }));
    first.props.onBackgroundColorChange?.('#123456');
    const second = harness(first.current());
    second.props.onBackgroundColorChange?.('#654321');
    expect(second.current().stashedComposerPlanes.map((p) => p.shape.id)).toEqual([
      'sc-bg',
      'sc-panel',
      'sc-scrim',
      'sc-tint',
    ]);
  });

  it('an AI set-background-color shows the colour like the picker does', () => {
    const start = composed({ backgroundMode: 'image', currentImageSrc: PHOTO });
    const { actions, history, current } = harness(start);
    const result = applyOperation(
      { kind: 'set-background-color', color: '#123456' },
      actions as CanvasAiActionsBase,
      () => start,
      config.ai as TemplateAiCapabilities<State, CanvasAiActionsBase>
    );
    expect(result.ok).toBe(true);
    const after = current();
    expect(after).toMatchObject({ backgroundMode: 'color', backgroundColor: '#123456' });
    expect(ids(after)).toEqual(['shape-own']);
    expect(history).toEqual([after]);
  });

  it('offers every colour the composer seeds for its locale', () => {
    const { props } = harness(initial({}));
    const palette = (props.backgroundColors ?? []).map((c) => c.color.toLowerCase());
    const locale = id === 'freeform-at' ? 'de-AT' : 'de-DE';
    for (const name of SHAREPIC_LOCALE_COLORS[locale]) {
      expect(palette, name).toContain(SHAREPIC_COLOR_HEX[name].toLowerCase());
    }
  });

  it('offers its own palette', () => {
    const { props } = harness(initial({}));
    const colors = props.backgroundColors?.map((c) => c.color) ?? [];
    if (id === 'freeform-at') {
      expect(colors).toContain(AT.colors.primary);
      expect(colors).toContain(AT.colors.accent);
    } else {
      expect(colors).not.toContain(AT.colors.primary);
    }
  });
});

describe('removing a photo clears its credit in the photo templates', () => {
  it.each(['info', 'zitat', 'slider', 'veranstaltung'] as const)(
    '%s',
    async (id) => {
      const config = await loadCanvasConfig(id);
      let state = config.createInitialState({
        currentImageSrc: PHOTO,
        imageAttribution: CREDIT,
      }) as Record<string, unknown>;
      const start = state;
      const actions = config.createActions(
        () => start,
        (partial) => {
          state =
            typeof partial === 'function'
              ? (partial(state) as Record<string, unknown>)
              : { ...state, ...partial };
        },
        () => {},
        () => {},
        {}
      );
      // ImageBackgroundSection on most, BackgroundSection on the slider; both
      // hand the remove through onImageChange.
      const tabId = ['background', 'image', 'image-background'].find((t) => t in config.sections);
      const props = config.sections[tabId!].propsFactory(
        start,
        actions,
        undefined
      ) as ImageBackgroundSectionProps;
      props.onImageChange(null, undefined, null);
      expect(state.imageAttribution ?? null).toBeNull();
      expect(state.currentImageSrc || null).toBeNull();
    },
    60_000
  );
});

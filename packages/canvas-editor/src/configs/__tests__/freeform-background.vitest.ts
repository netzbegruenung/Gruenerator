import { beforeAll, describe, expect, it } from 'vitest';

import { getBrandTheme } from '../../brand/theme';
import { ImageBackgroundSection } from '../../sidebar';
import { loadCanvasConfig } from '../configLoader';

import type { ImageBackgroundSectionProps } from '../../sidebar/sections/ImageBackgroundSection';

/**
 * Freeform shows EITHER the photo OR the colour plane (`backgroundMode`). A
 * sharepic from the free-text creator opens in image mode with a stock photo;
 * its picker used to show no photo and "Tanne" as selected, and removing the
 * photo left the mode on 'image' — a blank canvas.
 */

type Call = [string, ...unknown[]];

function recordingActions() {
  const calls: Call[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) =>
      calls.push([name, ...args]);
  return {
    calls,
    actions: {
      setBackgroundMode: record('setBackgroundMode'),
      setBackgroundColor: record('setBackgroundColor'),
      setCurrentImageSrc: record('setCurrentImageSrc'),
      setImageScale: record('setImageScale'),
    },
  };
}

const PHOTO = 'https://example.org/api/share/abc/download';
const AT = getBrandTheme('de-AT');

describe.each(['freeform', 'freeform-at'] as const)('%s background picker', (id) => {
  let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
  beforeAll(async () => {
    config = await loadCanvasConfig(id);
  }, 120_000);

  const initial = (props: Record<string, unknown>) =>
    config.createInitialState(props) as Record<string, unknown>;

  const propsFor = (state: Record<string, unknown>) => {
    const { actions, calls } = recordingActions();
    const props = config.sections.background.propsFactory(
      state,
      actions,
      undefined
    ) as ImageBackgroundSectionProps;
    return { props, calls };
  };

  it('uses the image picker with a colour tab', () => {
    expect(config.sections.background.component).toBe(ImageBackgroundSection);
    const { props } = propsFor(initial({}));
    expect(props.backgroundColors?.length).toBeGreaterThan(0);
    expect(props.onBackgroundColorChange).toBeTypeOf('function');
    expect(props.onScaleChange).toBeTypeOf('function');
  });

  it('in image mode shows the photo as current and selects no colour', () => {
    const state = initial({ backgroundMode: 'image', currentImageSrc: PHOTO });
    const { props } = propsFor(state);
    expect(props.currentImageSrc).toBe(PHOTO);
    const selectable = props.backgroundColors?.map((c) => c.color) ?? [];
    expect(selectable).not.toContain(props.backgroundColor);
    expect(props.initialSubsection).toBe('image-search');
    expect(props.onActivateImage).toBeUndefined();
  });

  it('in colour mode selects the plane colour and keeps the replaced photo one tap away', () => {
    const state = initial({ backgroundMode: 'color', currentImageSrc: PHOTO });
    const { props, calls } = propsFor(state);
    expect(props.currentImageSrc).toBe(PHOTO);
    expect(props.backgroundColor).toBe(state.backgroundColor);
    expect(props.initialSubsection).toBe('background-color');
    expect(props.onActivateImage).toBeTypeOf('function');

    props.onActivateImage?.();
    // Only the mode flips: src, attribution, offset and zoom stay as they were.
    expect(calls).toEqual([['setBackgroundMode', 'image']]);
  });

  it('in colour mode without a photo pins nothing', () => {
    const { props } = propsFor(initial({ backgroundMode: 'color' }));
    expect(props.currentImageSrc).toBeUndefined();
    expect(props.onActivateImage).toBeUndefined();
  });

  it('removing the replaced photo in colour mode clears it', () => {
    const state = initial({ backgroundMode: 'color', currentImageSrc: PHOTO });
    const { props, calls } = propsFor(state);
    props.onImageChange(null);
    expect(calls).toContainEqual(['setCurrentImageSrc', null, undefined, undefined]);
    expect(calls).toContainEqual(['setBackgroundMode', 'color']);
  });

  it('removing the photo falls back to the colour plane', () => {
    const state = initial({ backgroundMode: 'image', currentImageSrc: PHOTO });
    const { props, calls } = propsFor(state);
    props.onImageChange(null);
    expect(calls).toContainEqual(['setCurrentImageSrc', null, undefined, undefined]);
    expect(calls).toContainEqual(['setBackgroundMode', 'color']);
  });

  it('choosing a photo switches to image mode and keeps the attribution', () => {
    const { props, calls } = propsFor(initial({}));
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const attribution = {
      photographer: 'P',
      profileUrl: 'https://u',
      photoUrl: 'https://p',
    } as unknown as Parameters<ImageBackgroundSectionProps['onImageChange']>[2];
    props.onImageChange(file, PHOTO, attribution);
    expect(calls).toContainEqual(['setCurrentImageSrc', file, PHOTO, attribution]);
    expect(calls).toContainEqual(['setBackgroundMode', 'image']);
  });

  it('choosing a colour switches to colour mode', () => {
    const state = initial({ backgroundMode: 'image', currentImageSrc: PHOTO });
    const { props, calls } = propsFor(state);
    props.onBackgroundColorChange?.('#123456');
    expect(calls).toContainEqual(['setBackgroundColor', '#123456']);
    expect(calls).toContainEqual(['setBackgroundMode', 'color']);
  });

  it('zooms through imageScale', () => {
    const state = initial({ imageScale: 1.4 });
    const { props, calls } = propsFor(state);
    expect(props.scale).toBe(1.4);
    props.onScaleChange?.(2);
    expect(calls).toContainEqual(['setImageScale', 2]);
  });

  it('offers its own palette', () => {
    const { props } = propsFor(initial({}));
    const colors = props.backgroundColors?.map((c) => c.color) ?? [];
    if (id === 'freeform-at') {
      expect(colors).toContain(AT.colors.primary);
      expect(colors).toContain(AT.colors.accent);
    } else {
      expect(colors).not.toContain(AT.colors.primary);
    }
  });
});

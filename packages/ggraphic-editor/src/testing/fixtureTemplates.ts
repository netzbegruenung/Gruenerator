// SPDX-License-Identifier: MPL-2.0
/**
 * Neutral test templates for the core's own test lane.
 *
 * The editor ships no templates; a host registers its catalogue. Tests of
 * generic editor behaviour (history, crop, undo, collab write-back, …) still
 * need *a* template to mount a canvas on, so this module registers two
 * invented ones. It is imported by the test files that need it and by nothing
 * else: it is not an entry point of the package (`exports` does not list it),
 * and importing it is what registers the templates.
 *
 * - `fixture-poster`: a colour plane, an optional background photo, one
 *   decoration image and three text lines (`line1`…`line3`).
 * - `fixture-note`: a colour plane and two text fields (`primary`,
 *   `secondary`) — a template whose text lives under other keys.
 *
 * Both carry the full collection state of a canvas (shapes, assets, texts,
 * user images, …) and generic add/update/remove actions for it, so user-placed
 * elements behave as on a real template. Only `brandDefault` colours and
 * invented copy are used.
 */
import { defineTemplate, registerTemplates } from '@ggraphic/editor/templates/registry';

import {
  carryBackgroundAdjustments,
  carryBackgroundRotation,
} from '../configs/factory/carryInstanceState';
import {
  createAssetInstance,
  registerAssetCatalog,
  type CanvasAssetCatalog,
} from '../utils/canvasAssets';
import { createChartInstance } from '../utils/chartUtils';
import { createCircleBadgeInstance } from '../utils/circleBadgeUtils';
import { zoomBackground } from '../utils/coverFit';
import { createFrameInstance, type FrameClipType } from '../utils/frameUtils';
import { createPillBadgeInstance } from '../utils/pillBadgeUtils';
import { createShape, type ShapeType } from '../utils/shapes';
import { straightenResetFor } from '../utils/straighten';
import {
  createUserImageInstanceFromUrl,
  type ElementPlacement,
  type UserImageInstance,
  type UserImagePlacement,
} from '../utils/userImageUtils';

import type { AnyCanvasConfig, FullCanvasConfig } from '../configs/types';
import type { BalkenMode } from '../utils/balkenUtils';
import type { ChartType } from '../utils/chartTypes';
import type { StockImageAttribution } from '@ggraphic/editor/common/imageSourceTypes';

const WIDTH = 1080;
const HEIGHT = 1350;

/** A one-pixel SVG: a decoration the canvas can draw without a file server. */
export const FIXTURE_ORNAMENT_SRC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#808080"/></svg>'
  );

/**
 * A one-entry asset catalogue for tests that place a catalogue graphic. Not
 * registered on import: a test that needs it calls `registerFixtureAssets()`.
 */
export const FIXTURE_INSTANCE_SRC_PREFIX = 'https://example.org/share/';
export const FIXTURE_ASSET_ID = 'fixture-badge';
export const FIXTURE_ASSET_CATALOG: CanvasAssetCatalog = {
  assets: [
    {
      id: FIXTURE_ASSET_ID,
      src: `https://example.org/assets/${FIXTURE_ASSET_ID}.svg`,
      label: 'Fixture badge',
      category: 'decoration',
      tags: ['fixture'],
      audience: 'all',
    },
    {
      id: 'quote-mark',
      src: 'https://example.org/assets/quote-mark.svg',
      label: 'Quote mark',
      category: 'mark',
      tags: ['fixture'],
      audience: 'all',
    },
  ],
  /** A "shop sticker" is an image under this prefix, as a host would store it. */
  isInstanceSrc: (src) => src.startsWith(FIXTURE_INSTANCE_SRC_PREFIX),
};

export function registerFixtureAssets(): void {
  registerAssetCatalog(FIXTURE_ASSET_CATALOG);
}

const FIXTURE_FONT = 'Arial, sans-serif';
const FIXTURE_BACKGROUND = '#808080';
const FIXTURE_INK = '#ffffff';

type State = Record<string, unknown> & {
  assetInstances: { id: string }[];
  shapeInstances: { id: string }[];
  additionalTexts: { id: string }[];
  userImageInstances: UserImageInstance[];
};
type Actions = Record<string, (...args: never[]) => unknown>;

/** The collections a canvas keeps next to its template elements, by action suffix. */
const COLLECTIONS = {
  Asset: 'assetInstances',
  Shape: 'shapeInstances',
  Illustration: 'illustrationInstances',
  AdditionalText: 'additionalTexts',
  PillBadge: 'pillBadgeInstances',
  CircleBadge: 'circleBadgeInstances',
  Balken: 'balkenInstances',
  Frame: 'frameInstances',
  UserImage: 'userImageInstances',
  Chart: 'chartInstances',
} as const;

/** The state every fixture template starts from; `props` overrides any key. */
function baseState(props: Record<string, unknown>) {
  const list = (key: string) => (props[key] as unknown[] | undefined) ?? [];
  return {
    assetInstances: list('assetInstances'),
    shapeInstances: list('shapeInstances'),
    illustrationInstances: list('illustrationInstances'),
    additionalTexts: list('additionalTexts'),
    pillBadgeInstances: list('pillBadgeInstances'),
    circleBadgeInstances: list('circleBadgeInstances'),
    balkenInstances: list('balkenInstances'),
    frameInstances: list('frameInstances'),
    userImageInstances: list('userImageInstances'),
    chartInstances: list('chartInstances'),
    selectedIcons: (props.selectedIcons as string[] | undefined) ?? [],
    iconStates: (props.iconStates as Record<string, unknown> | undefined) ?? {},
    layerOrder: (props.layerOrder as string[] | undefined) ?? [],
    lockedLayerIds: (props.lockedLayerIds as string[] | undefined) ?? [],
    templateRotations: (props.templateRotations as Record<string, number> | undefined) ?? {},
    templateTextAligns: (props.templateTextAligns as Record<string, string> | undefined) ?? {},
    backgroundColor: (props.backgroundColor as string | undefined) ?? FIXTURE_BACKGROUND,
    isDesktop: (props.isDesktop as boolean | undefined) ?? true,
  };
}

/** Add, update and remove for every collection, plus the few adders tests call. */
function collectionActions(
  getState: () => State,
  setState: (updater: (prev: State) => State) => void,
  saveToHistory: (state?: State) => void,
  debouncedSaveToHistory: (state?: State) => void
): Actions {
  const actions: Record<string, unknown> = {};
  for (const [suffix, key] of Object.entries(COLLECTIONS)) {
    actions[`update${suffix}`] = (id: string, partial: object) => {
      setState((prev) => ({
        ...prev,
        [key]: (prev[key] as { id: string }[]).map((item) =>
          item.id === id ? { ...item, ...partial } : item
        ),
      }));
      debouncedSaveToHistory(getState());
    };
    actions[`remove${suffix}`] = (id: string) => {
      setState((prev) => ({
        ...prev,
        [key]: (prev[key] as { id: string }[]).filter((item) => item.id !== id),
      }));
      saveToHistory(getState());
    };
  }
  const append = (key: string, item: unknown) => {
    setState((prev) => ({ ...prev, [key]: [...(prev[key] as unknown[]), item] }));
    saveToHistory(getState());
  };
  actions.addAsset = (assetId: string) =>
    append('assetInstances', createAssetInstance(assetId, WIDTH, HEIGHT));
  actions.addShape = (type: ShapeType, color?: string) =>
    append('shapeInstances', createShape(type, WIDTH / 2, HEIGHT / 2, color ?? FIXTURE_INK));
  actions.addText = () =>
    append('additionalTexts', {
      id: `text-${Date.now()}`,
      text: 'Sample text',
      type: 'body',
      x: 100,
      y: HEIGHT / 2,
      width: 600,
      fontSize: 48,
      fontFamily: FIXTURE_FONT,
      fill: FIXTURE_INK,
    });
  actions.addPillBadge = (preset?: string) =>
    append('pillBadgeInstances', createPillBadgeInstance(preset));
  actions.addCircleBadge = (preset?: string) =>
    append('circleBadgeInstances', createCircleBadgeInstance(preset));
  actions.addChart = (chartType: ChartType) =>
    append('chartInstances', createChartInstance(chartType, WIDTH, HEIGHT));
  actions.addFrame = (clipType: FrameClipType) =>
    append('frameInstances', createFrameInstance(clipType, WIDTH / 2, HEIGHT / 2));
  actions.addBalken = (mode: BalkenMode) =>
    append('balkenInstances', {
      id: `balken-${Date.now()}`,
      mode,
      colorSchemeId: 'fixture',
      widthScale: 1,
      offset: { x: 0, y: 0 },
      scale: 1,
      texts: mode === 'single' ? ['Sample'] : ['One', 'Two', 'Three'],
      rotation: 0,
      opacity: 1,
    });
  actions.addUserImageFromUrl = (url: string, fileName: string, options?: UserImagePlacement) => {
    void createUserImageInstanceFromUrl(url, fileName, WIDTH, HEIGHT, options).then((instance) => {
      setState((prev) => ({ ...prev, userImageInstances: [...prev.userImageInstances, instance] }));
      saveToHistory(getState());
    });
  };
  actions.toggleIcon = (id: string, selected: boolean, _options?: ElementPlacement) => {
    setState((prev) => {
      const icons = (prev.selectedIcons as string[]).filter((i) => i !== id);
      const iconStates = selected
        ? {
            ...(prev.iconStates as object),
            [id]: { x: WIDTH / 2, y: HEIGHT / 2, scale: 1, rotation: 0 },
          }
        : prev.iconStates;
      return { ...prev, selectedIcons: selected ? [...icons, id] : icons, iconStates };
    });
    saveToHistory(getState());
  };
  actions.setBackgroundColor = (color: string) => {
    setState((prev) => ({ ...prev, backgroundColor: color }));
    saveToHistory(getState());
  };
  return actions as Actions;
}

// ── fixture-poster ──────────────────────────────────────────────────────────

const LINE_KEYS = ['line1', 'line2', 'line3'] as const;

const posterConfig: FullCanvasConfig<State, Actions> = {
  id: 'fixture-poster',
  canvas: { width: WIDTH, height: HEIGHT },
  tabs: [],
  sections: {},
  features: { icons: true, shapes: true, illustrations: true },
  fonts: { primary: 'Arial', fontSize: 60, requireFontLoad: true },
  background: (state, actions) => ({
    currentImageSrc: (state.currentImageSrc as string | undefined) || undefined,
    imageAttribution: (state.imageAttribution as StockImageAttribution | null) ?? null,
    onImageChange: (file, url, attribution) =>
      (actions.setCurrentImageSrc as (...args: unknown[]) => void)(file, url, attribution),
    scale: state.imageScale as number,
    onScaleChange: actions.setImageScale as (scale: number) => void,
    currentColor: state.backgroundColor as string,
    onColorChange: actions.setBackgroundColor as (color: string) => void,
  }),
  elements: [
    {
      id: 'background-color',
      type: 'background',
      order: -1,
      x: 0,
      y: 0,
      width: WIDTH,
      height: HEIGHT,
      colorKey: 'backgroundColor',
    },
    {
      id: 'background-image',
      type: 'image',
      order: 0,
      x: 0,
      y: 0,
      width: WIDTH,
      height: HEIGHT,
      srcKey: 'currentImageSrc',
      offsetKey: 'imageOffset',
      scaleKey: 'imageScale',
      draggable: true,
      transformable: true,
      coverFit: true,
      visible: (state) => !!state.currentImageSrc,
      opacity: (state) => (state.backgroundImageOpacity as number | undefined) ?? 1,
      opacityStateKey: 'backgroundImageOpacity',
    },
    {
      id: 'ornament',
      type: 'image',
      order: 1,
      x: (state) => (state.ornamentPos as { x: number } | null)?.x ?? WIDTH - 250,
      y: (state) => (state.ornamentPos as { y: number } | null)?.y ?? HEIGHT - 250,
      width: 200,
      height: 200,
      src: FIXTURE_ORNAMENT_SRC,
      draggable: true,
      transformable: true,
      listening: true,
      positionStateKey: 'ornamentPos',
    },
    ...LINE_KEYS.map((key, index) => ({
      id: `${key}-text`,
      type: 'text' as const,
      order: 2 + index,
      x: 80,
      y: 200 + index * 160,
      width: 920,
      fontSize: 80,
      fontFamily: FIXTURE_FONT,
      fontStyle: 'bold' as const,
      fill: FIXTURE_INK,
      textKey: key,
      editable: true,
      draggable: true,
      transformable: true,
    })),
  ],
  calculateLayout: () => ({}),
  createInitialState: (props) => {
    const lines = Object.fromEntries(
      LINE_KEYS.map((key) => [key, (props[key] as string | undefined) ?? ''])
    );
    return {
      ...baseState(props),
      ...lines,
      ...carryBackgroundAdjustments(props),
      ...carryBackgroundRotation(props),
      ornamentPos: (props.ornamentPos as { x: number; y: number } | null | undefined) ?? null,
      currentImageSrc: props.currentImageSrc as string | undefined,
      backgroundImageFile: (props.backgroundImageFile as File | Blob | null | undefined) ?? null,
      imageOffset: (props.imageOffset as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
      imageScale: (props.imageScale as number | undefined) ?? 1,
      imageAttribution:
        (props.imageAttribution as StockImageAttribution | null | undefined) ?? null,
      hasBackgroundImage: !!props.currentImageSrc,
      backgroundImageOpacity: (props.backgroundImageOpacity as number | undefined) ?? 1,
    } as State;
  },
  createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => {
    const lineActions = Object.fromEntries(
      LINE_KEYS.map((key, index) => [
        `setLine${index + 1}`,
        (text: string) => {
          setState((prev) => ({ ...prev, [key]: text }));
          callbacks[`onLine${index + 1}Change`]?.(text);
          debouncedSaveToHistory(getState());
        },
      ])
    );
    return {
      ...collectionActions(getState, setState, saveToHistory, debouncedSaveToHistory),
      ...lineActions,
      setCurrentImageSrc: (
        file: File | null,
        objectUrl?: string,
        attribution?: StockImageAttribution | null
      ) => {
        const src = file ? objectUrl : undefined;
        const reset = straightenResetFor(getState());
        setState((prev) => ({
          ...prev,
          currentImageSrc: src,
          backgroundImageFile: file,
          imageAttribution: attribution ?? null,
          hasBackgroundImage: !!src,
          ...reset,
        }));
        callbacks.onImageChange?.(file);
        saveToHistory({ ...getState(), currentImageSrc: src, ...reset });
      },
      setImageScale: (scale: number) => {
        const zoom = zoomBackground(
          getState() as { imageOffset?: { x: number; y: number }; imageScale?: number },
          scale,
          { width: WIDTH, height: HEIGHT }
        );
        setState((prev) => ({ ...prev, ...zoom }));
        debouncedSaveToHistory({ ...getState(), ...zoom });
      },
    } as Actions;
  },
};

// ── fixture-note ────────────────────────────────────────────────────────────

const noteConfig: FullCanvasConfig<State, Actions> = {
  id: 'fixture-note',
  canvas: { width: WIDTH, height: HEIGHT },
  tabs: [],
  sections: {},
  features: { icons: true, shapes: true, illustrations: true },
  fonts: { primary: 'Arial', fontSize: 60, requireFontLoad: true },
  elements: [
    {
      id: 'background-color',
      type: 'background',
      order: -1,
      x: 0,
      y: 0,
      width: WIDTH,
      height: HEIGHT,
      colorKey: 'backgroundColor',
    },
    {
      id: 'primary-text',
      type: 'text',
      order: 1,
      x: 80,
      y: 300,
      width: 920,
      fontSize: 72,
      fontFamily: FIXTURE_FONT,
      fill: FIXTURE_INK,
      textKey: 'primary',
      editable: true,
      draggable: true,
      transformable: true,
    },
    {
      id: 'secondary-text',
      type: 'text',
      order: 2,
      x: 80,
      y: 900,
      width: 920,
      fontSize: 40,
      fontFamily: FIXTURE_FONT,
      fill: FIXTURE_INK,
      textKey: 'secondary',
      editable: true,
      draggable: true,
      transformable: true,
    },
  ],
  calculateLayout: () => ({}),
  createInitialState: (props) =>
    ({
      ...baseState(props),
      primary: (props.primary as string | undefined) ?? '',
      secondary: (props.secondary as string | undefined) ?? '',
    }) as State,
  createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => ({
    ...collectionActions(getState, setState, saveToHistory, debouncedSaveToHistory),
    setPrimary: (text: string) => {
      setState((prev) => ({ ...prev, primary: text }));
      callbacks.onPrimaryChange?.(text);
      debouncedSaveToHistory(getState());
    },
    setSecondary: (text: string) => {
      setState((prev) => ({ ...prev, secondary: text }));
      callbacks.onSecondaryChange?.(text);
      debouncedSaveToHistory(getState());
    },
  }),
};

export const FIXTURE_TEMPLATES = [
  defineTemplate({ id: 'fixture-poster', load: async () => posterConfig as AnyCanvasConfig }),
  defineTemplate({ id: 'fixture-note', load: async () => noteConfig as AnyCanvasConfig }),
] as const;

registerTemplates(...FIXTURE_TEMPLATES);

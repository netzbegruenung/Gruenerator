/**
 * Slider Full Canvas Configuration
 *
 * Social media slider template with:
 * - Editable pill badge header
 * - Large headline text
 * - Supporting subtext
 * - Draggable arrow decoration
 * - Two color schemes per brand
 *
 * One factory, two brands: `slider` (Sonnenblume, Sand/Tanne) and
 * `slider-at` (Österreich: Ein-Balken-Logo, Dunkelgrün/Hellgrün, Gotham).
 */

import { HiPhotograph } from 'react-icons/hi';
import { PiFrameCornersFill, PiSquaresFourFill, PiTextAa } from 'react-icons/pi';

import {
  AssetsSection,
  CombinedTextSection,
  FrameSettingsSection,
  ImageBackgroundSection,
} from '../sidebar/sections';
import { recolorIconInstances } from '../utils/iconInstances';
import { createPillBadgeInstance } from '../utils/pillBadgeUtils';
import {
  SLIDER_AT_LOGO,
  SLIDER_AT_STYLE,
  SLIDER_CONFIG,
  SLIDER_DE_STYLE,
  calculateSliderLayout,
  getSliderColors,
  getSliderColorsForState,
  isSliderColorScheme,
} from '../utils/sliderLayout';

import { chatTab, createCommonSectionEntries, toolsTab, uploadsTab } from './commonSections';
import { createBaseActions } from './factory/actionFactories';
import { carryInstanceState } from './factory/carryInstanceState';
import { makeSectionDefiner } from './factory/defineSection';
import { fromLayout } from './factory/layoutAccessors';
import { injectFeatureProps } from './featureInjector';
import { createShareSection } from './shareSection';

import type {
  FullCanvasConfig,
  LayoutResult,
  BackgroundElementConfig,
  RectElementConfig,
  TextElementConfig,
  ImageElementConfig,
  AdditionalText,
} from './types';
import type { TemplateAiCapabilities } from '../ai/types';
import type { ImageBackgroundSectionProps } from '../sidebar/sections/ImageBackgroundSection';
import type { BackgroundColorOption, StockImageAttribution } from '../sidebar/types';
import type { BalkenInstance, BalkenMode } from '../utils/balkenUtils';
import type { AssetInstance } from '../utils/canvasAssets';
import type { CircleBadgeInstance } from '../utils/circleBadgeUtils';
import type { FrameClipType, FrameInstance } from '../utils/frameUtils';
import type { BaseCanvasState, IconState } from './factory/baseTypes';
import type { IllustrationInstance } from '../utils/illustrations/types';
import type { PillBadgeInstance } from '../utils/pillBadgeUtils';
import type { ShapeInstance } from '../utils/shapes';
import type { SliderColorScheme, SliderStyle } from '../utils/sliderLayout';
import type { CanvasAiSnapshot } from '@gruenerator/contracts';

// Default arrow icon ID (HeroIcons chevron-right, resolved via canvasIcons.ts)
/** Feste Id der Pille, die die Folien-Beschriftung traegt. */
const SLIDER_LABEL_PILL_ID = 'slider-label-pill';

const ARROW_ICON_ID = 'hi-chevronright';

// ============================================================================
// STATE TYPE
// ============================================================================

export interface SliderState extends BaseCanvasState {
  // Text fields
  label: string;
  headline: string;
  subtext: string;
  subtext2: string;

  // Slide variant: 'cover' shows pill badge, 'content' hides it for more text space, 'last' is a clean CTA/closing slide
  slideVariant: 'cover' | 'content' | 'last';

  // Color scheme
  colorScheme: SliderColorScheme;
  backgroundColor: string;

  // Photo background. Optional throughout: every slider starts on a scheme's
  // colour plane, and the photo covers the plane whole once set. Mirrors the
  // sibling `createColorTwoTextCanvas` factory's state keys so the picker, the
  // update-element chat ops and the descriptor all speak the same keys.
  currentImageSrc?: string;
  backgroundImageFile?: File | Blob | null;
  imageOffset?: { x: number; y: number };
  imageScale?: number;
  isBackgroundLocked?: boolean;
  backgroundImageOpacity?: number;
  imageAttribution?: StockImageAttribution | null;

  // Font size overrides
  customLabelFontSize: number | null;
  customHeadlineFontSize: number | null;
  customSubtextFontSize: number | null;
  customSubtext2FontSize: number | null;

  // Text styling overrides
  labelColor?: string;
  headlineColor?: string;
  subtextColor?: string;
  subtext2Color?: string;
  labelOpacity?: number;
  headlineOpacity?: number;
  subtextOpacity?: number;
  subtext2Opacity?: number;
  headlinePosition?: { x: number; y: number };
  subtextPosition?: { x: number; y: number };
  subtext2Position?: { x: number; y: number };
  sunflowerOpacity?: number;
  sunflowerOffset?: { x: number; y: number };
  logoOpacity?: number;
  logoOffset?: { x: number; y: number };

  // Pill badge instances (dynamic, editable)
  pillBadgeInstances: PillBadgeInstance[];

  // Circle badge, balken, and frame instances
  circleBadgeInstances: CircleBadgeInstance[];
  balkenInstances: BalkenInstance[];
  frameInstances: FrameInstance[];

  /** z-order of the collections above; carried by `carryInstanceState`. */
  layerOrder: string[];

  // Base state (from BaseCanvasState)
  assetInstances: AssetInstance[];
  isDesktop: boolean;
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
  shapeInstances: ShapeInstance[];
  illustrationInstances: IllustrationInstance[];
  additionalTexts: AdditionalText[];
}

// ============================================================================
// ACTIONS TYPE
// ============================================================================

export interface SliderActions {
  // Text setters
  setLabel: (val: string) => void;
  setHeadline: (val: string) => void;
  setSubtext: (val: string) => void;
  setSubtext2: (val: string) => void;

  // Font size handlers
  handleLabelFontSizeChange: (size: number) => void;
  handleHeadlineFontSizeChange: (size: number) => void;
  handleSubtextFontSizeChange: (size: number) => void;
  handleSubtext2FontSizeChange: (size: number) => void;

  // Color scheme
  setColorScheme: (scheme: SliderColorScheme) => void;
  setBackgroundColor: (color: string) => void;

  // Photo background. `onImageChange`'s shape, so `ImageBackgroundSection`
  // hands a pick (photo + credit) over as one action and one undo step.
  setCurrentImageSrc: (
    file: File | null,
    objectUrl?: string,
    attribution?: StockImageAttribution | null
  ) => void;
  setImageScale: (scale: number) => void;
  toggleBackgroundLock: () => void;
  setImageAttribution: (attribution: StockImageAttribution | null) => void;

  // Pill badge actions
  addPillBadge: (preset?: string) => void;
  updatePillBadge: (id: string, partial: Partial<PillBadgeInstance>) => void;
  removePillBadge: (id: string) => void;

  // Circle badge actions
  addCircleBadge: (preset?: string) => void;
  updateCircleBadge: (id: string, partial: Partial<CircleBadgeInstance>) => void;
  removeCircleBadge: (id: string) => void;

  // Balken actions
  addBalken: (mode: BalkenMode) => void;
  updateBalken: (id: string, partial: Partial<BalkenInstance>) => void;
  removeBalken: (id: string) => void;

  // Frame actions
  addFrame: (clipType: FrameClipType) => void;
  updateFrame: (id: string, partial: Partial<FrameInstance>) => void;
  removeFrame: (id: string) => void;
  setFrameImage: (id: string, file: File, objectUrl: string) => void;

  // Base actions
  addAsset: (assetId: string) => void;
  updateAsset: (id: string, partial: Partial<AssetInstance>) => void;
  removeAsset: (id: string) => void;
  toggleIcon: (id: string, selected: boolean) => void;
  updateIcon: (id: string, partial: Partial<IconState>) => void;
  addShape: (type: 'rect' | 'circle' | 'triangle' | 'star' | 'arrow' | 'heart' | 'cloud') => void;
  updateShape: (id: string, partial: Partial<ShapeInstance>) => void;
  removeShape: (id: string) => void;
  addIllustration: (id: string) => void;
  updateIllustration: (id: string, partial: Partial<IllustrationInstance>) => void;
  removeIllustration: (id: string) => void;
  addHeader: () => void;
  addText: () => void;
  updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => void;
  removeAdditionalText: (id: string) => void;
}

// ============================================================================
// BRANDS
// ============================================================================

interface SliderBrand {
  id: 'slider' | 'slider-at';
  style: SliderStyle;
  /** Picker swatches; `id` is the scheme id, `color` its background. */
  backgroundColors: BackgroundColorOption[];
  /** Scheme labels the chat edit LLM reads. */
  aiColorSchemes: { id: string; label: string }[];
  /** Brand mark on cover and closing slides (sunflower / logo). */
  markElement: ImageElementConfig<SliderState>;
}

// ============================================================================
// LAYOUT CALCULATOR
// ============================================================================

const createCalculateLayout =
  (style: SliderStyle) =>
  (state: SliderState): LayoutResult => {
    const colors = getSliderColorsForState(state, style);
    const showPill = state.slideVariant === 'cover';
    const isLastSlide = state.slideVariant === 'last';
    const layout = calculateSliderLayout(
      state.label || 'Label',
      state.headline || '',
      state.subtext || '',
      state.customLabelFontSize,
      state.customHeadlineFontSize,
      state.customSubtextFontSize,
      showPill,
      isLastSlide,
      state.subtext2 || '',
      state.customSubtext2FontSize,
      style
    );

    return {
      'pill-rect': {
        x: layout.pill.rectX,
        y: layout.pill.rectY,
        width: layout.pill.rectWidth,
        height: layout.pill.rectHeight,
      },
      'pill-text': {
        x: layout.pill.textX,
        y: layout.pill.textY,
        fontSize: state.customLabelFontSize ?? SLIDER_CONFIG.pill.fontSize,
      },
      'headline-text': {
        x: layout.headline.x,
        y: layout.headline.y,
        fontSize: layout.headline.fontSize,
      },
      'subtext-text': {
        x: layout.subtext.x,
        y: layout.subtext.y,
        fontSize: layout.subtext.fontSize,
      },
      'subtext2-text': {
        x: layout.subtext2.x,
        y: layout.subtext2.y,
        fontSize: layout.subtext2.fontSize,
      },
      _meta: {
        colors,
        pillBackground: colors.pillBackground,
        pillText: colors.pillText,
        headlineColor: colors.headlineText,
        subtextColor: colors.subtextText,
        subtext2Color: colors.subtextText,
        arrowColor: colors.arrowFill,
      },
    };
  };

// ============================================================================
// ELEMENTS
// ============================================================================

/**
 * Uebernimmt die Schluessel, die die Werkzeugleiste an den drei Textelementen
 * schreibt (Farbe, Deckkraft, gezogene Position), aus dem Seed. Fehlende
 * Schluessel bleiben weg statt als `undefined` im Zustand zu stehen.
 */
function carrySliderTextStyling(props: Record<string, unknown>): Partial<SliderState> {
  const keys = [
    'labelColor',
    'headlineColor',
    'subtextColor',
    'subtext2Color',
    'labelOpacity',
    'headlineOpacity',
    'subtextOpacity',
    'subtext2Opacity',
    'headlinePosition',
    'subtextPosition',
    'subtext2Position',
  ];
  return Object.fromEntries(
    keys.filter((k) => props[k] != null).map((k) => [k, props[k]])
  ) as Partial<SliderState>;
}

const backgroundElement: BackgroundElementConfig<SliderState> = {
  id: 'background',
  type: 'background',
  x: 0,
  y: 0,
  // Negative so the photo plane and its scrim (added below) sit above the
  // colour and the sunflower / text content (which start at order 1+) stays
  // on top of both. Matches `createColorTwoTextCanvas`'s background stack.
  order: -2,
  width: SLIDER_CONFIG.canvas.width,
  height: SLIDER_CONFIG.canvas.height,
  colorKey: 'backgroundColor',
};

// Photo layer + contrast scrim, both gated on `currentImageSrc` so the picker's
// "Farbe" subsection keeps the old flat-colour look with no other changes.
// Same ids and order values as the sibling factory's stack so any future shared
// renderer keeps working across templates.
const backgroundImageElement: ImageElementConfig<SliderState> = {
  id: 'background-image',
  type: 'image',
  order: -1,
  x: 0,
  y: 0,
  width: SLIDER_CONFIG.canvas.width,
  height: SLIDER_CONFIG.canvas.height,
  srcKey: 'currentImageSrc',
  offsetKey: 'imageOffset',
  scaleKey: 'imageScale',
  draggable: true,
  // Corner handles zoom it like the sidebar slider (both write `imageScale`).
  transformable: true,
  lockedKey: 'isBackgroundLocked',
  opacityStateKey: 'backgroundImageOpacity',
  coverFit: true,
};

// Uniform scrim (not the sibling's top→bottom gradient) — the slider's text
// block starts at the very top of the frame with the pill, so a bottom-heavy
// gradient would leave the headline over raw photo pixels.
const gradientOverlayElement: RectElementConfig<SliderState> = {
  id: 'gradient-overlay',
  type: 'rect',
  order: -0.5,
  x: 0,
  y: 0,
  width: SLIDER_CONFIG.canvas.width,
  height: SLIDER_CONFIG.canvas.height,
  fill: 'rgba(0, 0, 0, 0.35)',
  listening: false,
  visible: (state) => !!state.currentImageSrc,
};

const sunflowerElement: ImageElementConfig<SliderState> = {
  id: 'sunflower',
  type: 'image',
  x: SLIDER_CONFIG.sunflower.x,
  y: SLIDER_CONFIG.sunflower.y,
  order: 1,
  width: SLIDER_CONFIG.sunflower.size,
  height: SLIDER_CONFIG.sunflower.size,
  src: SLIDER_CONFIG.sunflower.src,
  listening: true,
  draggable: true,
  constrainToBounds: false,
  opacity: () => SLIDER_CONFIG.sunflower.opacity,
  opacityStateKey: 'sunflowerOpacity',
  offsetKey: 'sunflowerOffset',
  visible: (state) => state.slideVariant !== 'content',
};

const logoElement: ImageElementConfig<SliderState> = {
  id: 'logo',
  type: 'image',
  x: SLIDER_AT_LOGO.x,
  y: SLIDER_AT_LOGO.y,
  order: 1,
  width: SLIDER_AT_LOGO.width,
  height: SLIDER_AT_LOGO.height,
  src: SLIDER_AT_LOGO.src,
  draggable: true,
  opacityStateKey: 'logoOpacity',
  offsetKey: 'logoOffset',
  visible: (state) => state.slideVariant !== 'content',
};

const createTextElements = (style: SliderStyle): TextElementConfig<SliderState>[] => [
  {
    id: 'headline-text',
    type: 'text',
    x: fromLayout('headline-text', 'x', SLIDER_CONFIG.headline.x),
    y: fromLayout('headline-text', 'y', 300),
    order: 4,
    textKey: 'headline',
    width: SLIDER_CONFIG.headline.maxWidth,
    fontSize: fromLayout('headline-text', 'fontSize', SLIDER_CONFIG.headline.fontSize),
    fontFamily: `${style.headline.fontFamily}, Arial, sans-serif`,
    fontStyle: style.headline.fontStyle,
    align: 'left',
    lineHeight: style.headline.lineHeight,
    wrap: 'word',
    editable: true,
    draggable: true,
    fontSizeStateKey: 'customHeadlineFontSize',
    opacityStateKey: 'headlineOpacity',
    fill: (state) => getSliderColorsForState(state, style).headlineText,
    fillStateKey: 'headlineColor',
    positionStateKey: 'headlinePosition',
  },
  {
    id: 'subtext-text',
    type: 'text',
    x: fromLayout('subtext-text', 'x', SLIDER_CONFIG.subtext.x),
    y: fromLayout('subtext-text', 'y', 600),
    order: 5,
    textKey: 'subtext',
    width: SLIDER_CONFIG.subtext.maxWidth,
    fontSize: fromLayout('subtext-text', 'fontSize', SLIDER_CONFIG.subtext.fontSize),
    fontFamily: `${style.subtext.fontFamily}, Arial, sans-serif`,
    fontStyle: style.subtext.fontStyle,
    align: 'left',
    lineHeight: style.subtext.lineHeight,
    wrap: 'word',
    editable: true,
    richText: true,
    draggable: true,
    fontSizeStateKey: 'customSubtextFontSize',
    opacityStateKey: 'subtextOpacity',
    fill: (state) => getSliderColorsForState(state, style).subtextText,
    fillStateKey: 'subtextColor',
    positionStateKey: 'subtextPosition',
  },
  {
    id: 'subtext2-text',
    type: 'text',
    x: fromLayout('subtext2-text', 'x', SLIDER_CONFIG.subtext2.x),
    y: fromLayout('subtext2-text', 'y', 800),
    order: 6,
    textKey: 'subtext2',
    width: SLIDER_CONFIG.subtext2.maxWidth,
    fontSize: fromLayout('subtext2-text', 'fontSize', SLIDER_CONFIG.subtext2.fontSize),
    fontFamily: `${style.subtext.fontFamily}, Arial, sans-serif`,
    fontStyle: style.subtext.fontStyle,
    align: 'left',
    lineHeight: style.subtext.lineHeight,
    wrap: 'word',
    editable: true,
    richText: true,
    draggable: true,
    fontSizeStateKey: 'customSubtext2FontSize',
    opacityStateKey: 'subtext2Opacity',
    fill: (state) => getSliderColorsForState(state, style).subtextText,
    fillStateKey: 'subtext2Color',
    positionStateKey: 'subtext2Position',
    visible: (state) => state.slideVariant === 'content',
  },
];

// ============================================================================
// CONFIG EXPORT
// ============================================================================

// ============================================================================
// AI CAPABILITY
// ============================================================================

const createAiCapabilities = (
  brand: SliderBrand
): TemplateAiCapabilities<SliderState, SliderActions> => ({
  supportedOperations: ['set-text', 'set-color-scheme', 'set-font-size'],

  colorSchemes: brand.aiColorSchemes,

  describeForAi: (state): CanvasAiSnapshot => ({
    template: brand.id,
    textFields: [
      { field: 'label', label: 'Label (Pill-Badge)', value: state.label },
      { field: 'headline', label: 'Headline', value: state.headline },
      { field: 'subtext', label: 'Untertext', value: state.subtext },
      { field: 'subtext2', label: 'Zusatztext', value: state.subtext2 },
    ],
    currentColorScheme: state.colorScheme,
    currentBackgroundColor: state.backgroundColor as `#${string}`,
    elementsSummary: [],
  }),

  applyOverrides: {
    'set-text': (op, actions) => {
      switch (op.field) {
        case 'label':
          actions.setLabel(op.value);
          return;
        case 'headline':
          actions.setHeadline(op.value);
          return;
        case 'subtext':
          actions.setSubtext(op.value);
          return;
        case 'subtext2':
          actions.setSubtext2(op.value);
          return;
        default:
          throw new Error(`Slider-Vorlage hat kein Feld "${op.field}"`);
      }
    },
    'set-color-scheme': (op, actions) => {
      if (!isSliderColorScheme(op.schemeId, brand.style)) {
        throw new Error(`Unbekanntes Farbschema "${op.schemeId}"`);
      }
      actions.setColorScheme(op.schemeId);
    },
    'set-font-size': (op, actions) => {
      switch (op.field) {
        case 'label':
          actions.handleLabelFontSizeChange(op.size);
          return;
        case 'headline':
          actions.handleHeadlineFontSizeChange(op.size);
          return;
        case 'subtext':
          actions.handleSubtextFontSizeChange(op.size);
          return;
        case 'subtext2':
          actions.handleSubtext2FontSizeChange(op.size);
          return;
        default:
          throw new Error(`Slider-Vorlage hat kein Schriftgrößen-Feld "${op.field}"`);
      }
    },
  },
});

const section = makeSectionDefiner<SliderState, SliderActions>();

function createSliderConfig(brand: SliderBrand): FullCanvasConfig<SliderState, SliderActions> {
  const { style } = brand;
  const ai = createAiCapabilities(brand);
  /** Swatch colour → scheme; an unknown colour lands on the brand default. */
  const schemeForColor = (color: string): SliderColorScheme =>
    (brand.backgroundColors.find((c) => c.color === color)?.id as SliderColorScheme | undefined) ??
    style.defaultScheme;
  const pillPreset = (scheme: SliderColorScheme): string =>
    scheme === 'tanne-sand' ? 'slider-inverted' : 'slider';

  return {
    id: brand.id,

    canvas: {
      width: SLIDER_CONFIG.canvas.width,
      height: SLIDER_CONFIG.canvas.height,
    },

    fonts: {
      primary: style.headline.fontFamily,
      fontSize: 90,
      requireFontLoad: true,
    },

    features: {
      icons: true,
      shapes: true,
      illustrations: true,
    },

    multiPage: {
      enabled: true,
      maxPages: 10,
      heterogeneous: true,
      defaultNewPageState: {
        label: 'Wusstest du?',
        headline: '',
        subtext: '',
        subtext2: '',
        slideVariant: 'content',
      },
    },

    ai,

    tabs: [
      {
        id: 'background',
        icon: HiPhotograph,
        label: 'Hintergrund',
        ariaLabel: 'Farbschema wählen',
      },
      {
        id: 'text',
        icon: PiTextAa,
        label: 'Text',
        ariaLabel: 'Text bearbeiten',
      },
      {
        id: 'assets',
        icon: PiSquaresFourFill,
        label: 'Elemente',
        ariaLabel: 'Dekorative Elemente',
      },
      {
        id: 'frame-settings',
        icon: PiFrameCornersFill,
        label: 'Rahmen',
        ariaLabel: 'Rahmen-Einstellungen',
      },
      toolsTab,
      uploadsTab,
      chatTab,
    ],

    // 'background' was hidden here and left to getAutoSwitchTab below, which
    // matched the id `background` — the colour plane, drawn `listening={false}`,
    // so it never becomes the selection and the tab never opened.
    getVisibleTabs: () => ['background', 'text', 'assets', 'tools', 'uploads', 'chat'],

    getAutoSwitchTab: (selectedElement) => {
      if (selectedElement === 'background-image') return 'background';
      if (selectedElement?.startsWith('balken-')) return 'settings';
      if (selectedElement?.startsWith('chart-')) return 'chart-settings';
      if (selectedElement?.startsWith('frame-')) return 'frame-settings';
      return null;
    },

    sections: {
      // The photo templates' picker: library, Unsplash and own uploads, the
      // scheme swatches as its "Farbe" tab (the colour plane sits under the
      // photo and the scheme also colours pill and arrow), zoom and lock.
      background: section({
        component: ImageBackgroundSection,
        propsFactory: (state, actions) =>
          ({
            currentImageSrc: state.currentImageSrc || undefined,
            onImageChange: actions.setCurrentImageSrc,
            backgroundColor: state.backgroundColor,
            backgroundColors: brand.backgroundColors,
            onBackgroundColorChange: (color: string) =>
              actions.setColorScheme(schemeForColor(color)),
            scale: state.currentImageSrc ? (state.imageScale ?? 1) : undefined,
            onScaleChange: state.currentImageSrc ? actions.setImageScale : undefined,
            isLocked: state.isBackgroundLocked ?? false,
            onToggleLock: state.currentImageSrc ? actions.toggleBackgroundLock : undefined,
            initialSubsection: state.currentImageSrc ? 'image-search' : 'background-color',
          }) satisfies ImageBackgroundSectionProps,
      }),
      text: section({
        component: CombinedTextSection,
        propsFactory: (state, actions) => ({
          additionalTexts: state.additionalTexts,
          onAddHeader: actions.addHeader,
          onAddText: actions.addText,
          onUpdateText: actions.updateAdditionalText,
          onRemoveText: actions.removeAdditionalText,
        }),
      }),
      assets: section({
        component: AssetsSection,
        propsFactory: (state, actions, context) => ({
          assetInstances: state.assetInstances,
          onAddAsset: actions.addAsset,
          onUpdateAsset: actions.updateAsset,
          onRemoveAsset: actions.removeAsset,
          onAddPillBadge: actions.addPillBadge,
          ...injectFeatureProps(state, actions, context),
        }),
      }),
      'frame-settings': section({
        component: FrameSettingsSection,
        propsFactory: (state, actions, context) => {
          const selectedId = context?.selectedElement ?? null;
          const selectedFrame = selectedId
            ? (state.frameInstances?.find((f) => f.id === selectedId) ?? null)
            : null;
          return {
            selectedFrame,
            onSetFrameImage: actions.setFrameImage,
            onUpdateFrame: actions.updateFrame,
            onRemoveFrame: actions.removeFrame,
          };
        },
      }),
      ...createCommonSectionEntries(brand.id, ai),
      share: createShareSection<SliderState, SliderActions>(brand.id, (state) => {
        const label = state.label || '';
        const headline = state.headline || '';
        const subtext = state.subtext || '';
        return [label, headline, subtext].filter(Boolean).join('\n');
      }),
    },

    elements: [
      backgroundElement,
      backgroundImageElement,
      gradientOverlayElement,
      brand.markElement,
      ...createTextElements(style),
    ],

    calculateLayout: createCalculateLayout(style),

    createInitialState: (props: Record<string, unknown>): SliderState => {
      // Membership check, not a truthiness default: a minted canvas seeds this
      // from the studio store, whose `colorScheme` is a `{background}[]`
      // palette — truthy, and no scheme id at all.
      const colorScheme = isSliderColorScheme(props.colorScheme, style)
        ? props.colorScheme
        : style.defaultScheme;
      const colors = getSliderColors(colorScheme, style);
      const variant = (props.slideVariant as 'cover' | 'content' | 'last') || 'cover';
      const includeArrow = variant !== 'last';
      const showPill = variant === 'cover';

      // Default arrow icon state. When the seed already carries a photo the
      // arrow starts on the photo-overlay colour too — otherwise a re-seed of
      // an edited slide would flip it back to the scheme's arrowFill mid-photo.
      const carriedPhotoSrc = (props.currentImageSrc as string | undefined) ?? '';
      const arrowIconState: IconState = {
        x: SLIDER_CONFIG.arrow.defaultX,
        y: SLIDER_CONFIG.arrow.defaultY,
        scale: SLIDER_CONFIG.arrow.scale,
        rotation: 0,
        color: carriedPhotoSrc ? '#FFFFFF' : colors.arrowFill,
        opacity: 1,
      };

      // Der Pfeil ist eine Vorgabe, keine Zwangsjacke: liegt schon eine
      // Icon-Auswahl vor, gilt sie — sonst haette jedes Neu-Setzen die selbst
      // hinzugefuegten Icons durch den blossen Pfeil ersetzt.
      //
      // Entschieden wird am *Vorhandensein* des Schluessels, nicht an seiner
      // Laenge: eine leere Auswahl heisst "der Pfeil wurde entfernt" und darf
      // nicht als "noch nie gesetzt" gelesen werden, sonst kommt er bei jeder
      // Chat-Bearbeitung zurueck. Die Neuanlage-Pfade in `usePageManager`
      // reichen nur `defaultNewPageState` und `INHERITABLE_KEYS` durch, also
      // nie einen Instanz-Schluessel — ein Re-Seed dagegen immer.
      const iconsSeeded = Array.isArray(props.selectedIcons);
      const carriedIcons = iconsSeeded ? (props.selectedIcons as string[]) : [];
      const iconStatesSeeded = !!props.iconStates && typeof props.iconStates === 'object';
      const carriedIconStates = iconStatesSeeded
        ? (props.iconStates as Record<string, IconState>)
        : {};

      // Die Kopf-Pille traegt die Beschriftung der Folie und wird deshalb aus
      // `label` und dem Farbschema abgeleitet. Erkannt wird sie an ihrer festen
      // Id, nicht an ihrer Position in der Liste: entfernt man die Kopf-Pille
      // und behaelt eine selbst hinzugefuegte, rutscht diese sonst auf Index 0
      // und bekaeme hier ihren Text ueberschrieben.
      //
      // Aeltere Staende kennen die feste Id noch nicht. Dort wird gar nichts
      // angefasst, weil sich nicht beweisen laesst, welche Pille die Kopf-Pille
      // ist — Zerstoeren waere der teurere Fehler. Die Farben holt ohnehin
      // `setColorScheme` fuer alle Pillen nach, und `setLabel` fasst die Pille
      // im Editor auch heute nicht an.
      const pillBadgeColors = {
        backgroundColor: colors.pillBackground,
        textColor: colors.pillText,
      };
      const pillText = (props.label as string) || 'Wusstest du?';
      const carriedPills = Array.isArray(props.pillBadgeInstances)
        ? (props.pillBadgeInstances as PillBadgeInstance[])
        : [];
      const pillsSeeded = Array.isArray(props.pillBadgeInstances);
      const hasLabelPill = carriedPills.some((badge) => badge.id === SLIDER_LABEL_PILL_ID);
      let initialPillBadge: PillBadgeInstance[];
      if (!showPill) {
        initialPillBadge = [];
      } else if (hasLabelPill) {
        initialPillBadge = carriedPills.map((badge) =>
          badge.id === SLIDER_LABEL_PILL_ID
            ? {
                ...badge,
                text: pillText,
                backgroundColor: pillBadgeColors.backgroundColor,
                textColor: pillBadgeColors.textColor,
              }
            : badge
        );
      } else if (pillsSeeded) {
        // Aeltere Staende ohne feste Id, oder eine bewusst geloeschte Pille.
        initialPillBadge = carriedPills;
      } else {
        initialPillBadge = [
          createPillBadgeInstance(pillPreset(colorScheme), {
            id: SLIDER_LABEL_PILL_ID,
            text: pillText,
            backgroundColor: pillBadgeColors.backgroundColor,
            textColor: pillBadgeColors.textColor,
            fontFamily: style.pill.fontFamily,
            fontStyle: style.pill.fontStyle,
          }),
        ];
      }

      return {
        // Text fields
        label: (props.label as string) || 'Wusstest du?',
        headline: (props.headline as string) || '',
        subtext: (props.subtext as string) || '',
        subtext2: (props.subtext2 as string) || '',

        // Slide variant
        slideVariant: variant,

        // Color scheme
        colorScheme,
        backgroundColor: colors.background,

        // Photo background. Carried, never hard-reset: card renders and
        // remote-sync re-seeds run through this whitelist, so a key not named
        // here is dropped and the next re-render forgets the picture.
        currentImageSrc: (props.currentImageSrc as string) || '',
        imageOffset: (props.imageOffset as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
        imageScale: (props.imageScale as number | undefined) ?? 1,
        isBackgroundLocked: (props.isBackgroundLocked as boolean | undefined) ?? false,
        backgroundImageOpacity: (props.backgroundImageOpacity as number | undefined) ?? 1,
        imageAttribution:
          (props.imageAttribution as StockImageAttribution | null | undefined) ?? null,

        // Sunflower watermark tweaks — must survive re-seeds, the initial state
        // is a whitelist and would drop them otherwise.
        ...(typeof props.sunflowerOpacity === 'number'
          ? { sunflowerOpacity: props.sunflowerOpacity }
          : {}),
        ...(props.sunflowerOffset
          ? { sunflowerOffset: props.sunflowerOffset as { x: number; y: number } }
          : {}),
        ...(typeof props.logoOpacity === 'number' ? { logoOpacity: props.logoOpacity } : {}),
        ...(props.logoOffset ? { logoOffset: props.logoOffset as { x: number; y: number } } : {}),

        // Font size overrides
        // Aus den Props, nicht hart genullt: Karten-Render und Remote-Sync
        // laufen durch diese Funktion, ein fester Wert verwarf jede per Regler
        // gesetzte Schriftgroesse beim naechsten Render.
        customLabelFontSize: (props.customLabelFontSize as number | null | undefined) ?? null,
        customHeadlineFontSize: (props.customHeadlineFontSize as number | null | undefined) ?? null,
        customSubtextFontSize: (props.customSubtextFontSize as number | null | undefined) ?? null,
        customSubtext2FontSize: (props.customSubtext2FontSize as number | null | undefined) ?? null,

        // Farbe, Deckkraft und gezogene Position der drei Texte. Sie standen
        // ueberhaupt nicht in dieser Funktion und fielen deshalb still weg.
        ...carrySliderTextStyling(props),

        // Base state
        // Alles selbst Hinzugefuegte statt hart `[]`: sonst raeumt jede
        // Chat-Bearbeitung Formen, Diagramme und Zusatztexte ab. Pfeil und
        // Pille darunter ueberschreiben ihre eigenen Schluessel.
        ...carryInstanceState(props),
        isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
        selectedIcons: iconsSeeded ? carriedIcons : includeArrow ? [ARROW_ICON_ID] : [],
        iconStates: iconStatesSeeded
          ? carriedIconStates
          : includeArrow
            ? { [ARROW_ICON_ID]: arrowIconState }
            : {},
        pillBadgeInstances: initialPillBadge,
      };
    },

    createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => {
      const { width, height } = SLIDER_CONFIG.canvas;

      const getFontColor = () => {
        const state = getState();
        return getSliderColorsForState(state, style).headlineText;
      };

      const baseActions = createBaseActions(
        getState,
        setState,
        saveToHistory,
        debouncedSaveToHistory,
        width,
        height,
        getFontColor()
      );

      return {
        ...baseActions,

        // Label text
        setLabel: (val: string) => {
          setState({ label: val } as Partial<SliderState>);
          callbacks.onLabelChange?.(val);
          debouncedSaveToHistory(getState());
        },
        handleLabelFontSizeChange: (size: number) => {
          setState({ customLabelFontSize: size } as Partial<SliderState>);
          debouncedSaveToHistory(getState());
        },

        // Headline text
        setHeadline: (val: string) => {
          setState({ headline: val } as Partial<SliderState>);
          callbacks.onHeadlineChange?.(val);
          debouncedSaveToHistory(getState());
        },
        handleHeadlineFontSizeChange: (size: number) => {
          setState({ customHeadlineFontSize: size } as Partial<SliderState>);
          debouncedSaveToHistory(getState());
        },

        // Subtext text
        setSubtext: (val: string) => {
          setState({ subtext: val } as Partial<SliderState>);
          callbacks.onSubtextChange?.(val);
          debouncedSaveToHistory(getState());
        },
        handleSubtextFontSizeChange: (size: number) => {
          setState({ customSubtextFontSize: size } as Partial<SliderState>);
          debouncedSaveToHistory(getState());
        },

        // Subtext2 text
        setSubtext2: (val: string) => {
          setState({ subtext2: val } as Partial<SliderState>);
          debouncedSaveToHistory(getState());
        },
        handleSubtext2FontSizeChange: (size: number) => {
          setState({ customSubtext2FontSize: size } as Partial<SliderState>);
          debouncedSaveToHistory(getState());
        },

        // Color scheme
        setColorScheme: (scheme: SliderColorScheme) => {
          const colors = getSliderColors(scheme, style);
          const state = getState();
          // Over a photo the arrow follows the white-text rule even though the
          // scheme's own fill may be tanne: the plane is hidden, the pill stays
          // filled and legible, the arrow needs the light colour the scrim
          // darkens behind.
          const arrowColor = state.currentImageSrc ? '#FFFFFF' : colors.arrowFill;

          // Update arrow icon color to match new scheme — jede Kopie des Pfeils,
          // nicht nur das erste Exemplar unter der Katalog-ID.
          const updatedIconStates = recolorIconInstances(
            state.iconStates,
            ARROW_ICON_ID,
            arrowColor
          );

          // Update pill badge colors to match new scheme
          const updatedPillBadges = state.pillBadgeInstances.map((pill) => ({
            ...pill,
            backgroundColor: colors.pillBackground,
            textColor: colors.pillText,
          }));

          const patch: Partial<SliderState> = {
            colorScheme: scheme,
            backgroundColor: colors.background,
            iconStates: updatedIconStates,
            pillBadgeInstances: updatedPillBadges,
          };
          setState(patch);
          // `getState` is the render-time state: snapshot what this produces.
          saveToHistory({ ...state, ...patch });
        },

        setBackgroundColor: (color: string) => {
          const scheme = schemeForColor(color);
          const colors = getSliderColors(scheme, style);
          const state = getState();

          const updatedIconStates = recolorIconInstances(
            state.iconStates,
            ARROW_ICON_ID,
            getSliderColorsForState(
              { colorScheme: scheme, currentImageSrc: state.currentImageSrc },
              style
            ).arrowFill
          );

          // Update pill badge colors to match new scheme
          const updatedPillBadges = state.pillBadgeInstances.map((pill) => ({
            ...pill,
            backgroundColor: colors.pillBackground,
            textColor: colors.pillText,
          }));

          const patch: Partial<SliderState> = {
            colorScheme: scheme,
            backgroundColor: colors.background,
            iconStates: updatedIconStates,
            pillBadgeInstances: updatedPillBadges,
          };
          setState(patch);
          saveToHistory({ ...state, ...patch });
        },

        // Photo background. Mirrors the sibling `createColorTwoTextCanvas`
        // setters, plus one arrow-side side effect: the scheme colours bake
        // the arrow fill into `iconStates[hi-chevronright].color`, so entering
        // or leaving photo mode has to move that one field too or the arrow
        // keeps the old scheme colour over the new background.
        // The credit belongs to the photo: a pick without one (or a removal)
        // drops the previous photo's credit in the same step.
        setCurrentImageSrc: (
          file: File | null,
          objectUrl?: string,
          attribution?: StockImageAttribution | null
        ) => {
          const state = getState();
          const nextSrc = objectUrl || '';
          const nextColor = nextSrc
            ? '#FFFFFF'
            : getSliderColors(state.colorScheme, style).arrowFill;
          const patch: Partial<SliderState> = {
            currentImageSrc: nextSrc,
            backgroundImageFile: file,
            imageAttribution: nextSrc ? (attribution ?? null) : null,
            iconStates: recolorIconInstances(state.iconStates, ARROW_ICON_ID, nextColor),
          };
          setState(patch);
          saveToHistory({ ...state, ...patch });
        },
        setImageScale: (scale: number) => {
          setState({ imageScale: scale } as Partial<SliderState>);
          debouncedSaveToHistory({ ...getState(), imageScale: scale });
        },
        toggleBackgroundLock: () => {
          const state = getState();
          const isBackgroundLocked = !state.isBackgroundLocked;
          setState({ isBackgroundLocked } as Partial<SliderState>);
          saveToHistory({ ...state, isBackgroundLocked });
        },
        setImageAttribution: (attribution: StockImageAttribution | null) => {
          setState({ imageAttribution: attribution } as Partial<SliderState>);
        },

        // Pill badge actions
        addPillBadge: (preset?: string) => {
          const state = getState();
          const colors = getSliderColors(state.colorScheme, style);
          const newPillBadge = createPillBadgeInstance(preset ?? pillPreset(state.colorScheme), {
            backgroundColor: colors.pillBackground,
            textColor: colors.pillText,
            fontFamily: style.pill.fontFamily,
            fontStyle: style.pill.fontStyle,
          });
          setState({
            pillBadgeInstances: [...state.pillBadgeInstances, newPillBadge],
          } as Partial<SliderState>);
          saveToHistory(getState());
        },

        updatePillBadge: (id: string, partial: Partial<PillBadgeInstance>) => {
          const state = getState();
          const updatedPillBadges = state.pillBadgeInstances.map((pill) =>
            pill.id === id ? { ...pill, ...partial } : pill
          );
          setState({ pillBadgeInstances: updatedPillBadges } as Partial<SliderState>);
          debouncedSaveToHistory(getState());
        },

        removePillBadge: (id: string) => {
          const state = getState();
          const updatedPillBadges = state.pillBadgeInstances.filter((pill) => pill.id !== id);
          setState({ pillBadgeInstances: updatedPillBadges } as Partial<SliderState>);
          saveToHistory(getState());
        },
      };
    },
  };
}

export const sliderFullConfig = createSliderConfig({
  id: 'slider',
  style: SLIDER_DE_STYLE,
  backgroundColors: [
    { id: 'sand-tanne', label: 'Sand/Tanne', color: '#F5F1E9' },
    { id: 'tanne-sand', label: 'Tanne/Sand', color: '#005538' },
  ],
  aiColorSchemes: [
    { id: 'sand-tanne', label: 'Sand & Tanne (heller Hintergrund)' },
    { id: 'tanne-sand', label: 'Tanne & Sand (dunkler Hintergrund)' },
  ],
  markElement: sunflowerElement,
});

export const sliderAtFullConfig = createSliderConfig({
  id: 'slider-at',
  style: SLIDER_AT_STYLE,
  backgroundColors: [
    {
      id: 'dunkelgruen',
      label: 'Dunkelgrün',
      color: SLIDER_AT_STYLE.colorSchemes.dunkelgruen.background,
    },
    {
      id: 'hellgruen',
      label: 'Hellgrün',
      color: SLIDER_AT_STYLE.colorSchemes.hellgruen.background,
    },
  ],
  aiColorSchemes: [
    { id: 'dunkelgruen', label: 'Dunkelgrün (Hauptfarbe)' },
    { id: 'hellgruen', label: 'Hellgrün (Alternative)' },
  ],
  markElement: logoElement,
});

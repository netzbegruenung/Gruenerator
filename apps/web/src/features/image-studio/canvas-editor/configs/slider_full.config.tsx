/**
 * Slider Full Canvas Configuration
 *
 * Social media slider template with:
 * - Editable pill badge header
 * - Large headline text
 * - Supporting subtext
 * - Draggable arrow decoration
 * - Two color schemes (sand-tanne, tanne-sand)
 */

import { HiPhotograph } from 'react-icons/hi';
import { PiSquaresFourFill } from 'react-icons/pi';

import { BackgroundSection, AssetsSection } from '../sidebar/sections';
import { createPillBadgeInstance, getPillBadgeColorsForScheme } from '../utils/pillBadgeUtils';
import { SLIDER_CONFIG, calculateSliderLayout, getSliderColors } from '../utils/sliderLayout';

import { alternativesTab, createAlternativesSection } from './alternativesSection';
import { createBaseActions } from './factory/commonActions';
import { injectFeatureProps } from './featureInjector';
import { shareTab, createShareSection } from './shareSection';

import type {
  FullCanvasConfig,
  LayoutResult,
  BackgroundElementConfig,
  RectElementConfig,
  TextElementConfig,
  ImageElementConfig,
  AdditionalText,
} from './types';
import type { BackgroundColorOption } from '../sidebar/types';
import type { AssetInstance } from '../utils/canvasAssets';
import type { IllustrationInstance } from '../utils/illustrations/types';
import type { ShapeInstance } from '../utils/shapes';
import type { BaseCanvasState, IconState } from './factory/baseTypes';
import type { PillBadgeInstance } from '../utils/pillBadgeUtils';
import type { SliderColorScheme } from '../utils/sliderLayout';

// Default arrow icon ID (HeroIcons chevron-right, resolved via canvasIcons.ts)
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

  // Pill badge instances (dynamic, editable)
  pillBadgeInstances: PillBadgeInstance[];

  // Base state (from BaseCanvasState)
  assetInstances: AssetInstance[];
  isDesktop: boolean;
  alternatives: string[];
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

  // Pill badge actions
  addPillBadge: (preset?: string) => void;
  updatePillBadge: (id: string, partial: Partial<PillBadgeInstance>) => void;
  removePillBadge: (id: string) => void;

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
  handleSelectAlternative: (alt: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BACKGROUND_COLORS: BackgroundColorOption[] = [
  { id: 'sand-tanne', label: 'Sand/Tanne', color: '#F5F1E9' },
  { id: 'tanne-sand', label: 'Tanne/Sand', color: '#005538' },
];

// ============================================================================
// LAYOUT CALCULATOR
// ============================================================================

const calculateLayout = (state: SliderState): LayoutResult => {
  const colors = getSliderColors(state.colorScheme);
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
    state.customSubtext2FontSize
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

const backgroundElement: BackgroundElementConfig<SliderState> = {
  id: 'background',
  type: 'background',
  x: 0,
  y: 0,
  order: 0,
  width: SLIDER_CONFIG.canvas.width,
  height: SLIDER_CONFIG.canvas.height,
  colorKey: 'backgroundColor',
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
  visible: (state) => state.slideVariant !== 'content',
};

const headlineTextElement: TextElementConfig<SliderState> = {
  id: 'headline-text',
  type: 'text',
  x: (_s, l) => (l['headline-text'] as { x?: number })?.x ?? SLIDER_CONFIG.headline.x,
  y: (_s, l) => (l['headline-text'] as { y?: number })?.y ?? 300,
  order: 4,
  textKey: 'headline',
  width: SLIDER_CONFIG.headline.maxWidth,
  fontSize: (_s, l) =>
    (l['headline-text'] as { fontSize?: number })?.fontSize ?? SLIDER_CONFIG.headline.fontSize,
  fontFamily: `${SLIDER_CONFIG.headline.fontFamily}, Arial, sans-serif`,
  fontStyle: SLIDER_CONFIG.headline.fontStyle,
  align: 'left',
  lineHeight: SLIDER_CONFIG.headline.lineHeight,
  wrap: 'word',
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customHeadlineFontSize',
  opacityStateKey: 'headlineOpacity',
  fill: (state) => getSliderColors(state.colorScheme).headlineText,
  fillStateKey: 'headlineColor',
};

const subtextTextElement: TextElementConfig<SliderState> = {
  id: 'subtext-text',
  type: 'text',
  x: (_s, l) => (l['subtext-text'] as { x?: number })?.x ?? SLIDER_CONFIG.subtext.x,
  y: (_s, l) => (l['subtext-text'] as { y?: number })?.y ?? 600,
  order: 5,
  textKey: 'subtext',
  width: SLIDER_CONFIG.subtext.maxWidth,
  fontSize: (_s, l) =>
    (l['subtext-text'] as { fontSize?: number })?.fontSize ?? SLIDER_CONFIG.subtext.fontSize,
  fontFamily: `${SLIDER_CONFIG.subtext.fontFamily}, Arial, sans-serif`,
  fontStyle: SLIDER_CONFIG.subtext.fontStyle,
  align: 'left',
  lineHeight: SLIDER_CONFIG.subtext.lineHeight,
  wrap: 'word',
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customSubtextFontSize',
  opacityStateKey: 'subtextOpacity',
  fill: (state) => getSliderColors(state.colorScheme).subtextText,
  fillStateKey: 'subtextColor',
};

const subtext2TextElement: TextElementConfig<SliderState> = {
  id: 'subtext2-text',
  type: 'text',
  x: (_s, l) => (l['subtext2-text'] as { x?: number })?.x ?? SLIDER_CONFIG.subtext2.x,
  y: (_s, l) => (l['subtext2-text'] as { y?: number })?.y ?? 800,
  order: 6,
  textKey: 'subtext2',
  width: SLIDER_CONFIG.subtext2.maxWidth,
  fontSize: (_s, l) =>
    (l['subtext2-text'] as { fontSize?: number })?.fontSize ?? SLIDER_CONFIG.subtext2.fontSize,
  fontFamily: `${SLIDER_CONFIG.subtext2.fontFamily}, Arial, sans-serif`,
  fontStyle: SLIDER_CONFIG.subtext2.fontStyle,
  align: 'left',
  lineHeight: SLIDER_CONFIG.subtext2.lineHeight,
  wrap: 'word',
  editable: true,
  draggable: true,
  fontSizeStateKey: 'customSubtext2FontSize',
  opacityStateKey: 'subtext2Opacity',
  fill: (state) => getSliderColors(state.colorScheme).subtextText,
  fillStateKey: 'subtext2Color',
  visible: (state) => state.slideVariant === 'content',
};

// ============================================================================
// CONFIG EXPORT
// ============================================================================

export const sliderFullConfig: FullCanvasConfig<SliderState, SliderActions> = {
  id: 'slider',

  canvas: {
    width: SLIDER_CONFIG.canvas.width,
    height: SLIDER_CONFIG.canvas.height,
  },

  fonts: {
    primary: 'GrueneTypeNeue',
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

  tabs: [
    {
      id: 'background',
      icon: HiPhotograph,
      label: 'Hintergrund',
      ariaLabel: 'Farbschema wählen',
    },
    {
      id: 'assets',
      icon: PiSquaresFourFill,
      label: 'Elemente',
      ariaLabel: 'Dekorative Elemente',
    },
    alternativesTab,
    shareTab,
  ],

  getVisibleTabs: () => ['background', 'assets', 'share'],

  sections: {
    background: {
      component: BackgroundSection,
      propsFactory: (state, actions) => ({
        currentColor: state.backgroundColor,
        colors: BACKGROUND_COLORS,
        onColorChange: (color: string) => {
          const scheme = color === '#005538' ? 'tanne-sand' : 'sand-tanne';
          actions.setColorScheme(scheme);
        },
      }),
    },
    assets: {
      component: AssetsSection,
      propsFactory: (state, actions, context) => ({
        assetInstances: state.assetInstances,
        onAddAsset: actions.addAsset,
        onUpdateAsset: actions.updateAsset,
        onRemoveAsset: actions.removeAsset,
        onAddPillBadge: actions.addPillBadge,
        ...injectFeatureProps(state, actions, context),
      }),
    },
    alternatives: createAlternativesSection<SliderState, SliderActions>({
      type: 'string',
      getAlternatives: (state) => state.alternatives,
      getCurrentValue: (state) => state.headline,
      getSelectAction: (actions) => actions.handleSelectAlternative,
    }),
    share: createShareSection<SliderState, SliderActions>('slider', (state) => {
      const label = state.label || '';
      const headline = state.headline || '';
      const subtext = state.subtext || '';
      return [label, headline, subtext].filter(Boolean).join('\n');
    }),
  },

  elements: [
    backgroundElement,
    sunflowerElement,
    headlineTextElement,
    subtextTextElement,
    subtext2TextElement,
  ],

  calculateLayout,

  createInitialState: (props: Record<string, unknown>): SliderState => {
    const colorScheme = (props.colorScheme as SliderColorScheme) || 'sand-tanne';
    const colors = getSliderColors(colorScheme);
    const variant = (props.slideVariant as 'cover' | 'content' | 'last') || 'cover';
    const includeArrow = variant !== 'last';
    const showPill = variant === 'cover';

    // Default arrow icon state
    const arrowIconState: IconState = {
      x: SLIDER_CONFIG.arrow.defaultX,
      y: SLIDER_CONFIG.arrow.defaultY,
      scale: SLIDER_CONFIG.arrow.scale,
      rotation: 0,
      color: colors.arrowFill,
      opacity: 1,
    };

    // Create pill badge instance for cover slides
    const pillBadgeColors = getPillBadgeColorsForScheme(colorScheme);
    const initialPillBadge = showPill
      ? [
          createPillBadgeInstance(colorScheme === 'tanne-sand' ? 'slider-inverted' : 'slider', {
            text: (props.label as string) || 'Wusstest du?',
            backgroundColor: pillBadgeColors.backgroundColor,
            textColor: pillBadgeColors.textColor,
          }),
        ]
      : [];

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

      // Font size overrides
      customLabelFontSize: null,
      customHeadlineFontSize: null,
      customSubtextFontSize: null,
      customSubtext2FontSize: null,

      // Pill badge instances
      pillBadgeInstances: initialPillBadge,

      // Base state
      assetInstances: [],
      isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
      alternatives: (props.alternatives as string[]) || [],
      selectedIcons: includeArrow ? [ARROW_ICON_ID] : [],
      iconStates: includeArrow ? { [ARROW_ICON_ID]: arrowIconState } : {},
      shapeInstances: [],
      illustrationInstances: [],
      additionalTexts: [],
    };
  },

  createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => {
    const { width, height } = SLIDER_CONFIG.canvas;

    const getFontColor = () => {
      const state = getState();
      return getSliderColors(state.colorScheme).headlineText;
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
        const colors = getSliderColors(scheme);
        const pillColors = getPillBadgeColorsForScheme(scheme);
        const state = getState();

        // Update arrow icon color to match new scheme
        const updatedIconStates = { ...state.iconStates };
        if (updatedIconStates[ARROW_ICON_ID]) {
          updatedIconStates[ARROW_ICON_ID] = {
            ...updatedIconStates[ARROW_ICON_ID],
            color: colors.arrowFill,
          };
        }

        // Update pill badge colors to match new scheme
        const updatedPillBadges = state.pillBadgeInstances.map((pill) => ({
          ...pill,
          backgroundColor: pillColors.backgroundColor,
          textColor: pillColors.textColor,
        }));

        setState({
          colorScheme: scheme,
          backgroundColor: colors.background,
          iconStates: updatedIconStates,
          pillBadgeInstances: updatedPillBadges,
        } as Partial<SliderState>);
        saveToHistory(getState());
      },

      setBackgroundColor: (color: string) => {
        const scheme: SliderColorScheme = color === '#005538' ? 'tanne-sand' : 'sand-tanne';
        const colors = getSliderColors(scheme);
        const pillColors = getPillBadgeColorsForScheme(scheme);
        const state = getState();

        const updatedIconStates = { ...state.iconStates };
        if (updatedIconStates[ARROW_ICON_ID]) {
          updatedIconStates[ARROW_ICON_ID] = {
            ...updatedIconStates[ARROW_ICON_ID],
            color: colors.arrowFill,
          };
        }

        // Update pill badge colors to match new scheme
        const updatedPillBadges = state.pillBadgeInstances.map((pill) => ({
          ...pill,
          backgroundColor: pillColors.backgroundColor,
          textColor: pillColors.textColor,
        }));

        setState({
          colorScheme: scheme,
          backgroundColor: colors.background,
          iconStates: updatedIconStates,
          pillBadgeInstances: updatedPillBadges,
        } as Partial<SliderState>);
        saveToHistory(getState());
      },

      // Pill badge actions
      addPillBadge: (preset?: string) => {
        const state = getState();
        const pillColors = getPillBadgeColorsForScheme(state.colorScheme);
        const presetId =
          preset ?? (state.colorScheme === 'tanne-sand' ? 'slider-inverted' : 'slider');
        const newPillBadge = createPillBadgeInstance(presetId, {
          backgroundColor: pillColors.backgroundColor,
          textColor: pillColors.textColor,
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

      // Alternatives
      handleSelectAlternative: (alt: string) => {
        setState({ headline: alt } as Partial<SliderState>);
        callbacks.onHeadlineChange?.(alt);
        saveToHistory(getState());
      },
    };
  },
};

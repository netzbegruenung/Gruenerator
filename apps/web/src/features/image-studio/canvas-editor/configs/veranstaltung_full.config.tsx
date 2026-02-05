/**
 * Veranstaltung Full Canvas Configuration
 * Event sharepic with photo, green section, and date circle
 */

import { HiPhotograph } from 'react-icons/hi';
import { PiSquaresFourFill } from 'react-icons/pi';

import { ImageBackgroundSection, AssetsSection } from '../sidebar/sections';
import { CANVAS_RECOMMENDED_ASSETS, type AssetInstance } from '../utils/canvasAssets';
import { VERANSTALTUNG_CONFIG, calculateVeranstaltungLayout } from '../utils/veranstaltungLayout';

import {
  alternativesTab,
  createAlternativesSection,
  isAlternativesEmpty,
} from './alternativesSection';
import {
  createAssetActions,
  createIconActions,
  createShapeActions,
  createIllustrationActions,
} from './factory/commonActions';
import { injectFeatureProps } from './featureInjector';
import { PLACEHOLDER_TEXT } from './placeholders';
import { shareTab, createShareSection } from './shareSection';

import type { StockImageAttribution } from '../../services/imageSourceService';
import type { CircleBadgeInstance, CircleBadgeTextLine } from '../primitives';
import type { FullCanvasConfig, LayoutResult, AdditionalText } from './types';
import type { IllustrationInstance } from '../utils/illustrations/types';
import type { ShapeInstance, ShapeType } from '../utils/shapes';

// ============================================================================
// STATE TYPE
// ============================================================================

export interface VeranstaltungFullState {
  eventTitle: string;
  beschreibung: string;
  weekday: string;
  date: string;
  time: string;
  locationName: string;
  address: string;
  currentImageSrc: string;
  backgroundImageFile?: File | Blob | null;
  imageOffset: { x: number; y: number };
  imageScale: number;
  isBackgroundLocked: boolean;
  customEventTitleFontSize: number | null;
  customBeschreibungFontSize: number | null;
  eventTitleOpacity?: number;
  beschreibungOpacity?: number;
  titleColor?: string;
  beschreibungColor?: string;
  assetInstances: AssetInstance[];
  isDesktop: boolean;
  alternatives: string[];
  // Icons & Shapes
  selectedIcons: string[];
  iconStates: Record<
    string,
    { x: number; y: number; scale: number; rotation: number; color?: string; opacity?: number }
  >;
  shapeInstances: ShapeInstance[];
  selectedShapeId: string | null;
  illustrationInstances: IllustrationInstance[];
  additionalTexts: AdditionalText[];
  // Circle badges (e.g., date circle)
  circleBadgeInstances: CircleBadgeInstance[];
  // Attribution
  imageAttribution?: StockImageAttribution | null;

  [key: string]: unknown;
}

// ============================================================================
// ACTIONS TYPE
// ============================================================================

export interface VeranstaltungFullActions {
  setEventTitle: (val: string) => void;
  setBeschreibung: (val: string) => void;
  handleEventTitleFontSizeChange: (size: number) => void;
  handleBeschreibungFontSizeChange: (size: number) => void;
  setCurrentImageSrc: (file: File | null, objectUrl?: string) => void;
  setImageScale: (scale: number) => void;
  toggleBackgroundLock: () => void;
  addAsset: (assetId: string) => void;
  updateAsset: (id: string, partial: Partial<AssetInstance>) => void;
  removeAsset: (id: string) => void;
  handleSelectAlternative: (alt: string) => void;
  // Icons & Shapes
  toggleIcon: (id: string, selected: boolean) => void;
  updateIcon: (
    id: string,
    partial: {
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      color?: string;
      opacity?: number;
    }
  ) => void;
  addShape: (type: ShapeType) => void;
  updateShape: (id: string, partial: Partial<ShapeInstance>) => void;
  removeShape: (id: string) => void;
  // Illustration actions
  addIllustration: (id: string) => void;
  updateIllustration: (id: string, partial: Partial<IllustrationInstance>) => void;
  removeIllustration: (id: string) => void;
  // Additional Text actions
  addHeader: () => void;
  addText: () => void;
  updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => void;
  removeAdditionalText: (id: string) => void;
  // Attribution actions
  setImageAttribution?: (attribution: StockImageAttribution | null) => void;
  // Circle Badge actions
  updateCircleBadge: (id: string, partial: Partial<CircleBadgeInstance>) => void;
}

// ============================================================================
// LAYOUT CALCULATOR
// ============================================================================

const calculateLayout = (state: VeranstaltungFullState): LayoutResult => {
  const eventTitleFontSize =
    state.customEventTitleFontSize ?? VERANSTALTUNG_CONFIG.eventTitle.fontSize;
  const beschreibungFontSize =
    state.customBeschreibungFontSize ?? VERANSTALTUNG_CONFIG.description.fontSize;
  const layout = calculateVeranstaltungLayout(eventTitleFontSize, beschreibungFontSize);

  // Calculate dynamic positions
  const titleLineHeight = eventTitleFontSize * VERANSTALTUNG_CONFIG.eventTitle.lineHeightRatio;
  const estimatedTitleLines = Math.ceil(state.eventTitle.length / 20);
  const titleHeight = estimatedTitleLines * titleLineHeight;
  const beschreibungY =
    layout.eventTitle.y + titleHeight + VERANSTALTUNG_CONFIG.eventTitle.gapBelow;

  return {
    'event-title': {
      x: layout.eventTitle.x,
      y: layout.eventTitle.y,
      width: VERANSTALTUNG_CONFIG.text.maxWidth,
      fontSize: eventTitleFontSize,
    },
    beschreibung: {
      x: layout.description.x,
      y: beschreibungY,
      width: VERANSTALTUNG_CONFIG.text.maxWidth,
      fontSize: beschreibungFontSize,
    },
    circle: {
      x: layout.circle.x,
      y: layout.circle.y,
    },
    location: {
      x: layout.footer.x,
      y: layout.footer.y,
    },
  };
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create text lines for the date circle badge from weekday, date, and time values
 */
function createDateCircleTextLines(
  weekday: string,
  date: string,
  time: string
): CircleBadgeTextLine[] {
  const circleTextConfig = VERANSTALTUNG_CONFIG.circleText;
  return [
    {
      text: weekday,
      yOffset: circleTextConfig.weekday.yOffset,
      fontFamily: circleTextConfig.weekday.fontFamily,
      fontSize: circleTextConfig.weekday.fontSize,
      fontWeight: 'bold',
    },
    {
      text: date,
      yOffset: circleTextConfig.date.yOffset,
      fontFamily: circleTextConfig.date.fontFamily,
      fontSize: circleTextConfig.date.fontSize,
      fontWeight: 'normal',
    },
    {
      text: time,
      yOffset: circleTextConfig.time.yOffset,
      fontFamily: circleTextConfig.time.fontFamily,
      fontSize: circleTextConfig.time.fontSize,
      fontWeight: 'bold',
    },
  ];
}

/**
 * Create initial date circle badge instance
 */
function createInitialDateCircleBadge(
  weekday: string,
  date: string,
  time: string
): CircleBadgeInstance {
  const circleConfig = VERANSTALTUNG_CONFIG.circle;
  return {
    id: 'date-circle',
    x: circleConfig.centerX,
    y: circleConfig.centerY,
    radius: circleConfig.radius,
    backgroundColor: circleConfig.backgroundColor,
    textColor: circleConfig.textColor,
    rotation: circleConfig.rotation,
    scale: 1,
    opacity: 1,
    textLines: createDateCircleTextLines(weekday, date, time),
  };
}

// ============================================================================
// FULL CONFIG
// ============================================================================

export const veranstaltungFullConfig: FullCanvasConfig<
  VeranstaltungFullState,
  VeranstaltungFullActions
> = {
  id: 'veranstaltung',

  canvas: {
    width: VERANSTALTUNG_CONFIG.canvas.width,
    height: VERANSTALTUNG_CONFIG.canvas.height,
  },

  features: {
    icons: true,
    shapes: true,
  },

  multiPage: {
    enabled: true,
    maxPages: 10,
    heterogeneous: true,
    defaultNewPageState: {
      eventTitle: PLACEHOLDER_TEXT.eventTitle,
      beschreibung: PLACEHOLDER_TEXT.beschreibung,
      weekday: PLACEHOLDER_TEXT.weekday,
      date: PLACEHOLDER_TEXT.date,
      time: PLACEHOLDER_TEXT.time,
      locationName: PLACEHOLDER_TEXT.locationName,
      address: PLACEHOLDER_TEXT.address,
    },
  },

  tabs: [
    { id: 'image', icon: HiPhotograph, label: 'Bild', ariaLabel: 'Bild anpassen' },
    { id: 'assets', icon: PiSquaresFourFill, label: 'Elemente', ariaLabel: 'Dekorative Elemente' },
    alternativesTab,
    shareTab,
  ],

  getVisibleTabs: () => ['image', 'assets', 'alternatives', 'share'],

  getDisabledTabs: (state) =>
    isAlternativesEmpty(state, (s) => s.alternatives) ? ['alternatives'] : [],

  sections: {
    image: {
      component: ImageBackgroundSection,
      propsFactory: (state, actions) => ({
        currentImageSrc: state.currentImageSrc,
        onImageChange: (
          file: File | null,
          objectUrl?: string,
          attribution?: StockImageAttribution | null
        ) => {
          actions.setCurrentImageSrc(file, objectUrl);
          if (attribution !== undefined) actions.setImageAttribution?.(attribution);
        },
        scale: state.imageScale,
        onScaleChange: actions.setImageScale,
        isLocked: state.isBackgroundLocked,
        onToggleLock: actions.toggleBackgroundLock,
      }),
    },
    assets: {
      component: AssetsSection,
      propsFactory: (state, actions, context) => ({
        // Text creation callbacks
        onAddHeader: actions.addHeader,
        onAddText: actions.addText,

        // Asset instance props
        onAddAsset: actions.addAsset,
        recommendedAssetIds: CANVAS_RECOMMENDED_ASSETS['veranstaltung'],

        // Auto-inject all feature props (icons, shapes, illustrations, balken)
        ...injectFeatureProps(state, actions, context),
      }),
    },
    alternatives: createAlternativesSection<VeranstaltungFullState, VeranstaltungFullActions>({
      type: 'string',
      getAlternatives: (s) => s.alternatives,
      getCurrentValue: (s) => s.eventTitle,
      getSelectAction: (a) => a.handleSelectAlternative,
    }),
    share: createShareSection<VeranstaltungFullState>('veranstaltung', (state) =>
      `${state.eventTitle}\n${state.beschreibung}\n${state.weekday} ${state.date} ${state.time}\n${state.locationName}`.trim()
    ),
  },

  // Veranstaltung has complex elements (circle with rotated text, clipped photo)
  // that don't fit the generic element model well. Using simplified elements.
  elements: [
    // Green section background
    {
      id: 'green-section',
      type: 'rect',
      x: 0,
      y: VERANSTALTUNG_CONFIG.greenSection.y,
      order: 1,
      width: VERANSTALTUNG_CONFIG.canvas.width,
      height: VERANSTALTUNG_CONFIG.greenSection.height,
      fill: VERANSTALTUNG_CONFIG.greenSection.color,
      listening: false,
    },
    // Event title
    {
      id: 'event-title',
      type: 'text',
      x: (s: VeranstaltungFullState, l: LayoutResult) => {
        const eventTitle = l['event-title'] as
          | { x?: number; y?: number; fontSize?: number }
          | undefined;
        return eventTitle?.x ?? VERANSTALTUNG_CONFIG.text.leftMargin;
      },
      y: (s: VeranstaltungFullState, l: LayoutResult) => {
        const eventTitle = l['event-title'] as
          | { x?: number; y?: number; fontSize?: number }
          | undefined;
        return eventTitle?.y ?? VERANSTALTUNG_CONFIG.eventTitle.startY;
      },
      order: 3,
      textKey: 'eventTitle',
      width: VERANSTALTUNG_CONFIG.text.maxWidth,
      fontSize: (s: VeranstaltungFullState, l: LayoutResult) => {
        const eventTitle = l['event-title'] as
          | { x?: number; y?: number; fontSize?: number }
          | undefined;
        return eventTitle?.fontSize ?? VERANSTALTUNG_CONFIG.eventTitle.fontSize;
      },
      fontFamily: `${VERANSTALTUNG_CONFIG.eventTitle.fontFamily}, Arial, sans-serif`,
      fontStyle: 'bold italic',
      align: 'left',
      lineHeight: VERANSTALTUNG_CONFIG.eventTitle.lineHeightRatio,
      wrap: 'word',
      editable: true,
      draggable: true,
      fontSizeStateKey: 'customEventTitleFontSize',
      opacity: (state: VeranstaltungFullState) => state.eventTitleOpacity ?? 1,
      opacityStateKey: 'eventTitleOpacity',
      fill: (state: VeranstaltungFullState, _layout: LayoutResult) => state.titleColor ?? '#FFFFFF',
      fillStateKey: 'titleColor',
    },
    // Description
    {
      id: 'beschreibung',
      type: 'text',
      x: (s: VeranstaltungFullState, l: LayoutResult) => {
        const beschreibung = l['beschreibung'] as
          | { x?: number; y?: number; fontSize?: number }
          | undefined;
        return beschreibung?.x ?? VERANSTALTUNG_CONFIG.text.leftMargin;
      },
      y: (s: VeranstaltungFullState, l: LayoutResult) => {
        const beschreibung = l['beschreibung'] as
          | { x?: number; y?: number; fontSize?: number }
          | undefined;
        return beschreibung?.y ?? 750;
      },
      order: 4,
      textKey: 'beschreibung',
      width: VERANSTALTUNG_CONFIG.text.maxWidth,
      fontSize: (s: VeranstaltungFullState, l: LayoutResult) => {
        const beschreibung = l['beschreibung'] as
          | { x?: number; y?: number; fontSize?: number }
          | undefined;
        return beschreibung?.fontSize ?? VERANSTALTUNG_CONFIG.description.fontSize;
      },
      fontFamily: `${VERANSTALTUNG_CONFIG.description.fontFamily}, Arial, sans-serif`,
      fontStyle: 'italic',
      align: 'left',
      lineHeight: VERANSTALTUNG_CONFIG.description.lineHeightRatio,
      wrap: 'word',
      editable: true,
      draggable: true,
      fontSizeStateKey: 'customBeschreibungFontSize',
      opacity: (state: VeranstaltungFullState) => state.beschreibungOpacity ?? 1,
      opacityStateKey: 'beschreibungOpacity',
      fill: (state: VeranstaltungFullState, _layout: LayoutResult) =>
        state.beschreibungColor ?? '#FFFFFF',
      fillStateKey: 'beschreibungColor',
    },
    // Date circle is now rendered via circleBadgeInstances for text support
  ],

  calculateLayout,

  createInitialState: (props: Record<string, unknown>) => {
    const weekday = (props.weekday as string | undefined) ?? '';
    const date = (props.date as string | undefined) ?? '';
    const time = (props.time as string | undefined) ?? '';

    return {
      eventTitle: (props.eventTitle as string | undefined) ?? '',
      beschreibung: (props.beschreibung as string | undefined) ?? '',
      weekday,
      date,
      time,
      locationName: (props.locationName as string | undefined) ?? '',
      address: (props.address as string | undefined) ?? '',
      currentImageSrc: (props.imageSrc as string | undefined) ?? '',
      backgroundImageFile: (props.backgroundImageFile as File | Blob | null | undefined) ?? null,
      imageOffset: { x: 0, y: 0 },
      imageScale: 1,
      isBackgroundLocked: false,
      customEventTitleFontSize: null,
      customBeschreibungFontSize: null,
      eventTitleOpacity: 1,
      beschreibungOpacity: 1,
      assetInstances: [],
      isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
      alternatives:
        (props.alternatives as Array<Record<string, unknown>> | undefined)?.map(
          (a: Record<string, unknown>) => String(a.eventTitle) || ''
        ) ?? [],
      selectedIcons: [],
      iconStates: {},
      shapeInstances: [],
      selectedShapeId: null,
      illustrationInstances: [],
      additionalTexts: [],
      circleBadgeInstances: [createInitialDateCircleBadge(weekday, date, time)],
      imageAttribution: null,
    };
  },

  createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => {
    const { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } = VERANSTALTUNG_CONFIG.canvas;

    // Use common action creators for shared functionality
    const assetActions = createAssetActions(
      getState,
      setState,
      saveToHistory,
      CANVAS_WIDTH,
      CANVAS_HEIGHT
    );

    const iconActions = createIconActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      { defaultColor: '#005538', defaultOpacity: 1 }
    );

    const shapeActions = createShapeActions(
      getState,
      setState,
      saveToHistory,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      '#005538'
    );

    const illustrationActions = createIllustrationActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      CANVAS_WIDTH,
      CANVAS_HEIGHT
    );

    return {
      // === Spread common actions ===
      ...assetActions,
      ...iconActions,
      ...shapeActions,
      ...illustrationActions,

      // === Text Actions ===
      setEventTitle: (val: string) => {
        setState((prev) => ({ ...prev, eventTitle: val }));
        callbacks.onEventTitleChange?.(val);
        debouncedSaveToHistory({ ...getState(), eventTitle: val });
      },
      setBeschreibung: (val: string) => {
        setState((prev) => ({ ...prev, beschreibung: val }));
        callbacks.onBeschreibungChange?.(val);
        debouncedSaveToHistory({ ...getState(), beschreibung: val });
      },
      handleEventTitleFontSizeChange: (size: number) => {
        setState((prev) => ({ ...prev, customEventTitleFontSize: size }));
      },
      handleBeschreibungFontSizeChange: (size: number) => {
        setState((prev) => ({ ...prev, customBeschreibungFontSize: size }));
      },

      // === Image Background Actions ===
      setCurrentImageSrc: (file: File | null, objectUrl?: string) => {
        const src = file ? objectUrl : '';
        setState((prev) => ({
          ...prev,
          currentImageSrc: src ?? '',
          backgroundImageFile: file,
        }));
        saveToHistory({ ...getState(), currentImageSrc: src ?? '', backgroundImageFile: file });
      },
      setImageScale: (scale: number) => {
        setState((prev) => ({ ...prev, imageScale: scale }));
        debouncedSaveToHistory({ ...getState(), imageScale: scale });
      },
      toggleBackgroundLock: () => {
        setState((prev) => ({ ...prev, isBackgroundLocked: !prev.isBackgroundLocked }));
      },
      setImageAttribution: (attribution: StockImageAttribution | null) => {
        setState((prev) => ({ ...prev, imageAttribution: attribution }));
        debouncedSaveToHistory({ ...getState(), imageAttribution: attribution });
      },

      // === Alternative Selection ===
      handleSelectAlternative: (alt: string) => {
        setState((prev) => ({ ...prev, eventTitle: alt }));
        callbacks.onEventTitleChange?.(alt);
        saveToHistory({ ...getState(), eventTitle: alt });
      },

      // === Additional Text Actions (Veranstaltung-specific with GrueneTypeNeue) ===
      addHeader: () => {
        const id = `text-${Date.now()}`;
        const newText: AdditionalText = {
          id,
          text: 'Neue Überschrift',
          type: 'header',
          x: CANVAS_WIDTH / 2,
          y: CANVAS_HEIGHT / 2,
          width: 400,
          fontSize: VERANSTALTUNG_CONFIG.eventTitle.fontSize,
          fontFamily: 'GrueneTypeNeue, Arial, sans-serif',
          fontStyle: 'normal',
          fill: VERANSTALTUNG_CONFIG.text.color,
          rotation: 0,
          scale: 1,
        };
        setState((prev) => ({
          ...prev,
          additionalTexts: [...(prev.additionalTexts || []), newText],
        }));
        saveToHistory({
          ...getState(),
          additionalTexts: [...(getState().additionalTexts || []), newText],
        });
      },
      addText: () => {
        const id = `text-${Date.now()}`;
        const newText: AdditionalText = {
          id,
          text: 'Neuer Text',
          type: 'body',
          x: CANVAS_WIDTH / 2,
          y: CANVAS_HEIGHT / 2 + 100,
          width: 400,
          fontSize: VERANSTALTUNG_CONFIG.description.fontSize,
          fontFamily: 'PT Sans, Arial, sans-serif',
          fontStyle: 'italic',
          fill: VERANSTALTUNG_CONFIG.text.color,
          rotation: 0,
          scale: 1,
        };
        setState((prev) => ({
          ...prev,
          additionalTexts: [...(prev.additionalTexts || []), newText],
        }));
        saveToHistory({
          ...getState(),
          additionalTexts: [...(getState().additionalTexts || []), newText],
        });
      },
      updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => {
        setState((prev) => ({
          ...prev,
          additionalTexts: (prev.additionalTexts || []).map((t) =>
            t.id === id ? { ...t, ...partial } : t
          ),
        }));
        debouncedSaveToHistory({ ...getState() });
      },
      removeAdditionalText: (id: string) => {
        setState((prev) => ({
          ...prev,
          additionalTexts: (prev.additionalTexts || []).filter((t) => t.id !== id),
        }));
        saveToHistory({ ...getState() });
      },

      // === Circle Badge Actions ===
      updateCircleBadge: (id: string, partial: Partial<CircleBadgeInstance>) => {
        setState((prev) => ({
          ...prev,
          circleBadgeInstances: prev.circleBadgeInstances.map((badge) =>
            badge.id === id ? { ...badge, ...partial } : badge
          ),
        }));
        debouncedSaveToHistory({ ...getState() });
      },
    };
  },
};

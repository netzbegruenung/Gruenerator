/**
 * Presentation Slide State & Action Types
 *
 * Shared types for all 3 presentation layout configs (title, image, content).
 * Extends BaseCanvasState so every slide gets icons, shapes, badges, etc. for free.
 */

import type { StockImageAttribution } from '../../common/imageSourceTypes';
import type { AdditionalText } from '../types';
import type {
  BaseCanvasState,
  BaseCanvasActions,
  ImageBackgroundActions,
  ColorBackgroundActions,
} from '../factory/baseTypes';
import { getPresColors, type PresentationColorMode } from './presentationTheme';

// ============================================================================
// STATE
// ============================================================================

export interface PresentationSlideState extends BaseCanvasState {
  // Text fields
  title: string;
  subtitle: string;
  bodyText: string;
  bodyText2: string;

  // Appearance
  colorMode: PresentationColorMode;
  backgroundColor: string;

  // Image background (for pres-image layout)
  currentImageSrc: string;
  backgroundImageFile?: File | Blob | null;
  imageOffset: { x: number; y: number };
  imageScale: number;
  isBackgroundLocked?: boolean;
  backgroundImageOpacity?: number;
  imageAttribution?: StockImageAttribution | null;

  // Footer
  footerDate: string;
  footerCustomText: string;
  showSlideNumber: boolean;
  slideNumber: number;

  // Font size overrides
  customTitleFontSize: number | null;
  customSubtitleFontSize: number | null;
  customBodyFontSize: number | null;
  customBody2FontSize: number | null;

  // Text styling overrides
  titleColor?: string;
  subtitleColor?: string;
  bodyTextColor?: string;
  bodyText2Color?: string;
  titleOpacity?: number;
  subtitleOpacity?: number;
  bodyTextOpacity?: number;
  bodyText2Opacity?: number;
}

// ============================================================================
// ACTIONS
// ============================================================================

export interface PresentationSlideActions
  extends BaseCanvasActions, ImageBackgroundActions, ColorBackgroundActions {
  // Text setters
  setTitle: (val: string) => void;
  setSubtitle: (val: string) => void;
  setBodyText: (val: string) => void;
  setBodyText2: (val: string) => void;

  // Font size handlers
  handleTitleFontSizeChange: (size: number) => void;
  handleSubtitleFontSizeChange: (size: number) => void;
  handleBodyFontSizeChange: (size: number) => void;
  handleBody2FontSizeChange: (size: number) => void;

  // Appearance
  setColorMode: (mode: PresentationColorMode) => void;

  // Footer
  setFooterDate: (val: string) => void;
  setFooterCustomText: (val: string) => void;
  setShowSlideNumber: (val: boolean) => void;
}

// ============================================================================
// INITIAL STATE FACTORY
// ============================================================================

export function createPresentationInitialState(
  props: Record<string, unknown>,
  defaultColorMode: PresentationColorMode = 'light'
): PresentationSlideState {
  const colorMode = (props.colorMode as PresentationColorMode) || defaultColorMode;
  const colors = getPresColors(colorMode);

  return {
    // Text
    title: (props.title as string) || '',
    subtitle: (props.subtitle as string) || '',
    bodyText: (props.bodyText as string) || '',
    bodyText2: (props.bodyText2 as string) || '',

    // Appearance
    colorMode,
    backgroundColor: colors.background,

    // Image background (defaults for non-image layouts)
    currentImageSrc: (props.currentImageSrc as string) || '',
    imageOffset: (props.imageOffset as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
    imageScale: (props.imageScale as number | undefined) ?? 1,
    imageAttribution: (props.imageAttribution as StockImageAttribution | null | undefined) ?? null,

    // Footer
    footerDate: (props.footerDate as string) || '',
    footerCustomText: (props.footerCustomText as string) || '',
    showSlideNumber: (props.showSlideNumber as boolean) ?? true,
    slideNumber: (props.slideNumber as number) || 1,

    // Font overrides
    customTitleFontSize: null,
    customSubtitleFontSize: null,
    customBodyFontSize: null,
    customBody2FontSize: null,

    // Base state
    assetInstances: [],
    isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
    selectedIcons: [],
    iconStates: {},
    shapeInstances: [],
    illustrationInstances: [],
    additionalTexts: (props.additionalTexts as AdditionalText[]) || [],
    pillBadgeInstances: [],
    circleBadgeInstances: [],
    balkenInstances: [],
    frameInstances: [],
    userImageInstances: [],
  };
}

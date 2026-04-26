/**
 * Shared Presentation Actions Factory
 *
 * Eliminates ~80 lines of duplicated action creators across
 * presTitle, presImage, and presContent configs.
 * Only image background actions differ between configs.
 */

import { createBaseActions } from '../factory/commonActions';

import { getPresColors } from './presentationTheme';

import type { PresentationSlideState, PresentationSlideActions } from './presentationTypes';
import type { PresentationColorMode } from './presentationTheme';
import type { StockImageAttribution } from '../../common/imageSourceTypes';

interface CreatePresentationActionsOptions {
  canvasWidth: number;
  canvasHeight: number;
  getFontColor: (state: PresentationSlideState) => string;
  hasImageBackground?: boolean;
}

export function createPresentationActions(
  getState: () => PresentationSlideState,
  setState: (
    partial:
      | Partial<PresentationSlideState>
      | ((prev: PresentationSlideState) => PresentationSlideState)
  ) => void,
  saveToHistory: (state: PresentationSlideState) => void,
  debouncedSaveToHistory: (state: PresentationSlideState) => void,
  callbacks: Record<string, ((val: unknown) => void) | undefined>,
  options: CreatePresentationActionsOptions
): PresentationSlideActions {
  const { canvasWidth, canvasHeight, getFontColor, hasImageBackground } = options;

  const baseActions = createBaseActions(
    getState,
    setState,
    saveToHistory,
    debouncedSaveToHistory,
    canvasWidth,
    canvasHeight,
    getFontColor(getState())
  );

  return {
    ...baseActions,

    setTitle: (val: string) => {
      setState({ title: val } as Partial<PresentationSlideState>);
      callbacks.onTitleChange?.(val);
      debouncedSaveToHistory(getState());
    },
    setSubtitle: (val: string) => {
      setState({ subtitle: val } as Partial<PresentationSlideState>);
      debouncedSaveToHistory(getState());
    },
    setBodyText: (val: string) => {
      setState({ bodyText: val } as Partial<PresentationSlideState>);
      debouncedSaveToHistory(getState());
    },
    setBodyText2: (val: string) => {
      setState({ bodyText2: val } as Partial<PresentationSlideState>);
      debouncedSaveToHistory(getState());
    },

    handleTitleFontSizeChange: (size: number) => {
      setState({ customTitleFontSize: size } as Partial<PresentationSlideState>);
      debouncedSaveToHistory(getState());
    },
    handleSubtitleFontSizeChange: (size: number) => {
      setState({ customSubtitleFontSize: size } as Partial<PresentationSlideState>);
      debouncedSaveToHistory(getState());
    },
    handleBodyFontSizeChange: (size: number) => {
      setState({ customBodyFontSize: size } as Partial<PresentationSlideState>);
      debouncedSaveToHistory(getState());
    },
    handleBody2FontSizeChange: (size: number) => {
      setState({ customBody2FontSize: size } as Partial<PresentationSlideState>);
      debouncedSaveToHistory(getState());
    },

    setColorMode: (mode: PresentationColorMode) => {
      const colors = getPresColors(mode);
      setState({
        colorMode: mode,
        backgroundColor: colors.background,
      } as Partial<PresentationSlideState>);
      debouncedSaveToHistory(getState());
    },

    setBackgroundColor: (color: string) => {
      setState({ backgroundColor: color } as Partial<PresentationSlideState>);
      debouncedSaveToHistory(getState());
    },

    // Image background — real implementation or no-op depending on config
    setCurrentImageSrc: hasImageBackground
      ? (file: File | null, objectUrl?: string) => {
          if (file && objectUrl) {
            setState({
              currentImageSrc: objectUrl,
              backgroundImageFile: file,
              imageOffset: { x: 0, y: 0 },
              imageScale: 1,
            } as Partial<PresentationSlideState>);
          } else {
            setState({
              currentImageSrc: '',
              backgroundImageFile: null,
            } as Partial<PresentationSlideState>);
          }
          saveToHistory(getState());
        }
      : () => {},
    setImageScale: hasImageBackground
      ? (scale: number) => {
          setState({ imageScale: scale } as Partial<PresentationSlideState>);
          debouncedSaveToHistory(getState());
        }
      : () => {},
    setImageAttribution: hasImageBackground
      ? (attribution: StockImageAttribution | null) => {
          setState({ imageAttribution: attribution } as Partial<PresentationSlideState>);
        }
      : undefined,

    setFooterDate: (val: string) => {
      setState({ footerDate: val } as Partial<PresentationSlideState>);
      debouncedSaveToHistory(getState());
    },
    setFooterCustomText: (val: string) => {
      setState({ footerCustomText: val } as Partial<PresentationSlideState>);
      debouncedSaveToHistory(getState());
    },
    setShowSlideNumber: (val: boolean) => {
      setState({ showSlideNumber: val } as Partial<PresentationSlideState>);
      debouncedSaveToHistory(getState());
    },
  };
}

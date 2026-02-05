/**
 * Common Action Creators for Canvas Factory
 *
 * Reusable action creator functions that work with any canvas state.
 * These eliminate the need to duplicate action logic across configs.
 */

import { v4 as uuid } from 'uuid';

import { createAssetInstance } from '../../utils/canvasAssets';
import { createIllustration } from '../../utils/illustrations/registry';
import { BRAND_COLORS, createShape } from '../../utils/shapes';

import type { IconState, BaseCanvasState } from './baseTypes';
import type { AssetInstance } from '../../utils/canvasAssets';
import type { IllustrationInstance } from '../../utils/illustrations/types';
import type { ShapeInstance, ShapeType } from '../../utils/shapes';
import type { AdditionalText } from '../types';

// ============================================================================
// TYPE HELPERS
// ============================================================================

type StateSetter<TState> = (partial: Partial<TState> | ((prev: TState) => TState)) => void;
type HistorySaver<TState> = (state: TState) => void;

// ============================================================================
// ASSET ACTIONS
// ============================================================================

export function createAssetActions<TState extends { assetInstances: AssetInstance[] }>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number
) {
  return {
    addAsset: (assetId: string) => {
      const newInstance = createAssetInstance(assetId, canvasWidth, canvasHeight);
      setState((prev) => ({
        ...prev,
        assetInstances: [...prev.assetInstances, newInstance],
      }));
      saveToHistory(getState());
    },
    updateAsset: (id: string, partial: Partial<AssetInstance>) => {
      setState((prev) => ({
        ...prev,
        assetInstances: prev.assetInstances.map((a) => (a.id === id ? { ...a, ...partial } : a)),
      }));
    },
    removeAsset: (id: string) => {
      setState((prev) => ({
        ...prev,
        assetInstances: prev.assetInstances.filter((a) => a.id !== id),
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// ICON ACTIONS
// ============================================================================

export interface IconActionsConfig {
  defaultColor?: string;
  defaultOpacity?: number;
}

export function createIconActions<
  TState extends { selectedIcons: string[]; iconStates: Record<string, IconState> },
>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number,
  config: IconActionsConfig = {}
) {
  const { defaultColor, defaultOpacity = 1 } = config;

  return {
    toggleIcon: (id: string, selected: boolean) => {
      if (selected) {
        const newIconState: IconState = {
          x: canvasWidth / 2,
          y: canvasHeight / 2,
          scale: 1,
          rotation: 0,
          ...(defaultColor ? { color: defaultColor } : {}),
          opacity: defaultOpacity,
        };
        setState((prev) => ({
          ...prev,
          selectedIcons: [...prev.selectedIcons, id],
          iconStates: { ...prev.iconStates, [id]: newIconState },
        }));
      } else {
        setState((prev) => {
          const { [id]: _, ...restStates } = prev.iconStates;
          return {
            ...prev,
            selectedIcons: prev.selectedIcons.filter((i) => i !== id),
            iconStates: restStates,
          };
        });
      }
      saveToHistory(getState());
    },
    updateIcon: (id: string, partial: Partial<IconState>) => {
      setState((prev) => ({
        ...prev,
        iconStates: {
          ...prev.iconStates,
          [id]: { ...prev.iconStates[id], ...partial },
        },
      }));
      debouncedSaveToHistory(getState());
    },
    handleIconDragEnd: (id: string, x: number, y: number) => {
      setState((prev) => ({
        ...prev,
        iconStates: {
          ...prev.iconStates,
          [id]: { ...prev.iconStates[id], x, y },
        },
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// SHAPE ACTIONS
// ============================================================================

export function createShapeActions<TState extends { shapeInstances: ShapeInstance[] }>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number,
  defaultColor: string = BRAND_COLORS[0].value
) {
  return {
    addShape: (type: ShapeType) => {
      const newShape = createShape(type, canvasWidth / 2, canvasHeight / 2, defaultColor);
      setState((prev) => ({
        ...prev,
        shapeInstances: [...prev.shapeInstances, newShape],
      }));
      saveToHistory(getState());
    },
    updateShape: (id: string, partial: Partial<ShapeInstance>) => {
      setState((prev) => ({
        ...prev,
        shapeInstances: prev.shapeInstances.map((s) => (s.id === id ? { ...s, ...partial } : s)),
      }));
    },
    removeShape: (id: string) => {
      setState((prev) => ({
        ...prev,
        shapeInstances: prev.shapeInstances.filter((s) => s.id !== id),
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// ILLUSTRATION ACTIONS
// ============================================================================

export function createIllustrationActions<
  TState extends { illustrationInstances: IllustrationInstance[] },
>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number
) {
  return {
    addIllustration: (id: string) => {
      void createIllustration(id, canvasWidth, canvasHeight).then((newIllustration) => {
        if (!newIllustration) return;
        setState((prev) => ({
          ...prev,
          illustrationInstances: [...prev.illustrationInstances, newIllustration],
        }));
        saveToHistory(getState());
      });
    },
    updateIllustration: (id: string, partial: Partial<IllustrationInstance>) => {
      setState((prev) => ({
        ...prev,
        illustrationInstances: prev.illustrationInstances.map((i) =>
          i.id === id ? { ...i, ...partial } : i
        ),
      }));
      debouncedSaveToHistory(getState());
    },
    removeIllustration: (id: string) => {
      setState((prev) => ({
        ...prev,
        illustrationInstances: prev.illustrationInstances.filter((i) => i.id !== id),
      }));
      saveToHistory(getState());
    },
    duplicateIllustration: (illustrationId: string) => {
      const original = getState().illustrationInstances.find((i) => i.id === illustrationId);
      if (!original) return;

      const duplicate: IllustrationInstance = {
        ...original,
        id: `illustration-${Date.now()}`,
        x: original.x + 20,
        y: original.y + 20,
      };

      setState((prev) => ({
        ...prev,
        illustrationInstances: [...prev.illustrationInstances, duplicate],
      }));
      saveToHistory(getState());
    },
    handleIllustrationDragEnd: (illustrationId: string, x: number, y: number) => {
      setState((prev) => ({
        ...prev,
        illustrationInstances: prev.illustrationInstances.map((i) =>
          i.id === illustrationId ? { ...i, x, y } : i
        ),
      }));
      saveToHistory(getState());
    },
    handleIllustrationTransformEnd: (
      illustrationId: string,
      width: number,
      height: number,
      rotation?: number
    ) => {
      setState((prev) => ({
        ...prev,
        illustrationInstances: prev.illustrationInstances.map((i) =>
          i.id === illustrationId
            ? { ...i, width, height, ...(rotation !== undefined ? { rotation } : {}) }
            : i
        ),
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// ADDITIONAL TEXT ACTIONS
// ============================================================================

const ADDITIONAL_TEXT_DEFAULTS = {
  header: {
    fontSize: 48,
    fontFamily: 'GrueneTypeNeue, Arial, sans-serif',
    fontStyle: 'normal' as const,
    width: 400,
  },
  body: {
    fontSize: 32,
    fontFamily: 'PT Sans, Arial, sans-serif',
    width: 400,
  },
};

export function createAdditionalTextActions<TState extends { additionalTexts: AdditionalText[] }>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number,
  fontColor: string = '#ffffff'
) {
  return {
    addHeader: () => {
      const newText: AdditionalText = {
        id: uuid(),
        text: 'Überschrift',
        type: 'header',
        x: canvasWidth / 2 - 200,
        y: canvasHeight / 3,
        ...ADDITIONAL_TEXT_DEFAULTS.header,
        fill: fontColor,
      };
      setState((prev) => ({
        ...prev,
        additionalTexts: [...prev.additionalTexts, newText],
      }));
      saveToHistory(getState());
    },
    addText: () => {
      const newText: AdditionalText = {
        id: uuid(),
        text: 'Text hier eingeben',
        type: 'body',
        x: canvasWidth / 2 - 200,
        y: canvasHeight / 2,
        ...ADDITIONAL_TEXT_DEFAULTS.body,
        fill: fontColor,
      };
      setState((prev) => ({
        ...prev,
        additionalTexts: [...prev.additionalTexts, newText],
      }));
      saveToHistory(getState());
    },
    updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => {
      setState((prev) => ({
        ...prev,
        additionalTexts: prev.additionalTexts.map((t) => (t.id === id ? { ...t, ...partial } : t)),
      }));
    },
    removeAdditionalText: (id: string) => {
      setState((prev) => ({
        ...prev,
        additionalTexts: prev.additionalTexts.filter((t) => t.id !== id),
      }));
      saveToHistory(getState());
    },
  };
}

// ============================================================================
// COMBINED BASE ACTIONS
// ============================================================================

export function createBaseActions<TState extends BaseCanvasState>(
  getState: () => TState,
  setState: StateSetter<TState>,
  saveToHistory: HistorySaver<TState>,
  debouncedSaveToHistory: HistorySaver<TState>,
  canvasWidth: number,
  canvasHeight: number,
  fontColor?: string
) {
  return {
    ...createAssetActions(getState, setState, saveToHistory, canvasWidth, canvasHeight),
    ...createIconActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      canvasWidth,
      canvasHeight
    ),
    ...createShapeActions(getState, setState, saveToHistory, canvasWidth, canvasHeight),
    ...createIllustrationActions(
      getState,
      setState,
      saveToHistory,
      debouncedSaveToHistory,
      canvasWidth,
      canvasHeight
    ),
    ...createAdditionalTextActions(
      getState,
      setState,
      saveToHistory,
      canvasWidth,
      canvasHeight,
      fontColor
    ),
  };
}

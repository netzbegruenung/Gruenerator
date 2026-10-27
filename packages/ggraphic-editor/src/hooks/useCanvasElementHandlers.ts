// SPDX-License-Identifier: MPL-2.0
import { useCallback, useMemo } from 'react';

import { type LiftedBlock } from '../blocks/liftedBlock';
import { resolveValue } from '../utils/canvasValueResolver';
import {
  isTemplateElementRotatable,
  templatePositionUpdates,
  withTemplateRotation,
} from '../utils/templateRotation';

import type { FullCanvasConfig, LayoutResult, AdditionalText } from '../configs/types';
import type { CircleBadgeInstance } from '@ggraphic/editor/primitives/CircleBadge';
import type { BalkenMode } from '@ggraphic/editor/utils/balkenUtils';
import type { ChartInstance, ChartType } from '@ggraphic/editor/utils/chartTypes';
import type { FrameClipType, FrameInstance } from '@ggraphic/editor/utils/frameUtils';
import type { PillBadgeInstance } from '@ggraphic/editor/utils/pillBadgeUtils';
import type { ShapeInstance, ShapeType } from '@ggraphic/editor/utils/shapes';
import type {
  ElementPlacement,
  UserImageInstance,
  UserImagePlacement,
} from '@ggraphic/editor/utils/userImageUtils';
import type { StickerRef } from '@ggraphic/schema';

/**
 * Canvas Element Handlers - Handlers for all element interactions
 *
 * Manages interactions for config elements (text, image), balkens, icons, shapes,
 * and additional texts. Handles selection, text changes, position changes, transforms, etc.
 */

/**
 * Optional canvas action methods that may be present in specific configs
 */
export interface OptionalCanvasActions {
  updateBalken?: (
    id: string,
    attrs: Partial<{
      offset: { x: number; y: number };
      scale?: number;
      rotation?: number;
      opacity?: number;
    }>
  ) => void;
  setBalkenText?: (id: string, index: number, text: string) => void;
  updateIcon?: (
    id: string,
    attrs: Partial<{
      x: number;
      y: number;
      scale?: number;
      rotation?: number;
      color?: string;
      opacity?: number;
      flipX?: boolean;
      flipY?: boolean;
    }>
  ) => void;
  updateShape?: (id: string, attrs: Partial<ShapeInstance>) => void;
  updateIllustration?: (
    id: string,
    attrs: Partial<{
      x: number;
      y: number;
      scale?: number;
      rotation?: number;
      color?: string;
      opacity?: number;
      flipX?: boolean;
      flipY?: boolean;
    }>
  ) => void;
  updateAsset?: (
    id: string,
    attrs: Partial<{
      x: number;
      y: number;
      scale?: number;
      rotation?: number;
      opacity?: number;
      flipX?: boolean;
      flipY?: boolean;
    }>
  ) => void;
  updateAdditionalText?: (id: string, attrs: Partial<AdditionalText>) => void;
  updateCircleBadge?: (id: string, attrs: Partial<CircleBadgeInstance>) => void;
  updatePillBadge?: (id: string, attrs: Partial<PillBadgeInstance>) => void;
  updateFrame?: (id: string, attrs: Partial<FrameInstance>) => void;
  setFrameImage?: (id: string, file: File, objectUrl: string) => void;
  addUserImageFromUrl?: (url: string, fileName: string, options?: UserImagePlacement) => void;
  updateUserImage?: (id: string, attrs: Partial<UserImageInstance>) => void;
  updateChart?: (id: string, attrs: Partial<ChartInstance>) => void;

  // Add actions a dragged Elemente tile is dropped with (GenericCanvas `dropElement`).
  addAsset?: (assetId: string, options?: ElementPlacement) => void;
  /** Adds a block (`blocks/liftedBlock.ts`) as one history entry (freeform pages). */
  insertBlock?: (block: LiftedBlock) => void;
  addStickerAsset?: (ref: StickerRef, options?: ElementPlacement) => void;
  addShape?: (type: ShapeType, color?: string, options?: ElementPlacement) => void;
  addIllustration?: (id: string, options?: ElementPlacement) => void;
  addChart?: (chartType: ChartType, options?: ElementPlacement) => void;
  addFrame?: (clipType: FrameClipType, options?: ElementPlacement) => void;
  addBalken?: (mode: BalkenMode, options?: ElementPlacement) => void;

  // Removal / toggle actions (consumed by useCanvasKeyboardHandlers for
  // delete-key shortcuts; same factory-provided implementations).
  removeBalken?: (id: string) => void;
  toggleIcon?: (id: string, enabled: boolean, options?: ElementPlacement) => void;
  removeShape?: (id: string) => void;
  removeAdditionalText?: (id: string) => void;
  removeIllustration?: (id: string) => void;
  removeAsset?: (id: string) => void;
  removePillBadge?: (id: string) => void;
  removeCircleBadge?: (id: string) => void;
  removeFrame?: (id: string) => void;
  removeUserImage?: (id: string) => void;
  removeChart?: (id: string) => void;
  /**
   * Gehört das Element zur Vorlage, obwohl es in einer Sammlung liegt (der
   * Balken einer Dreizeilen-Vorlage, aus den drei Zeilen abgeleitet)? Dann lässt es
   * sich nicht löschen — siehe `findElementRemover`.
   */
  isTemplateBound?: (id: string) => boolean;
}

export interface UseCanvasElementHandlersOptions<
  TState extends Record<string, unknown>,
  TActions extends OptionalCanvasActions = OptionalCanvasActions,
> {
  config: FullCanvasConfig<TState, TActions>;
  state: TState;
  setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void;
  actions: TActions;
  layout: LayoutResult;
  callbacks: Record<string, ((val: unknown) => void) | undefined>;
  selectElement: (id: string) => void;
  updateElementPosition: (id: string, x: number, y: number, w: number, h: number) => void;
  /** Snapshots the committed state; the argument is ignored (`useCanvasHistorySetup`). */
  saveToHistory: (state?: TState) => void;
  debouncedSaveToHistory: (state?: TState) => void;
}

export interface UseCanvasElementHandlersResult {
  handleElementSelect: (id: string) => void;
  handleTextChange: (id: string, text: string) => void;
  handleFontSizeChange: (id: string, size: number) => void;
  handleElementPositionChange: (id: string, x: number, y: number, w: number, h: number) => void;
  handleImageDragEnd: (id: string, x: number, y: number) => void;
  handleImageTransformEnd: (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    rotation: number
  ) => void;
  /** Vorlagen-Text nach dem Transformer: Position und Drehung als ein Schritt. */
  handleTemplateTransformEnd: (id: string, x: number, y: number, rotation: number) => void;
  handleBalkenSelect: (id: string) => void;
  handleBalkenDragEnd: (id: string, x: number, y: number) => void;
  handleBalkenTransformEnd: (
    id: string,
    x: number,
    y: number,
    scale: number,
    rotation: number
  ) => void;
  handleBalkenTextChange: (id: string, index: number, text: string) => void;
  handleIconDragEnd: (id: string, x: number, y: number) => void;
  handleIconTransformEnd: (
    id: string,
    x: number,
    y: number,
    scale: number,
    rotation: number
  ) => void;
  handleShapeChange: (id: string, newAttrs: Partial<ShapeInstance>) => void;
  handleAdditionalTextChange: (id: string, newAttrs: Partial<AdditionalText>) => void;
  handleCircleBadgeSelect: (id: string) => void;
  handleCircleBadgeDragEnd: (id: string, x: number, y: number) => void;
  handleCircleBadgeTransformEnd: (
    id: string,
    x: number,
    y: number,
    scale: number,
    rotation: number
  ) => void;
  handleCircleBadgeTextLineChange: (id: string, lineIndex: number, text: string) => void;
  handlePillBadgeSelect: (id: string) => void;
  handlePillBadgeTextChange: (id: string, text: string) => void;
  handlePillBadgeDragEnd: (id: string, x: number, y: number) => void;
  handlePillBadgeTransformEnd: (
    id: string,
    x: number,
    y: number,
    scale: number,
    rotation: number
  ) => void;
  handleAssetDragEnd: (id: string, x: number, y: number) => void;
  handleAssetTransformEnd: (
    id: string,
    x: number,
    y: number,
    scale: number,
    rotation: number
  ) => void;
  handleIllustrationDragEnd: (id: string, x: number, y: number) => void;
  handleIllustrationTransformEnd: (
    id: string,
    x: number,
    y: number,
    scale: number,
    rotation: number
  ) => void;
  handleFrameChange: (id: string, newAttrs: Partial<FrameInstance>) => void;
  handleFrameImageUpload: (id: string, file: File, objectUrl: string) => void;
  handleUserImageDragEnd: (id: string, x: number, y: number) => void;
  handleUserImageCropEnd: (id: string, patch: Partial<UserImageInstance>) => void;
  handleUserImageTransformEnd: (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number
  ) => void;
  handleChartDragEnd: (id: string, x: number, y: number) => void;
  handleChartTransformEnd: (
    id: string,
    x: number,
    y: number,
    scale: number,
    rotation: number
  ) => void;
}

/**
 * Helper to safely access state array property
 */
function getStateArray<T>(state: unknown, key: string): T[] {
  const stateObj = state as Record<string, unknown>;
  const value = stateObj[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Hook to handle all canvas element interactions
 */
export function useCanvasElementHandlers<
  TState extends Record<string, unknown>,
  TActions extends OptionalCanvasActions = OptionalCanvasActions,
>(options: UseCanvasElementHandlersOptions<TState, TActions>): UseCanvasElementHandlersResult {
  const {
    config,
    state,
    setState,
    actions,
    layout,
    callbacks,
    selectElement,
    updateElementPosition,
    saveToHistory,
    debouncedSaveToHistory,
  } = options;

  const handleElementSelect = useCallback(
    (id: string) => {
      selectElement(id);
    },
    [selectElement]
  );

  const handleTextChange = useCallback(
    (id: string, text: string) => {
      const elementConfig = config.elements.find((e) => e.id === id);
      if (elementConfig && elementConfig.type === 'text') {
        const textKey = elementConfig.textKey;
        setState((prev) => ({ ...prev, [textKey]: text }));

        const callbackKey = `on${textKey.charAt(0).toUpperCase() + textKey.slice(1)}Change`;
        callbacks[callbackKey]?.(text);

        debouncedSaveToHistory({ ...state, [textKey]: text });
      }
    },
    [config.elements, setState, callbacks, debouncedSaveToHistory, state]
  );

  const handleFontSizeChange = useCallback(
    (id: string, size: number) => {
      const elementConfig = config.elements.find((e) => e.id === id);
      if (elementConfig && elementConfig.type === 'text' && elementConfig.fontSizeStateKey) {
        const key = elementConfig.fontSizeStateKey;
        setState((prev) => ({ ...prev, [key]: size }));
        debouncedSaveToHistory();
        return;
      }

      const additionalTexts = getStateArray<{ id: string }>(state, 'additionalTexts');
      if (additionalTexts.find((t) => t.id === id)) {
        // updateAdditionalText saves history itself with the post-change state
        actions.updateAdditionalText?.(id, { fontSize: size });
      }
    },
    [config.elements, state, actions, setState, debouncedSaveToHistory]
  );

  const handleElementPositionChange = useCallback(
    (id: string, x: number, y: number, w: number, h: number) => {
      updateElementPosition(id, x, y, w, h);

      const elementConfig = config.elements.find((e) => e.id === id);
      if (elementConfig && elementConfig.type === 'text') {
        const positionStateKey = elementConfig.positionStateKey as string | undefined;
        if (positionStateKey) {
          setState((prev) => ({ ...prev, [positionStateKey]: { x, y } }));
        }
      }
    },
    [config.elements, updateElementPosition, setState]
  );

  const handleImageDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      const elementConfig = config.elements.find((e) => e.id === id);
      if (!elementConfig || elementConfig.type !== 'image') return;

      // Absolute Position gewinnt, wenn die Vorlage einen Schluessel dafuer
      // nennt: layoutgebundene Bilder (Pfeil der Info-Vorlage) haben keine
      // sinnvolle Basis fuer ein Offset, weil sich die Basis mit dem Text
      // verschiebt. Ohne einen der beiden Schluessel bleibt der Zug fluechtig.
      if (elementConfig.positionStateKey) {
        const key = elementConfig.positionStateKey;
        setState((prev) => ({ ...prev, [key]: { x, y } }));
        saveToHistory();
        return;
      }

      if (elementConfig.offsetKey) {
        const baseX = resolveValue<number, TState>(elementConfig.x, state, layout);
        const baseY = resolveValue<number, TState>(elementConfig.y, state, layout);
        const newOffset = { x: x - baseX, y: y - baseY };
        setState((prev) => ({ ...prev, [elementConfig.offsetKey!]: newOffset }));
        saveToHistory({ ...state, [elementConfig.offsetKey!]: newOffset });
      }
    },
    [config.elements, setState, saveToHistory, state, layout]
  );

  const handleImageTransformEnd = useCallback(
    (id: string, x: number, y: number, w: number, h: number, rotation: number) => {
      const elementConfig = config.elements.find((e) => e.id === id);
      if (elementConfig && elementConfig.type === 'image') {
        // Offset (relative to the layout base, as the drag writes it) and absolute position
        const updates = templatePositionUpdates(elementConfig, x, y, state, layout);

        // Handle scale-based sizing
        if (elementConfig.scaleKey) {
          const baseWidth = typeof elementConfig.width === 'number' ? elementConfig.width : 100;
          const currentScale = (state[elementConfig.scaleKey as keyof TState] as number) || 1;
          const newScale = currentScale * (w / (baseWidth * currentScale));
          updates[elementConfig.scaleKey] = newScale;
        }

        // Handle absolute size
        if (elementConfig.sizeStateKey) {
          updates[elementConfig.sizeStateKey] = { w, h };
        }

        // Rotation rides in the same update and the same history entry as the
        // position it shifted: one undo restores both.
        const rotatable = isTemplateElementRotatable(elementConfig);
        if (Object.keys(updates).length > 0) {
          setState(
            (prev) =>
              ({
                ...prev,
                ...updates,
                ...(rotatable
                  ? { templateRotations: withTemplateRotation(prev, id, rotation) }
                  : {}),
              }) as TState
          );
          saveToHistory({ ...state, ...updates } as TState);
        }
      }
    },
    [config.elements, setState, saveToHistory, state, layout]
  );

  const handleTemplateTransformEnd = useCallback(
    (id: string, x: number, y: number, rotation: number) => {
      const elementConfig = config.elements.find((e) => e.id === id);
      if (elementConfig?.type !== 'text' || !isTemplateElementRotatable(elementConfig)) return;
      const positionStateKey = elementConfig.positionStateKey as string | undefined;
      if (!positionStateKey) return;
      setState(
        (prev) =>
          ({
            ...prev,
            [positionStateKey]: { x, y },
            templateRotations: withTemplateRotation(prev, id, rotation),
          }) as TState
      );
      // The argument is ignored: the entry snapshots the committed state.
      saveToHistory(state);
    },
    [config.elements, setState, saveToHistory, state]
  );

  const handleBalkenSelect = useCallback(
    (id: string) => {
      selectElement(id);
    },
    [selectElement]
  );

  const handleBalkenDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      if (actions.updateBalken) {
        actions.updateBalken(id, { offset: { x, y } });
      }
    },
    [actions]
  );

  const handleBalkenTransformEnd = useCallback(
    (id: string, x: number, y: number, scale: number, rotation: number) => {
      if (actions.updateBalken) {
        actions.updateBalken(id, { offset: { x, y }, scale, rotation });
      }
    },
    [actions]
  );

  const handleBalkenTextChange = useCallback(
    (id: string, index: number, text: string) => {
      if (actions.setBalkenText) {
        actions.setBalkenText(id, index, text);
      }
    },
    [actions]
  );

  const handleIconDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      if (actions.updateIcon) {
        actions.updateIcon(id, { x, y });
      }
    },
    [actions]
  );

  const handleIconTransformEnd = useCallback(
    (id: string, x: number, y: number, scale: number, rotation: number) => {
      if (actions.updateIcon) {
        actions.updateIcon(id, { x, y, scale, rotation });
      }
    },
    [actions]
  );

  const handleShapeChange = useCallback(
    (id: string, newAttrs: Partial<ShapeInstance>) => {
      if (actions.updateShape) {
        actions.updateShape(id, newAttrs);
      }
    },
    [actions]
  );

  const handleAdditionalTextChange = useCallback(
    (id: string, newAttrs: Partial<AdditionalText>) => {
      if (actions.updateAdditionalText) {
        actions.updateAdditionalText(id, newAttrs);
      }
    },
    [actions]
  );

  const handleCircleBadgeSelect = useCallback(
    (id: string) => {
      selectElement(id);
    },
    [selectElement]
  );

  const handleCircleBadgeDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      if (actions.updateCircleBadge) {
        actions.updateCircleBadge(id, { x, y });
      }
    },
    [actions]
  );

  const handleCircleBadgeTransformEnd = useCallback(
    (id: string, x: number, y: number, scale: number, rotation: number) => {
      if (actions.updateCircleBadge) {
        actions.updateCircleBadge(id, { x, y, scale, rotation });
      }
    },
    [actions]
  );

  const handleCircleBadgeTextLineChange = useCallback(
    (id: string, lineIndex: number, text: string) => {
      if (actions.updateCircleBadge) {
        const badges = getStateArray<{
          id: string;
          textLines: Array<{
            text: string;
            yOffset: number;
            fontFamily: string;
            fontSize: number;
            fontWeight?: 'normal' | 'bold';
          }>;
        }>(state, 'circleBadgeInstances');
        const badge = badges.find((b) => b.id === id);
        if (badge) {
          const newTextLines = badge.textLines.map((line, i) =>
            i === lineIndex ? { ...line, text } : line
          );
          actions.updateCircleBadge(id, { textLines: newTextLines });
        }
      }
    },
    [actions, state]
  );

  const handlePillBadgeSelect = useCallback(
    (id: string) => {
      selectElement(id);
    },
    [selectElement]
  );

  const handlePillBadgeTextChange = useCallback(
    (id: string, text: string) => {
      if (actions.updatePillBadge) {
        actions.updatePillBadge(id, { text });
      }
    },
    [actions]
  );

  const handlePillBadgeDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      if (actions.updatePillBadge) {
        actions.updatePillBadge(id, { x, y });
      }
    },
    [actions]
  );

  const handlePillBadgeTransformEnd = useCallback(
    (id: string, x: number, y: number, scale: number, rotation: number) => {
      if (actions.updatePillBadge) {
        actions.updatePillBadge(id, { x, y, scale, rotation });
      }
    },
    [actions]
  );

  const handleAssetDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      if (actions.updateAsset) {
        actions.updateAsset(id, { x, y });
      }
    },
    [actions]
  );

  const handleAssetTransformEnd = useCallback(
    (id: string, x: number, y: number, scale: number, rotation: number) => {
      if (actions.updateAsset) {
        actions.updateAsset(id, { x, y, scale, rotation });
      }
    },
    [actions]
  );

  const handleIllustrationDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      if (actions.updateIllustration) {
        actions.updateIllustration(id, { x, y });
      }
    },
    [actions]
  );

  const handleIllustrationTransformEnd = useCallback(
    (id: string, x: number, y: number, scale: number, rotation: number) => {
      if (actions.updateIllustration) {
        actions.updateIllustration(id, { x, y, scale, rotation });
      }
    },
    [actions]
  );

  const handleFrameChange = useCallback(
    (id: string, newAttrs: Partial<FrameInstance>) => {
      if (actions.updateFrame) {
        actions.updateFrame(id, newAttrs);
      }
    },
    [actions]
  );

  const handleFrameImageUpload = useCallback(
    (id: string, file: File, objectUrl: string) => {
      if (actions.setFrameImage) {
        actions.setFrameImage(id, file, objectUrl);
      }
    },
    [actions]
  );

  const handleUserImageDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      // updateUserImage saves history itself with the post-change state
      actions.updateUserImage?.(id, { x, y });
    },
    [actions]
  );

  const handleUserImageCropEnd = useCallback(
    (id: string, patch: Partial<UserImageInstance>) => {
      actions.updateUserImage?.(id, patch);
    },
    [actions]
  );

  const handleUserImageTransformEnd = useCallback(
    (id: string, x: number, y: number, width: number, height: number, rotation: number) => {
      actions.updateUserImage?.(id, { x, y, width, height, rotation });
    },
    [actions]
  );

  const handleChartDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      actions.updateChart?.(id, { x, y });
    },
    [actions]
  );

  const handleChartTransformEnd = useCallback(
    (id: string, x: number, y: number, scale: number, rotation: number) => {
      actions.updateChart?.(id, { x, y, scale, rotation });
    },
    [actions]
  );

  return useMemo(
    () => ({
      handleElementSelect,
      handleTextChange,
      handleFontSizeChange,
      handleElementPositionChange,
      handleImageDragEnd,
      handleImageTransformEnd,
      handleTemplateTransformEnd,
      handleBalkenSelect,
      handleBalkenDragEnd,
      handleBalkenTransformEnd,
      handleBalkenTextChange,
      handleIconDragEnd,
      handleIconTransformEnd,
      handleShapeChange,
      handleAdditionalTextChange,
      handleCircleBadgeSelect,
      handleCircleBadgeDragEnd,
      handleCircleBadgeTransformEnd,
      handleCircleBadgeTextLineChange,
      handlePillBadgeSelect,
      handlePillBadgeTextChange,
      handlePillBadgeDragEnd,
      handlePillBadgeTransformEnd,
      handleAssetDragEnd,
      handleAssetTransformEnd,
      handleIllustrationDragEnd,
      handleIllustrationTransformEnd,
      handleFrameChange,
      handleFrameImageUpload,
      handleUserImageDragEnd,
      handleUserImageCropEnd,
      handleUserImageTransformEnd,
      handleChartDragEnd,
      handleChartTransformEnd,
    }),
    [
      handleElementSelect,
      handleTextChange,
      handleFontSizeChange,
      handleElementPositionChange,
      handleImageDragEnd,
      handleImageTransformEnd,
      handleTemplateTransformEnd,
      handleBalkenSelect,
      handleBalkenDragEnd,
      handleBalkenTransformEnd,
      handleBalkenTextChange,
      handleIconDragEnd,
      handleIconTransformEnd,
      handleShapeChange,
      handleAdditionalTextChange,
      handleCircleBadgeSelect,
      handleCircleBadgeDragEnd,
      handleCircleBadgeTransformEnd,
      handleCircleBadgeTextLineChange,
      handlePillBadgeSelect,
      handlePillBadgeTextChange,
      handlePillBadgeDragEnd,
      handlePillBadgeTransformEnd,
      handleAssetDragEnd,
      handleAssetTransformEnd,
      handleIllustrationDragEnd,
      handleIllustrationTransformEnd,
      handleFrameChange,
      handleFrameImageUpload,
      handleUserImageDragEnd,
      handleUserImageCropEnd,
      handleUserImageTransformEnd,
      handleChartDragEnd,
      handleChartTransformEnd,
    ]
  );
}

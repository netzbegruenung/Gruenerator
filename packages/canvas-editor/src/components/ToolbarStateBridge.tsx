/**
 * ToolbarStateBridge — Renderless component that owns all selectedElement-derived computation.
 *
 * This component subscribes to `selectedElement` from the Zustand store and computes
 * derived values (activeFloatingModule, canMoveUp/Down, floating handlers).
 * It returns null — when selectedElement changes, only this component re-renders,
 * NOT GenericCanvasInner or the Konva canvas tree.
 *
 * Reports toolbar state upward via onToolbarStateChange callback and
 * exposes bridge handlers via a mutable ref for GenericCanvasInner's useImperativeHandle.
 */

import { useCallback, useEffect, type MutableRefObject } from 'react';

import { useFloatingModuleHandlers } from '../hooks/useFloatingModuleHandlers';
import { useFloatingModuleState } from '../hooks/useFloatingModuleState';
import { useCanvasStoreSelector, useCanvasStoreShallow } from '../stores/CanvasStoreProvider';
import { selectionCapabilities } from '../utils/selectionCapabilities';
import { findTemplateEntry } from '../utils/templateElementInstance';

import type { ToolbarStateReport } from './GenericCanvas';
import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { FullCanvasConfig, LayoutResult } from '../configs/types';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';
import type { ShadowPatch } from '../hooks/useFloatingModuleHandlers';
import type { FloatingModuleState } from '../hooks/useFloatingModuleState';
import type { CanvasItem } from '../utils/canvasLayerManager';
import type { GradientFill } from '../utils/gradientFill';

export interface ToolbarBridgeState {
  activeFloatingModule: FloatingModuleState | null;
  handleColorSelect: (color: string) => void;
  handleOpacityChange: (id: string, opacity: number, type: string) => void;
  handleShadowChange: (id: string, patch: ShadowPatch, type: string) => void;
  handleOutlineChange: (id: string, patch: { stroke?: string; strokeWidth?: number }) => void;
  handleBlurChange: (id: string, blur: number) => void;
  handleGradientSelect: (gradient: GradientFill | null) => void;
  /** Ausschnitt mode for the selected framed photo. */
  handleCropImage: () => void;
}

interface ToolbarStateBridgeProps<
  TState extends Record<string, unknown> & Partial<BaseCanvasState>,
  TActions extends OptionalCanvasActions,
> {
  bridgeRef: MutableRefObject<ToolbarBridgeState | null>;
  config: FullCanvasConfig<TState, TActions>;
  state: TState;
  layout: LayoutResult;
  actions: TActions;
  sortedRenderList: CanvasItem[];
  setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void;
  debouncedSaveToHistory: (state: TState) => void;
  canUndo: boolean;
  canRedo: boolean;
  onToolbarStateChange?: (state: ToolbarStateReport) => void;
}

export function ToolbarStateBridge<
  TState extends Record<string, unknown> & Partial<BaseCanvasState>,
  TActions extends OptionalCanvasActions,
>({
  bridgeRef,
  config,
  state,
  layout,
  actions,
  sortedRenderList,
  setState,
  debouncedSaveToHistory,
  canUndo,
  canRedo,
  onToolbarStateChange,
}: ToolbarStateBridgeProps<TState, TActions>) {
  const selectedElement = useCanvasStoreSelector((s) => s.selectedElement);

  const activeFloatingModule = useFloatingModuleState({
    selectedElement,
    config,
    state,
    layout,
  });

  const selectedLayerIds = useCanvasStoreShallow((s) => s.selectedLayerIds);
  const setCroppingElement = useCanvasStoreSelector((s) => s.setCroppingElement);
  const isCropping = useCanvasStoreSelector(
    (s) => s.croppingElement !== null && s.croppingElement === s.selectedElement
  );

  /**
   * Vorlagen-Grafiken liegen in keiner Sammlung des Zustands — gefunden werden
   * sie nur über die Elementliste der Vorlage und das gerechnete Layout. Beides
   * hat dieser Bridge, `duplicateElement` nicht (#3403).
   */
  const templateEntry = useCallback(
    (id: string) => findTemplateEntry(config.elements, state, layout, id),
    [config.elements, state, layout]
  );

  // Dieselben Fragen, die die Türen beim Ausführen stellen (`utils/canvasCommands.ts`).
  const capabilities = selectionCapabilities({
    ids: selectedLayerIds,
    state,
    actions,
    template: templateEntry,
    renderList: sortedRenderList,
  });

  const floatingHandlers = useFloatingModuleHandlers({
    activeFloatingModule,
    actions,
    config,
    state,
    setState,
    debouncedSaveToHistory,
  });

  // Write bridge state for GenericCanvasInner's useImperativeHandle.
  // Uses useEffect (not render-time assignment) for React 19 concurrent mode safety.
  useEffect(() => {
    bridgeRef.current = {
      activeFloatingModule,
      handleColorSelect: floatingHandlers.handleColorSelect,
      handleOpacityChange: floatingHandlers.handleOpacityChange,
      handleShadowChange: floatingHandlers.handleShadowChange,
      handleOutlineChange: floatingHandlers.handleOutlineChange,
      handleBlurChange: floatingHandlers.handleBlurChange,
      handleGradientSelect: floatingHandlers.handleGradientSelect,
      handleCropImage: () => setCroppingElement(isCropping ? null : selectedElement),
    };
  });

  // Report toolbar state to CanvasEditor
  useEffect(() => {
    onToolbarStateChange?.({
      selectedElement,
      activeFloatingModule,
      canUndo,
      canRedo,
      canMoveUp: capabilities.canBringForward,
      canMoveDown: capabilities.canSendBackward,
      canDuplicate: capabilities.canCopy,
      canDelete: capabilities.canDelete,
      isCropping,
      selectionCount: capabilities.count,
      canCopy: capabilities.canCopy,
      lockState: capabilities.lock,
      canLock: capabilities.canLock,
    });
  }, [
    isCropping,
    selectedElement,
    activeFloatingModule,
    canUndo,
    canRedo,
    capabilities.canBringForward,
    capabilities.canSendBackward,
    capabilities.canCopy,
    capabilities.canDelete,
    capabilities.count,
    capabilities.lock,
    capabilities.canLock,
    onToolbarStateChange,
  ]);

  return null;
}

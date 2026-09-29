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

import { useCanvasLayerControls } from '../hooks/useCanvasLayerControls';
import { useFloatingModuleHandlers } from '../hooks/useFloatingModuleHandlers';
import { useFloatingModuleState } from '../hooks/useFloatingModuleState';
import { useCanvasStoreSelector } from '../stores/CanvasStoreProvider';
import { canDuplicateElement, duplicateElementInState } from '../utils/duplicateElement';
import { findElementRemover } from '../utils/removeElement';
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
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  handleMoveLayer: (direction: 'up' | 'down') => void;
  handleDuplicate: () => void;
  handleDelete: () => void;
  handleColorSelect: (color: string) => void;
  handleOpacityChange: (id: string, opacity: number, type: string) => void;
  handleShadowChange: (id: string, patch: ShadowPatch, type: string) => void;
  handleOutlineChange: (id: string, patch: { stroke?: string; strokeWidth?: number }) => void;
  handleBlurChange: (id: string, blur: number) => void;
  handleGradientSelect: (gradient: GradientFill | null) => void;
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
  saveToHistory: (state: TState) => void;
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
  saveToHistory,
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

  const layerControls = useCanvasLayerControls({
    selectedElement,
    sortedRenderList,
    setState,
    saveToHistory,
    state,
  });

  const setSelectedElement = useCanvasStoreSelector((s) => s.setSelectedElement);

  /**
   * Vorlagen-Grafiken liegen in keiner Sammlung des Zustands — gefunden werden
   * sie nur über die Elementliste der Vorlage und das gerechnete Layout. Beides
   * hat dieser Bridge, `duplicateElement` nicht (#3403).
   */
  const templateEntry = useCallback(
    (id: string) => findTemplateEntry(config.elements, state, layout, id),
    [config.elements, state, layout]
  );

  const canDuplicate = canDuplicateElement(state, selectedElement, templateEntry);

  /**
   * Dupliziert die Auswahl. `saveToHistory` ist hier nicht optional: `setState`
   * allein schreibt keinen Verlaufseintrag, und ohne ihn ließe sich die Kopie
   * nicht rückgängig machen — der Fehler, den der Strg+D-Pfad jahrelang hatte.
   */
  const handleDuplicate = useCallback(() => {
    if (!selectedElement) return;
    const result = duplicateElementInState(state, selectedElement, { template: templateEntry });
    if (!result) return;
    setState(result.state);
    saveToHistory(result.state);
    setSelectedElement(result.newId);
  }, [selectedElement, state, setState, saveToHistory, setSelectedElement, templateEntry]);

  // Dieselbe Frage wie die Entf-Taste: Vorlagen-Elemente liegen in keiner
  // Sammlung und sind nicht löschbar.
  const removeSelected = findElementRemover(state, actions, selectedElement);
  const canDelete = removeSelected !== null;
  const handleDelete = useCallback(() => {
    if (!removeSelected) return;
    removeSelected();
    setSelectedElement(null);
  }, [removeSelected, setSelectedElement]);

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
      canMoveUp: layerControls.canMoveUp,
      canMoveDown: layerControls.canMoveDown,
      canDuplicate,
      canDelete,
      handleMoveLayer: layerControls.handleMoveLayer,
      handleDuplicate,
      handleDelete,
      handleColorSelect: floatingHandlers.handleColorSelect,
      handleOpacityChange: floatingHandlers.handleOpacityChange,
      handleShadowChange: floatingHandlers.handleShadowChange,
      handleOutlineChange: floatingHandlers.handleOutlineChange,
      handleBlurChange: floatingHandlers.handleBlurChange,
      handleGradientSelect: floatingHandlers.handleGradientSelect,
    };
  });

  // Report toolbar state to CanvasEditor
  useEffect(() => {
    onToolbarStateChange?.({
      selectedElement,
      activeFloatingModule,
      canUndo,
      canRedo,
      canMoveUp: layerControls.canMoveUp,
      canMoveDown: layerControls.canMoveDown,
      canDuplicate,
      canDelete,
    });
  }, [
    selectedElement,
    activeFloatingModule,
    canUndo,
    canRedo,
    layerControls.canMoveUp,
    layerControls.canMoveDown,
    canDuplicate,
    canDelete,
    onToolbarStateChange,
  ]);

  return null;
}

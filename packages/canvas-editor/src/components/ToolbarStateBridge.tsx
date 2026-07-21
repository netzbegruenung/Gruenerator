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

import { useEffect, type MutableRefObject } from 'react';

import { useCanvasStoreSelector } from '../stores/CanvasStoreProvider';
import { useFloatingModuleState } from '../hooks/useFloatingModuleState';
import { useFloatingModuleHandlers } from '../hooks/useFloatingModuleHandlers';
import { useCanvasLayerControls } from '../hooks/useCanvasLayerControls';
import { useMobileBridge } from '../hooks/useMobileBridge';

import type { ToolbarStateReport } from './GenericCanvas';
import type { FloatingModuleState } from '../hooks/useFloatingModuleState';
import type { ShadowPatch } from '../hooks/useFloatingModuleHandlers';
import type { GradientFill } from '../utils/gradientFill';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';
import type { FullCanvasConfig, LayoutResult } from '../configs/types';
import type { CanvasItem } from '../utils/canvasLayerManager';
import type { MobileBridgeProps } from '../hooks/useMobileBridge';

export interface ToolbarBridgeState {
  activeFloatingModule: FloatingModuleState | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  handleMoveLayer: (direction: 'up' | 'down') => void;
  handleColorSelect: (color: string) => void;
  handleOpacityChange: (id: string, opacity: number, type: string) => void;
  handleShadowChange: (id: string, patch: ShadowPatch, type: string) => void;
  handleOutlineChange: (id: string, patch: { stroke?: string; strokeWidth?: number }) => void;
  handleBlurChange: (id: string, blur: number) => void;
  handleGradientSelect: (gradient: GradientFill | null) => void;
}

interface ToolbarStateBridgeProps<
  TState extends Record<string, unknown>,
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
  undo: () => void;
  redo: () => void;
  onToolbarStateChange?: (state: ToolbarStateReport) => void;
  mobileBridge?: MobileBridgeProps;
  handleFontSizeChange: (id: string, size: number) => void;
}

export function ToolbarStateBridge<
  TState extends Record<string, unknown>,
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
  undo,
  redo,
  onToolbarStateChange,
  mobileBridge,
  handleFontSizeChange,
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

  const floatingHandlers = useFloatingModuleHandlers({
    activeFloatingModule,
    actions,
    config,
    state,
    setState,
    debouncedSaveToHistory,
  });

  useMobileBridge(mobileBridge, {
    selectedElement,
    activeFloatingModule,
    canUndo,
    canRedo,
    canMoveUp: layerControls.canMoveUp,
    canMoveDown: layerControls.canMoveDown,
    handlers: {
      undo,
      redo,
      handleMoveLayer: layerControls.handleMoveLayer,
      handleColorSelect: floatingHandlers.handleColorSelect,
      handleOpacityChange: floatingHandlers.handleOpacityChange,
      handleFontSizeChange,
    },
  });

  // Write bridge state for GenericCanvasInner's useImperativeHandle.
  // Uses useEffect (not render-time assignment) for React 19 concurrent mode safety.
  useEffect(() => {
    bridgeRef.current = {
      activeFloatingModule,
      canMoveUp: layerControls.canMoveUp,
      canMoveDown: layerControls.canMoveDown,
      handleMoveLayer: layerControls.handleMoveLayer,
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
    });
  }, [
    selectedElement,
    activeFloatingModule,
    canUndo,
    canRedo,
    layerControls.canMoveUp,
    layerControls.canMoveDown,
    onToolbarStateChange,
  ]);

  return null;
}

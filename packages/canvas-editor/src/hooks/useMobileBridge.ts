/**
 * useMobileBridge - Connects GenericCanvas internals to mobile native bridge.
 *
 * Reports selected element and history state changes up to native via callbacks.
 * Executes toolbar actions (undo, redo, color change, etc.) dispatched from native.
 *
 * Tab state is handled separately at the CanvasEditor level.
 */

import { useEffect, useRef } from 'react';

import type { SidebarTabId } from '../sidebar/types';

// Bridge types mirrored from apps/mobile/components/canvas-editor/types.ts
// Kept in sync manually — these are simple serializable interfaces.

interface SelectedElementInfo {
  type: string;
  id: string;
  fontSize?: number;
  opacity?: number;
  fill?: string;
  color?: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

interface TabInfo {
  id: string;
  label: string;
  disabled: boolean;
}

type ToolbarAction =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'moveLayer'; direction: 'up' | 'down' }
  | { type: 'colorChange'; color: string }
  | { type: 'opacityChange'; opacity: number }
  | { type: 'fontSizeChange'; delta: number };

interface FloatingModuleData {
  type: string;
  data: {
    id: string;
    fontSize?: number;
    opacity?: number;
    fill?: string;
    color?: string;
    [key: string]: unknown;
  };
}

export interface MobileBridgeCallbacks {
  onSelectedElementChange: (info: SelectedElementInfo | null) => void;
  onHistoryChange: (state: HistoryState) => void;
  onTabsChange: (tabs: TabInfo[]) => void;
  onActiveTabChange: (tabId: SidebarTabId | null) => void;
}

export interface MobileBridgeProps {
  callbacks: MobileBridgeCallbacks;
  activeTab: SidebarTabId | null;
  toolbarAction: ToolbarAction | null;
  toolbarActionId: number;
}

interface MobileBridgeCanvasState {
  selectedElement: string | null;
  activeFloatingModule: FloatingModuleData | null;
  canUndo: boolean;
  canRedo: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  handlers: {
    undo: () => void;
    redo: () => void;
    handleMoveLayer: (direction: 'up' | 'down') => void;
    handleColorSelect: (color: string) => void;
    handleOpacityChange: (id: string, opacity: number, type: string) => void;
    handleFontSizeChange: (id: string, size: number) => void;
  };
}

export function useMobileBridge(
  bridge: MobileBridgeProps | undefined,
  state: MobileBridgeCanvasState
): void {
  const {
    selectedElement,
    activeFloatingModule,
    canUndo,
    canRedo,
    canMoveUp,
    canMoveDown,
    handlers,
  } = state;

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const activeFloatingModuleRef = useRef(activeFloatingModule);
  activeFloatingModuleRef.current = activeFloatingModule;

  // Report selected element changes to native
  useEffect(() => {
    if (!bridge) return;

    if (!activeFloatingModule) {
      bridge.callbacks.onSelectedElementChange(null);
      return;
    }

    bridge.callbacks.onSelectedElementChange({
      type: activeFloatingModule.type,
      id: activeFloatingModule.data.id,
      fontSize: activeFloatingModule.data.fontSize,
      opacity: activeFloatingModule.data.opacity,
      fill: activeFloatingModule.data.fill,
      color: activeFloatingModule.data.color,
      canMoveUp,
      canMoveDown,
    });
  }, [bridge, selectedElement, activeFloatingModule, canMoveUp, canMoveDown]);

  // Report history state changes to native
  useEffect(() => {
    if (!bridge) return;
    bridge.callbacks.onHistoryChange({ canUndo, canRedo });
  }, [bridge, canUndo, canRedo]);

  // Execute toolbar actions dispatched from native
  const lastActionIdRef = useRef(0);
  useEffect(() => {
    if (!bridge) return;
    const action = bridge.toolbarAction;
    if (!action || bridge.toolbarActionId === lastActionIdRef.current) return;
    lastActionIdRef.current = bridge.toolbarActionId;

    const h = handlersRef.current;
    const mod = activeFloatingModuleRef.current;

    switch (action.type) {
      case 'undo':
        h.undo();
        break;
      case 'redo':
        h.redo();
        break;
      case 'moveLayer':
        h.handleMoveLayer(action.direction);
        break;
      case 'colorChange':
        h.handleColorSelect(action.color);
        break;
      case 'opacityChange':
        if (mod) {
          h.handleOpacityChange(mod.data.id, action.opacity, mod.type);
        }
        break;
      case 'fontSizeChange':
        if (mod && mod.data.fontSize !== undefined) {
          const newSize = Math.max(8, Math.min(200, mod.data.fontSize + action.delta));
          h.handleFontSizeChange(mod.data.id, newSize);
        }
        break;
    }
  }, [bridge, bridge?.toolbarActionId]);
}

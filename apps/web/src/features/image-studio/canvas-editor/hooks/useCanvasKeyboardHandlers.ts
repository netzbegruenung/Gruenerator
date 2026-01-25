import { useEffect } from 'react';

import { CanvasClipboard } from '../utils/canvasClipboard';

import type { BalkenInstance } from '../primitives';
import type { ShapeInstance } from '../utils/shapes';

/**
 * Canvas Keyboard Handlers - Keyboard shortcuts for canvas
 *
 * Handles:
 * - Copy (Ctrl+C): Copy selected element to clipboard
 * - Paste (Ctrl+V): Paste clipboard element with offset
 * - Delete/Backspace: Remove selected element
 *
 * Automatically prevents actions when typing in input/textarea fields.
 */

export interface CanvasActions {
  removeBalken?: (id: string) => void;
  toggleIcon?: (id: string, enabled: boolean) => void;
  removeShape?: (id: string) => void;
  removeAdditionalText?: (id: string) => void;
  removeIllustration?: (id: string) => void;
  removeAsset?: (id: string) => void;
}

export interface UseCanvasKeyboardHandlersOptions<TState> {
  selectedElement: string | null;
  state: TState;
  actions: CanvasActions;
  setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void;
  setSelectedElement: (id: string | null) => void;
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
 * Hook to handle keyboard shortcuts for canvas operations
 */
export function useCanvasKeyboardHandlers<TState>(
  options: UseCanvasKeyboardHandlersOptions<TState>
): void {
  const { selectedElement, state, actions, setState, setSelectedElement } = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // PASTE (Ctrl+V)
      if (isCtrlOrCmd && e.key === 'v') {
        const clipboardData = CanvasClipboard.paste();
        if (!clipboardData) return;

        const { type, data } = clipboardData;
        const newId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const offset = 20;

        setState((prev) => {
          const newState = { ...prev } as Record<string, unknown>;
          const prevState = prev as Record<string, unknown>;

          if (type === 'shape' && typeof data === 'object' && data !== null) {
            const shapeData = data as { x: number; y: number };
            const newShape = {
              ...shapeData,
              id: newId,
              x: shapeData.x + offset,
              y: shapeData.y + offset,
            };
            const existing = getStateArray<unknown>(prevState, 'shapeInstances');
            (newState as Record<string, unknown>).shapeInstances = [...existing, newShape];
          } else if (type === 'illustration' && typeof data === 'object' && data !== null) {
            const illData = data as { x: number; y: number };
            const newIll = { ...illData, id: newId, x: illData.x + offset, y: illData.y + offset };
            const existing = getStateArray<unknown>(prevState, 'illustrationInstances');
            (newState as Record<string, unknown>).illustrationInstances = [...existing, newIll];
          } else if (type === 'balken' && typeof data === 'object' && data !== null) {
            const balkenData = data as { offset?: { x: number; y: number } };
            const newBalken = {
              ...balkenData,
              id: newId,
              offset: {
                x: (balkenData.offset?.x || 0) + offset,
                y: (balkenData.offset?.y || 0) + offset,
              },
            };
            const existing = getStateArray<unknown>(prevState, 'balkenInstances');
            (newState as Record<string, unknown>).balkenInstances = [...existing, newBalken];
          } else if (type === 'additional-text' && typeof data === 'object' && data !== null) {
            const textData = data as { x: number; y: number };
            const newText = {
              ...textData,
              id: newId,
              x: textData.x + offset,
              y: textData.y + offset,
            };
            const existing = getStateArray<unknown>(prevState, 'additionalTexts');
            (newState as Record<string, unknown>).additionalTexts = [...existing, newText];
          } else if (type === 'asset' && typeof data === 'object' && data !== null) {
            const assetData = data as { x: number; y: number };
            const newAsset = {
              ...assetData,
              id: newId,
              x: assetData.x + offset,
              y: assetData.y + offset,
            };
            const existing = getStateArray<unknown>(prevState, 'assetInstances');
            (newState as Record<string, unknown>).assetInstances = [...existing, newAsset];
          }

          return newState as TState;
        });

        setTimeout(() => setSelectedElement(newId), 0);
        return;
      }

      if (!selectedElement) return;

      // COPY (Ctrl+C)
      if (isCtrlOrCmd && e.key === 'c') {
        const shapes = getStateArray<ShapeInstance>(state, 'shapeInstances');
        const shape = shapes.find((s) => s.id === selectedElement);
        if (shape) {
          CanvasClipboard.copy('shape', shape);
          return;
        }

        const illustrations = getStateArray<unknown>(state, 'illustrationInstances');
        const ill = illustrations.find((i: unknown) => {
          const illObj = i as { id?: string };
          return illObj.id === selectedElement;
        });
        if (ill) {
          CanvasClipboard.copy('illustration', ill);
          return;
        }

        const balkens = getStateArray<BalkenInstance>(state, 'balkenInstances');
        const balken = balkens.find((b) => b.id === selectedElement);
        if (balken) {
          CanvasClipboard.copy('balken', balken);
          return;
        }

        const texts = getStateArray<{ id: string }>(state, 'additionalTexts');
        const text = texts.find((t) => t.id === selectedElement);
        if (text) {
          CanvasClipboard.copy('additional-text', text);
          return;
        }

        const assets = getStateArray<unknown>(state, 'assetInstances');
        const asset = assets.find((a: unknown) => {
          const assetObj = a as { id?: string };
          return assetObj.id === selectedElement;
        });
        if (asset) {
          CanvasClipboard.copy('asset', asset);
          return;
        }

        return;
      }

      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // DELETE / BACKSPACE
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Remove Balken
        const balkens = getStateArray<BalkenInstance>(state, 'balkenInstances');
        if (balkens.find((b) => b.id === selectedElement)) {
          if (actions.removeBalken) {
            actions.removeBalken(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        // Remove Icon
        const selectedIcons = getStateArray<string>(state, 'selectedIcons');
        if (selectedIcons.includes(selectedElement)) {
          if (actions.toggleIcon) {
            actions.toggleIcon(selectedElement, false);
            setSelectedElement(null);
            return;
          }
        }

        // Remove Shape
        const shapes = getStateArray<ShapeInstance>(state, 'shapeInstances');
        if (shapes.find((s) => s.id === selectedElement)) {
          if (actions.removeShape) {
            actions.removeShape(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        // Remove Additional Text
        const additionalTexts = getStateArray<{ id: string }>(state, 'additionalTexts');
        if (additionalTexts.find((t) => t.id === selectedElement)) {
          if (actions.removeAdditionalText) {
            actions.removeAdditionalText(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        // Remove Illustration
        const illustrations = getStateArray<unknown>(state, 'illustrationInstances');
        if (
          illustrations.find((i: unknown) => {
            const illObj = i as { id?: string };
            return illObj.id === selectedElement;
          })
        ) {
          if (actions.removeIllustration) {
            actions.removeIllustration(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        // Remove Asset
        const assets = getStateArray<unknown>(state, 'assetInstances');
        if (
          assets.find((a: unknown) => {
            const assetObj = a as { id?: string };
            return assetObj.id === selectedElement;
          })
        ) {
          if (actions.removeAsset) {
            actions.removeAsset(selectedElement);
            setSelectedElement(null);
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement, actions, state, setState, setSelectedElement]);
}

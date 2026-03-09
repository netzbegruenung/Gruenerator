import { useEffect, useRef } from 'react';

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
  removePillBadge?: (id: string) => void;
  removeFrame?: (id: string) => void;
  setFrameImage?: (id: string, file: File, objectUrl: string) => void;
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

  // Use refs for values that the handler reads but shouldn't trigger re-attachment
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  useEffect(() => {
    stateRef.current = state;
    actionsRef.current = actions;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const currentState = stateRef.current;
      const currentActions = actionsRef.current;

      // DUPLICATE (Ctrl+D) — copy + paste in one step
      if (isCtrlOrCmd && e.key === 'd' && selectedElement) {
        e.preventDefault();
        const currentState = stateRef.current;
        const offset = 20;
        const newId = `dup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        setState((prev) => {
          const newState = { ...prev } as Record<string, unknown>;
          const prevState = prev as Record<string, unknown>;

          // Try each element type
          const shapes = getStateArray<ShapeInstance>(prevState, 'shapeInstances');
          const shape = shapes.find((s) => s.id === selectedElement);
          if (shape) {
            (newState as Record<string, unknown>).shapeInstances = [
              ...shapes,
              { ...shape, id: newId, x: shape.x + offset, y: shape.y + offset },
            ];
            return newState as TState;
          }

          const texts = getStateArray<{ id: string; x: number; y: number }>(
            prevState,
            'additionalTexts'
          );
          const text = texts.find((t) => t.id === selectedElement);
          if (text) {
            (newState as Record<string, unknown>).additionalTexts = [
              ...texts,
              { ...text, id: newId, x: text.x + offset, y: text.y + offset },
            ];
            return newState as TState;
          }

          const balkens = getStateArray<BalkenInstance>(prevState, 'balkenInstances');
          const balken = balkens.find((b) => b.id === selectedElement);
          if (balken) {
            (newState as Record<string, unknown>).balkenInstances = [
              ...balkens,
              {
                ...balken,
                id: newId,
                offset: {
                  x: (balken.offset?.x || 0) + offset,
                  y: (balken.offset?.y || 0) + offset,
                },
              },
            ];
            return newState as TState;
          }

          const illustrations = getStateArray<{ id: string; x: number; y: number }>(
            prevState,
            'illustrationInstances'
          );
          const ill = illustrations.find((i) => i.id === selectedElement);
          if (ill) {
            (newState as Record<string, unknown>).illustrationInstances = [
              ...illustrations,
              { ...ill, id: newId, x: ill.x + offset, y: ill.y + offset },
            ];
            return newState as TState;
          }

          const assets = getStateArray<{ id: string; x: number; y: number }>(
            prevState,
            'assetInstances'
          );
          const asset = assets.find((a) => a.id === selectedElement);
          if (asset) {
            (newState as Record<string, unknown>).assetInstances = [
              ...assets,
              { ...asset, id: newId, x: asset.x + offset, y: asset.y + offset },
            ];
            return newState as TState;
          }

          return prev;
        });

        setTimeout(() => setSelectedElement(newId), 0);
        return;
      }

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
          } else if (type === 'pill-badge' && typeof data === 'object' && data !== null) {
            const pillData = data as { x: number; y: number };
            const newPill = {
              ...pillData,
              id: newId,
              x: pillData.x + offset,
              y: pillData.y + offset,
            };
            const existing = getStateArray<unknown>(prevState, 'pillBadgeInstances');
            (newState as Record<string, unknown>).pillBadgeInstances = [...existing, newPill];
          } else if (type === 'frame' && typeof data === 'object' && data !== null) {
            const frameData = data as { x: number; y: number; imageSrc?: string | null };
            const newFrame = {
              ...frameData,
              id: newId,
              x: frameData.x + offset,
              y: frameData.y + offset,
              imageSrc: null, // Don't share object URL references
            };
            const existing = getStateArray<unknown>(prevState, 'frameInstances');
            (newState as Record<string, unknown>).frameInstances = [...existing, newFrame];
          }

          return newState as TState;
        });

        setTimeout(() => setSelectedElement(newId), 0);
        return;
      }

      if (!selectedElement) return;

      // COPY (Ctrl+C)
      if (isCtrlOrCmd && e.key === 'c') {
        const shapes = getStateArray<ShapeInstance>(currentState, 'shapeInstances');
        const shape = shapes.find((s) => s.id === selectedElement);
        if (shape) {
          CanvasClipboard.copy('shape', shape);
          return;
        }

        const illustrations = getStateArray<unknown>(currentState, 'illustrationInstances');
        const ill = illustrations.find((i: unknown) => {
          const illObj = i as { id?: string };
          return illObj.id === selectedElement;
        });
        if (ill) {
          CanvasClipboard.copy('illustration', ill);
          return;
        }

        const balkens = getStateArray<BalkenInstance>(currentState, 'balkenInstances');
        const balken = balkens.find((b) => b.id === selectedElement);
        if (balken) {
          CanvasClipboard.copy('balken', balken);
          return;
        }

        const texts = getStateArray<{ id: string }>(currentState, 'additionalTexts');
        const text = texts.find((t) => t.id === selectedElement);
        if (text) {
          CanvasClipboard.copy('additional-text', text);
          return;
        }

        const assets = getStateArray<unknown>(currentState, 'assetInstances');
        const asset = assets.find((a: unknown) => {
          const assetObj = a as { id?: string };
          return assetObj.id === selectedElement;
        });
        if (asset) {
          CanvasClipboard.copy('asset', asset);
          return;
        }

        const pillBadges = getStateArray<unknown>(currentState, 'pillBadgeInstances');
        const pillBadge = pillBadges.find((p: unknown) => {
          const pillObj = p as { id?: string };
          return pillObj.id === selectedElement;
        });
        if (pillBadge) {
          CanvasClipboard.copy('pill-badge', pillBadge);
          return;
        }

        const frames = getStateArray<unknown>(currentState, 'frameInstances');
        const frame = frames.find((f: unknown) => {
          const frameObj = f as { id?: string };
          return frameObj.id === selectedElement;
        });
        if (frame) {
          CanvasClipboard.copy('frame', frame);
          return;
        }

        return;
      }

      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // ENTER — open file picker for selected frame
      if (e.key === 'Enter' && currentActions.setFrameImage) {
        const frameInstances = getStateArray<{ id: string }>(currentState, 'frameInstances');
        const frame = frameInstances.find((f) => f.id === selectedElement);
        if (frame) {
          e.preventDefault();
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (file) {
              const objectUrl = URL.createObjectURL(file);
              currentActions.setFrameImage!(selectedElement, file, objectUrl);
            }
            input.remove();
          });
          input.click();
          return;
        }
      }

      // DELETE / BACKSPACE
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Remove Balken
        const balkens = getStateArray<BalkenInstance>(currentState, 'balkenInstances');
        if (balkens.find((b) => b.id === selectedElement)) {
          if (currentActions.removeBalken) {
            currentActions.removeBalken(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        // Remove Icon
        const selectedIcons = getStateArray<string>(currentState, 'selectedIcons');
        if (selectedIcons.includes(selectedElement)) {
          if (currentActions.toggleIcon) {
            currentActions.toggleIcon(selectedElement, false);
            setSelectedElement(null);
            return;
          }
        }

        // Remove Shape
        const shapes = getStateArray<ShapeInstance>(currentState, 'shapeInstances');
        if (shapes.find((s) => s.id === selectedElement)) {
          if (currentActions.removeShape) {
            currentActions.removeShape(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        // Remove Additional Text
        const additionalTexts = getStateArray<{ id: string }>(currentState, 'additionalTexts');
        if (additionalTexts.find((t) => t.id === selectedElement)) {
          if (currentActions.removeAdditionalText) {
            currentActions.removeAdditionalText(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        // Remove Illustration
        const illustrations = getStateArray<unknown>(currentState, 'illustrationInstances');
        if (
          illustrations.find((i: unknown) => {
            const illObj = i as { id?: string };
            return illObj.id === selectedElement;
          })
        ) {
          if (currentActions.removeIllustration) {
            currentActions.removeIllustration(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        // Remove Asset
        const assets = getStateArray<unknown>(currentState, 'assetInstances');
        if (
          assets.find((a: unknown) => {
            const assetObj = a as { id?: string };
            return assetObj.id === selectedElement;
          })
        ) {
          if (currentActions.removeAsset) {
            currentActions.removeAsset(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        // Remove Pill Badge
        const pillBadges = getStateArray<unknown>(currentState, 'pillBadgeInstances');
        if (
          pillBadges.find((p: unknown) => {
            const pillObj = p as { id?: string };
            return pillObj.id === selectedElement;
          })
        ) {
          if (currentActions.removePillBadge) {
            currentActions.removePillBadge(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        // Remove Frame
        const frameInstances = getStateArray<unknown>(currentState, 'frameInstances');
        if (
          frameInstances.find((f: unknown) => {
            const frameObj = f as { id?: string };
            return frameObj.id === selectedElement;
          })
        ) {
          if (currentActions.removeFrame) {
            currentActions.removeFrame(selectedElement);
            setSelectedElement(null);
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement, setState, setSelectedElement]);
}

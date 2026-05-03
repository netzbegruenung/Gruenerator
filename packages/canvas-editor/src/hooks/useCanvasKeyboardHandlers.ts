import { useEffect, useRef } from 'react';

import { CanvasClipboard } from '../utils/canvasClipboard';

import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';
import type { BalkenInstance } from '../primitives';
import type { AssetInstance } from '../utils/canvasAssets';
import type { CircleBadgeInstance } from '../utils/circleBadgeUtils';
import type { FrameInstance } from '../utils/frameUtils';
import type { IllustrationInstance } from '../utils/illustrations/types';
import type { PillBadgeInstance } from '../utils/pillBadgeUtils';
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
  removeUserImage?: (id: string) => void;
}

export interface UseCanvasKeyboardHandlersOptions<TState> {
  store: CanvasEditorStoreApi;
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
  const { store, state, actions, setState, setSelectedElement } = options;

  // Use refs for values that the handler reads but shouldn't trigger re-attachment
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  useEffect(() => {
    stateRef.current = state;
    actionsRef.current = actions;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const selectedElement = store.getState().selectedElement;
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const currentState = stateRef.current;
      const currentActions = actionsRef.current;

      // DUPLICATE (Ctrl+D) — copy + paste in one step
      if (isCtrlOrCmd && e.key === 'd' && selectedElement) {
        e.preventDefault();
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

          const userImages = getStateArray<{ id: string; x: number; y: number }>(
            prevState,
            'userImageInstances'
          );
          const userImage = userImages.find((u) => u.id === selectedElement);
          if (userImage) {
            (newState as Record<string, unknown>).userImageInstances = [
              ...userImages,
              { ...userImage, id: newId, x: userImage.x + offset, y: userImage.y + offset },
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
        const entry = CanvasClipboard.paste();
        if (!entry) return;

        const newId = `${entry.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const offset = 20;

        setState((prev) => {
          const newState = { ...prev } as Record<string, unknown>;
          const prevState = prev as Record<string, unknown>;

          // Discriminated narrowing on entry.type recovers the precise data shape
          // for each clipboard kind — see ClipboardDataMap in canvasClipboard.ts.
          switch (entry.type) {
            case 'shape': {
              const d = entry.data;
              const next = { ...d, id: newId, x: d.x + offset, y: d.y + offset };
              const existing = getStateArray<unknown>(prevState, 'shapeInstances');
              newState.shapeInstances = [...existing, next];
              break;
            }
            case 'illustration': {
              const d = entry.data;
              const next = { ...d, id: newId, x: d.x + offset, y: d.y + offset };
              const existing = getStateArray<unknown>(prevState, 'illustrationInstances');
              newState.illustrationInstances = [...existing, next];
              break;
            }
            case 'balken': {
              const d = entry.data;
              const next = {
                ...d,
                id: newId,
                offset: {
                  x: (d.offset?.x || 0) + offset,
                  y: (d.offset?.y || 0) + offset,
                },
              };
              const existing = getStateArray<unknown>(prevState, 'balkenInstances');
              newState.balkenInstances = [...existing, next];
              break;
            }
            case 'additional-text': {
              const d = entry.data;
              const next = { ...d, id: newId, x: d.x + offset, y: d.y + offset };
              const existing = getStateArray<unknown>(prevState, 'additionalTexts');
              newState.additionalTexts = [...existing, next];
              break;
            }
            case 'asset': {
              const d = entry.data;
              const next = { ...d, id: newId, x: d.x + offset, y: d.y + offset };
              const existing = getStateArray<unknown>(prevState, 'assetInstances');
              newState.assetInstances = [...existing, next];
              break;
            }
            case 'pill-badge': {
              const d = entry.data;
              const next = { ...d, id: newId, x: d.x + offset, y: d.y + offset };
              const existing = getStateArray<unknown>(prevState, 'pillBadgeInstances');
              newState.pillBadgeInstances = [...existing, next];
              break;
            }
            case 'circle-badge': {
              const d = entry.data;
              const next = { ...d, id: newId, x: d.x + offset, y: d.y + offset };
              const existing = getStateArray<unknown>(prevState, 'circleBadgeInstances');
              newState.circleBadgeInstances = [...existing, next];
              break;
            }
            case 'frame': {
              const d = entry.data;
              const next = {
                ...d,
                id: newId,
                x: d.x + offset,
                y: d.y + offset,
                imageSrc: null, // Don't share object URL references
              };
              const existing = getStateArray<unknown>(prevState, 'frameInstances');
              newState.frameInstances = [...existing, next];
              break;
            }
            case 'user-image': {
              const d = entry.data;
              const next = { ...d, id: newId, x: d.x + offset, y: d.y + offset };
              const existing = getStateArray<unknown>(prevState, 'userImageInstances');
              newState.userImageInstances = [...existing, next];
              break;
            }
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

        const illustrations = getStateArray<IllustrationInstance>(
          currentState,
          'illustrationInstances'
        );
        const ill = illustrations.find((i) => i.id === selectedElement);
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

        const texts = getStateArray<{ id: string; x: number; y: number }>(
          currentState,
          'additionalTexts'
        );
        const text = texts.find((t) => t.id === selectedElement);
        if (text) {
          CanvasClipboard.copy('additional-text', text);
          return;
        }

        const assets = getStateArray<AssetInstance>(currentState, 'assetInstances');
        const asset = assets.find((a) => a.id === selectedElement);
        if (asset) {
          CanvasClipboard.copy('asset', asset);
          return;
        }

        const pillBadges = getStateArray<PillBadgeInstance>(currentState, 'pillBadgeInstances');
        const pillBadge = pillBadges.find((p) => p.id === selectedElement);
        if (pillBadge) {
          CanvasClipboard.copy('pill-badge', pillBadge);
          return;
        }

        const circleBadges = getStateArray<CircleBadgeInstance>(
          currentState,
          'circleBadgeInstances'
        );
        const circleBadge = circleBadges.find((c) => c.id === selectedElement);
        if (circleBadge) {
          CanvasClipboard.copy('circle-badge', circleBadge);
          return;
        }

        const frames = getStateArray<FrameInstance>(currentState, 'frameInstances');
        const frame = frames.find((f) => f.id === selectedElement);
        if (frame) {
          CanvasClipboard.copy('frame', frame);
          return;
        }

        const userImages = getStateArray<{ id: string; x: number; y: number }>(
          currentState,
          'userImageInstances'
        );
        const userImage = userImages.find((u) => u.id === selectedElement);
        if (userImage) {
          CanvasClipboard.copy('user-image', userImage);
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

        // Remove User Image
        const userImageInstances = getStateArray<unknown>(currentState, 'userImageInstances');
        if (
          userImageInstances.find((u: unknown) => {
            const imgObj = u as { id?: string };
            return imgObj.id === selectedElement;
          })
        ) {
          if (currentActions.removeUserImage) {
            currentActions.removeUserImage(selectedElement);
            setSelectedElement(null);
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store, setState, setSelectedElement]);
}

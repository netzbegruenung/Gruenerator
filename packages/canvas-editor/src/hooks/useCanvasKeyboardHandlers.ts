import { useEffect, useRef } from 'react';

import { CanvasClipboard } from '../utils/canvasClipboard';

import type { OptionalCanvasActions } from './useCanvasElementHandlers';
import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';
import type { AssetInstance } from '../utils/canvasAssets';
import type { CircleBadgeInstance } from '../utils/circleBadgeUtils';
import type { FrameInstance } from '../utils/frameUtils';
import type { IllustrationInstance } from '../utils/illustrations/types';
import type { PillBadgeInstance } from '../utils/pillBadgeUtils';
import type { ShapeInstance } from '../utils/shapes';
import type { UserImageInstance } from '../utils/userImageUtils';
import type { BalkenInstance } from '../primitives';
import type { AdditionalText } from '../configs/types';

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

export interface UseCanvasKeyboardHandlersOptions<TState extends Partial<BaseCanvasState>> {
  store: CanvasEditorStoreApi;
  state: TState;
  actions: OptionalCanvasActions;
  setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void;
  setSelectedElement: (id: string | null) => void;
}

/**
 * Hook to handle keyboard shortcuts for canvas operations
 */
export function useCanvasKeyboardHandlers<TState extends Partial<BaseCanvasState>>(
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
          // Try each element type
          const shape = prev.shapeInstances?.find((s) => s.id === selectedElement);
          if (shape) {
            return {
              ...prev,
              shapeInstances: [
                ...(prev.shapeInstances ?? []),
                { ...shape, id: newId, x: shape.x + offset, y: shape.y + offset },
              ],
            };
          }

          const text = prev.additionalTexts?.find((t) => t.id === selectedElement);
          if (text) {
            return {
              ...prev,
              additionalTexts: [
                ...(prev.additionalTexts ?? []),
                { ...text, id: newId, x: text.x + offset, y: text.y + offset },
              ],
            };
          }

          const balken = prev.balkenInstances?.find((b) => b.id === selectedElement);
          if (balken) {
            return {
              ...prev,
              balkenInstances: [
                ...(prev.balkenInstances ?? []),
                {
                  ...balken,
                  id: newId,
                  offset: {
                    x: (balken.offset?.x || 0) + offset,
                    y: (balken.offset?.y || 0) + offset,
                  },
                },
              ],
            };
          }

          const ill = prev.illustrationInstances?.find((i) => i.id === selectedElement);
          if (ill) {
            return {
              ...prev,
              illustrationInstances: [
                ...(prev.illustrationInstances ?? []),
                { ...ill, id: newId, x: ill.x + offset, y: ill.y + offset },
              ],
            };
          }

          const asset = prev.assetInstances?.find((a) => a.id === selectedElement);
          if (asset) {
            return {
              ...prev,
              assetInstances: [
                ...(prev.assetInstances ?? []),
                { ...asset, id: newId, x: asset.x + offset, y: asset.y + offset },
              ],
            };
          }

          const userImage = prev.userImageInstances?.find((u) => u.id === selectedElement);
          if (userImage) {
            return {
              ...prev,
              userImageInstances: [
                ...(prev.userImageInstances ?? []),
                { ...userImage, id: newId, x: userImage.x + offset, y: userImage.y + offset },
              ],
            };
          }

          return prev;
        });

        setTimeout(() => setSelectedElement(newId), 0);
        return;
      }

      // PASTE (Ctrl+V) — clipboard data crosses the type boundary; cast at the seam.
      if (isCtrlOrCmd && e.key === 'v') {
        const clipboardData = CanvasClipboard.paste();
        if (!clipboardData) return;

        const { type, data } = clipboardData;
        if (typeof data !== 'object' || data === null) return;

        const newId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const offset = 20;

        setState((prev) => {
          if (type === 'shape') {
            const src = data as unknown as ShapeInstance;
            return {
              ...prev,
              shapeInstances: [
                ...(prev.shapeInstances ?? []),
                { ...src, id: newId, x: src.x + offset, y: src.y + offset },
              ],
            };
          }
          if (type === 'illustration') {
            const src = data as unknown as IllustrationInstance;
            return {
              ...prev,
              illustrationInstances: [
                ...(prev.illustrationInstances ?? []),
                { ...src, id: newId, x: src.x + offset, y: src.y + offset },
              ],
            };
          }
          if (type === 'balken') {
            const src = data as unknown as BalkenInstance;
            return {
              ...prev,
              balkenInstances: [
                ...(prev.balkenInstances ?? []),
                {
                  ...src,
                  id: newId,
                  offset: {
                    x: (src.offset?.x || 0) + offset,
                    y: (src.offset?.y || 0) + offset,
                  },
                },
              ],
            };
          }
          if (type === 'additional-text') {
            const src = data as unknown as AdditionalText;
            return {
              ...prev,
              additionalTexts: [
                ...(prev.additionalTexts ?? []),
                { ...src, id: newId, x: src.x + offset, y: src.y + offset },
              ],
            };
          }
          if (type === 'asset') {
            const src = data as unknown as AssetInstance;
            return {
              ...prev,
              assetInstances: [
                ...(prev.assetInstances ?? []),
                { ...src, id: newId, x: src.x + offset, y: src.y + offset },
              ],
            };
          }
          if (type === 'pill-badge') {
            const src = data as unknown as PillBadgeInstance;
            return {
              ...prev,
              pillBadgeInstances: [
                ...(prev.pillBadgeInstances ?? []),
                { ...src, id: newId, x: src.x + offset, y: src.y + offset },
              ],
            };
          }
          if (type === 'frame') {
            const src = data as unknown as FrameInstance;
            return {
              ...prev,
              frameInstances: [
                ...(prev.frameInstances ?? []),
                {
                  ...src,
                  id: newId,
                  x: src.x + offset,
                  y: src.y + offset,
                  imageSrc: null, // Don't share object URL references
                },
              ],
            };
          }
          if (type === 'user-image') {
            const src = data as unknown as UserImageInstance;
            return {
              ...prev,
              userImageInstances: [
                ...(prev.userImageInstances ?? []),
                { ...src, id: newId, x: src.x + offset, y: src.y + offset },
              ],
            };
          }
          if (type === 'circle-badge') {
            const src = data as unknown as CircleBadgeInstance;
            return {
              ...prev,
              circleBadgeInstances: [
                ...(prev.circleBadgeInstances ?? []),
                { ...src, id: newId, x: src.x + offset, y: src.y + offset },
              ],
            };
          }

          return prev;
        });

        setTimeout(() => setSelectedElement(newId), 0);
        return;
      }

      if (!selectedElement) return;

      // COPY (Ctrl+C)
      if (isCtrlOrCmd && e.key === 'c') {
        const shape = currentState.shapeInstances?.find((s) => s.id === selectedElement);
        if (shape) {
          CanvasClipboard.copy('shape', shape);
          return;
        }

        const ill = currentState.illustrationInstances?.find((i) => i.id === selectedElement);
        if (ill) {
          CanvasClipboard.copy('illustration', ill);
          return;
        }

        const balken = currentState.balkenInstances?.find((b) => b.id === selectedElement);
        if (balken) {
          CanvasClipboard.copy('balken', balken);
          return;
        }

        const text = currentState.additionalTexts?.find((t) => t.id === selectedElement);
        if (text) {
          CanvasClipboard.copy('additional-text', text);
          return;
        }

        const asset = currentState.assetInstances?.find((a) => a.id === selectedElement);
        if (asset) {
          CanvasClipboard.copy('asset', asset);
          return;
        }

        const pillBadge = currentState.pillBadgeInstances?.find((p) => p.id === selectedElement);
        if (pillBadge) {
          CanvasClipboard.copy('pill-badge', pillBadge);
          return;
        }

        const frame = currentState.frameInstances?.find((f) => f.id === selectedElement);
        if (frame) {
          CanvasClipboard.copy('frame', frame);
          return;
        }

        const userImage = currentState.userImageInstances?.find((u) => u.id === selectedElement);
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
        const frame = currentState.frameInstances?.find((f) => f.id === selectedElement);
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
        if (currentState.balkenInstances?.find((b) => b.id === selectedElement)) {
          if (currentActions.removeBalken) {
            currentActions.removeBalken(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        if (currentState.selectedIcons?.includes(selectedElement)) {
          if (currentActions.toggleIcon) {
            currentActions.toggleIcon(selectedElement, false);
            setSelectedElement(null);
            return;
          }
        }

        if (currentState.shapeInstances?.find((s) => s.id === selectedElement)) {
          if (currentActions.removeShape) {
            currentActions.removeShape(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        if (currentState.additionalTexts?.find((t) => t.id === selectedElement)) {
          if (currentActions.removeAdditionalText) {
            currentActions.removeAdditionalText(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        if (currentState.illustrationInstances?.find((i) => i.id === selectedElement)) {
          if (currentActions.removeIllustration) {
            currentActions.removeIllustration(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        if (currentState.assetInstances?.find((a) => a.id === selectedElement)) {
          if (currentActions.removeAsset) {
            currentActions.removeAsset(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        if (currentState.pillBadgeInstances?.find((p) => p.id === selectedElement)) {
          if (currentActions.removePillBadge) {
            currentActions.removePillBadge(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        if (currentState.frameInstances?.find((f) => f.id === selectedElement)) {
          if (currentActions.removeFrame) {
            currentActions.removeFrame(selectedElement);
            setSelectedElement(null);
            return;
          }
        }

        if (currentState.userImageInstances?.find((u) => u.id === selectedElement)) {
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

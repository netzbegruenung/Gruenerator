import { useEffect, useRef } from 'react';

import { CanvasClipboard } from '../utils/canvasClipboard';

import type { OptionalCanvasActions } from './useCanvasElementHandlers';
import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';

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

      // PASTE (Ctrl+V) — `ClipboardItem` is a discriminated union, so each
      // branch below auto-narrows `clipboardData.data` to the right shape.
      // We deliberately do NOT destructure (destructuring breaks the link
      // between the discriminant and the payload).
      if (isCtrlOrCmd && e.key === 'v') {
        const clipboardData = CanvasClipboard.paste();
        if (!clipboardData) return;

        const newId = `${clipboardData.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const offset = 20;

        setState((prev) => {
          if (clipboardData.type === 'shape') {
            const src = clipboardData.data;
            return {
              ...prev,
              shapeInstances: [
                ...(prev.shapeInstances ?? []),
                { ...src, id: newId, x: src.x + offset, y: src.y + offset },
              ],
            };
          }
          if (clipboardData.type === 'illustration') {
            const src = clipboardData.data;
            return {
              ...prev,
              illustrationInstances: [
                ...(prev.illustrationInstances ?? []),
                { ...src, id: newId, x: src.x + offset, y: src.y + offset },
              ],
            };
          }
          if (clipboardData.type === 'balken') {
            const src = clipboardData.data;
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
          if (clipboardData.type === 'additional-text') {
            const src = clipboardData.data;
            return {
              ...prev,
              additionalTexts: [
                ...(prev.additionalTexts ?? []),
                { ...src, id: newId, x: src.x + offset, y: src.y + offset },
              ],
            };
          }
          if (clipboardData.type === 'asset') {
            const src = clipboardData.data;
            return {
              ...prev,
              assetInstances: [
                ...(prev.assetInstances ?? []),
                { ...src, id: newId, x: src.x + offset, y: src.y + offset },
              ],
            };
          }
          if (clipboardData.type === 'pill-badge') {
            const src = clipboardData.data;
            return {
              ...prev,
              pillBadgeInstances: [
                ...(prev.pillBadgeInstances ?? []),
                { ...src, id: newId, x: src.x + offset, y: src.y + offset },
              ],
            };
          }
          if (clipboardData.type === 'frame') {
            const src = clipboardData.data;
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
          if (clipboardData.type === 'user-image') {
            const src = clipboardData.data;
            return {
              ...prev,
              userImageInstances: [
                ...(prev.userImageInstances ?? []),
                { ...src, id: newId, x: src.x + offset, y: src.y + offset },
              ],
            };
          }
          if (clipboardData.type === 'circle-badge') {
            const src = clipboardData.data;
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

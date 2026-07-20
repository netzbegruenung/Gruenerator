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

      // ESCAPE — deselect (skipped while typing in an inline editor or input)
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement | null;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target?.isContentEditable
        ) {
          return;
        }
        if (selectedElement) setSelectedElement(null);
        return;
      }

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

          const chart = prev.chartInstances?.find((c) => c.id === selectedElement);
          if (chart) {
            return {
              ...prev,
              chartInstances: [
                ...(prev.chartInstances ?? []),
                {
                  ...chart,
                  id: newId,
                  x: chart.x + offset,
                  y: chart.y + offset,
                  data: chart.data.map((d) => ({ ...d })),
                  colors: [...chart.colors],
                },
              ],
            };
          }

          return prev;
        });

        setTimeout(() => setSelectedElement(newId), 0);
        return;
      }

      // PASTE (Ctrl+V) — `ClipboardEntry` is a discriminated union, so each
      // branch below auto-narrows `entry.data` to the right shape via the
      // switch on `entry.type`.
      if (isCtrlOrCmd && e.key === 'v') {
        const entry = CanvasClipboard.paste();
        if (!entry) return;

        const newId = `${entry.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const offset = 20;

        // Discriminated narrowing on entry.type recovers the precise data shape
        // for each clipboard kind — see ClipboardDataMap in canvasClipboard.ts.
        // Uses test-branch's typed BaseCanvasState access (prev.fooInstances?.find)
        // and spread-into-prev pattern, no getStateArray cast helper needed.
        setState((prev) => {
          switch (entry.type) {
            case 'shape': {
              const d = entry.data;
              return {
                ...prev,
                shapeInstances: [
                  ...(prev.shapeInstances ?? []),
                  { ...d, id: newId, x: d.x + offset, y: d.y + offset },
                ],
              };
            }
            case 'illustration': {
              const d = entry.data;
              return {
                ...prev,
                illustrationInstances: [
                  ...(prev.illustrationInstances ?? []),
                  { ...d, id: newId, x: d.x + offset, y: d.y + offset },
                ],
              };
            }
            case 'balken': {
              const d = entry.data;
              return {
                ...prev,
                balkenInstances: [
                  ...(prev.balkenInstances ?? []),
                  {
                    ...d,
                    id: newId,
                    offset: {
                      x: (d.offset?.x || 0) + offset,
                      y: (d.offset?.y || 0) + offset,
                    },
                  },
                ],
              };
            }
            case 'additional-text': {
              const d = entry.data;
              return {
                ...prev,
                additionalTexts: [
                  ...(prev.additionalTexts ?? []),
                  { ...d, id: newId, x: d.x + offset, y: d.y + offset },
                ],
              };
            }
            case 'asset': {
              const d = entry.data;
              return {
                ...prev,
                assetInstances: [
                  ...(prev.assetInstances ?? []),
                  { ...d, id: newId, x: d.x + offset, y: d.y + offset },
                ],
              };
            }
            case 'pill-badge': {
              const d = entry.data;
              return {
                ...prev,
                pillBadgeInstances: [
                  ...(prev.pillBadgeInstances ?? []),
                  { ...d, id: newId, x: d.x + offset, y: d.y + offset },
                ],
              };
            }
            case 'circle-badge': {
              const d = entry.data;
              return {
                ...prev,
                circleBadgeInstances: [
                  ...(prev.circleBadgeInstances ?? []),
                  { ...d, id: newId, x: d.x + offset, y: d.y + offset },
                ],
              };
            }
            case 'frame': {
              const d = entry.data;
              return {
                ...prev,
                frameInstances: [
                  ...(prev.frameInstances ?? []),
                  {
                    ...d,
                    id: newId,
                    x: d.x + offset,
                    y: d.y + offset,
                    imageSrc: null, // Don't share object URL references
                  },
                ],
              };
            }
            case 'user-image': {
              const d = entry.data;
              return {
                ...prev,
                userImageInstances: [
                  ...(prev.userImageInstances ?? []),
                  { ...d, id: newId, x: d.x + offset, y: d.y + offset },
                ],
              };
            }
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

        const circleBadge = currentState.circleBadgeInstances?.find(
          (c) => c.id === selectedElement
        );
        if (circleBadge) {
          CanvasClipboard.copy('circle-badge', circleBadge);
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
      if ((e.target as HTMLElement | null)?.isContentEditable) return;

      // ARROW KEYS — nudge selected element (1px, Shift = 10px)
      const NUDGE_DELTAS: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      if (e.key in NUDGE_DELTAS) {
        const [ux, uy] = NUDGE_DELTAS[e.key];
        const step = e.shiftKey ? 10 : 1;
        const dx = ux * step;
        const dy = uy * step;

        const shape = currentState.shapeInstances?.find((s) => s.id === selectedElement);
        if (shape && currentActions.updateShape) {
          e.preventDefault();
          currentActions.updateShape(selectedElement, { x: shape.x + dx, y: shape.y + dy });
          return;
        }
        const text = currentState.additionalTexts?.find((t) => t.id === selectedElement);
        if (text && currentActions.updateAdditionalText) {
          e.preventDefault();
          currentActions.updateAdditionalText(selectedElement, { x: text.x + dx, y: text.y + dy });
          return;
        }
        const ill = currentState.illustrationInstances?.find((i) => i.id === selectedElement);
        if (ill && currentActions.updateIllustration) {
          e.preventDefault();
          currentActions.updateIllustration(selectedElement, { x: ill.x + dx, y: ill.y + dy });
          return;
        }
        const asset = currentState.assetInstances?.find((a) => a.id === selectedElement);
        if (asset && currentActions.updateAsset) {
          e.preventDefault();
          currentActions.updateAsset(selectedElement, { x: asset.x + dx, y: asset.y + dy });
          return;
        }
        const frame = currentState.frameInstances?.find((f) => f.id === selectedElement);
        if (frame && currentActions.updateFrame) {
          e.preventDefault();
          currentActions.updateFrame(selectedElement, { x: frame.x + dx, y: frame.y + dy });
          return;
        }
        const pillBadge = currentState.pillBadgeInstances?.find((p) => p.id === selectedElement);
        if (pillBadge && currentActions.updatePillBadge) {
          e.preventDefault();
          currentActions.updatePillBadge(selectedElement, {
            x: pillBadge.x + dx,
            y: pillBadge.y + dy,
          });
          return;
        }
        const circleBadge = currentState.circleBadgeInstances?.find(
          (c) => c.id === selectedElement
        );
        if (circleBadge && currentActions.updateCircleBadge) {
          e.preventDefault();
          currentActions.updateCircleBadge(selectedElement, {
            x: circleBadge.x + dx,
            y: circleBadge.y + dy,
          });
          return;
        }
        const userImage = currentState.userImageInstances?.find((u) => u.id === selectedElement);
        if (userImage && currentActions.updateUserImage) {
          e.preventDefault();
          currentActions.updateUserImage(selectedElement, {
            x: userImage.x + dx,
            y: userImage.y + dy,
          });
          return;
        }
        const chartN = currentState.chartInstances?.find((c) => c.id === selectedElement);
        if (chartN && currentActions.updateChart) {
          e.preventDefault();
          currentActions.updateChart(selectedElement, { x: chartN.x + dx, y: chartN.y + dy });
          return;
        }
        const icon = currentState.iconStates?.[selectedElement];
        if (icon && currentActions.updateIcon) {
          e.preventDefault();
          currentActions.updateIcon(selectedElement, { x: icon.x + dx, y: icon.y + dy });
          return;
        }
        const balken = currentState.balkenInstances?.find((b) => b.id === selectedElement);
        if (balken && currentActions.updateBalken) {
          e.preventDefault();
          currentActions.updateBalken(selectedElement, {
            offset: { x: (balken.offset?.x ?? 0) + dx, y: (balken.offset?.y ?? 0) + dy },
          });
          return;
        }
        return;
      }

      // ENTER — open file picker for selected frame
      if (e.key === 'Enter' && currentActions.setFrameImage) {
        const setFrameImage = currentActions.setFrameImage;
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
              setFrameImage(selectedElement, file, objectUrl);
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

        if (currentState.chartInstances?.find((c) => c.id === selectedElement)) {
          if (currentActions.removeChart) {
            currentActions.removeChart(selectedElement);
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

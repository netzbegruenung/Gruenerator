import { useEffect, useRef } from 'react';

import { CanvasClipboard } from '../utils/canvasClipboard';
import {
  duplicateElementInState,
  findDuplicableEntry,
  insertInstance,
} from '../utils/duplicateElement';
import { assertAsPosition } from '../utils/stateTypeAssertions';
import { findTemplateEntry } from '../utils/templateElementInstance';

import type { OptionalCanvasActions } from './useCanvasElementHandlers';
import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { CanvasElementConfig, LayoutResult } from '../configs/types';
import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';

/**
 * Canvas Keyboard Handlers - Keyboard shortcuts for canvas
 *
 * Handles:
 * - Copy (Ctrl+C): Copy selected element to clipboard
 * - Paste (Ctrl+V): Paste clipboard element with offset
 * - Duplicate (Ctrl+D): Copy + paste in one step
 * - Delete/Backspace: Remove selected element
 * - Arrow keys: nudge, Enter: pick a frame image, Escape: deselect
 *
 * Kopieren, Einfügen und Duplizieren teilen sich mit dem Knopf in der
 * Kontextleiste eine Tür: `utils/duplicateElement.ts`. Wer hier eine
 * Elementart vermisst, trägt sie dort ein, nicht hier.
 *
 * Automatically prevents actions when typing in input/textarea fields.
 */

export interface UseCanvasKeyboardHandlersOptions<TState extends Partial<BaseCanvasState>> {
  store: CanvasEditorStoreApi;
  state: TState;
  actions: OptionalCanvasActions;
  setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void;
  setSelectedElement: (id: string | null) => void;
  /** Config-Elemente der Vorlage — fuer Pfeiltasten an layoutgebundenen Elementen. */
  elements?: readonly CanvasElementConfig<TState>[];
  /** Gerechnetes Layout — zusammen mit `elements` die aufgeloeste Lage einer
   *  Vorlagen-Grafik, aus der Strg+D eine Asset-Instanz macht (#3403). */
  layout?: LayoutResult;
  saveToHistory?: (state: TState) => void;
}

/**
 * Hook to handle keyboard shortcuts for canvas operations
 */
export function useCanvasKeyboardHandlers<TState extends Partial<BaseCanvasState>>(
  options: UseCanvasKeyboardHandlersOptions<TState>
): void {
  const { store, state, actions, setState, setSelectedElement, elements, layout, saveToHistory } =
    options;

  // Use refs for values that the handler reads but shouldn't trigger re-attachment
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  const elementsRef = useRef(elements);
  const layoutRef = useRef(layout);
  const saveToHistoryRef = useRef(saveToHistory);
  useEffect(() => {
    stateRef.current = state;
    actionsRef.current = actions;
    elementsRef.current = elements;
    layoutRef.current = layout;
    saveToHistoryRef.current = saveToHistory;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const selectedElement = store.getState().selectedElement;
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const currentState = stateRef.current;
      const currentActions = actionsRef.current;
      /** Vorlagen-Grafiken: dieselbe Tür wie für den Knopf in der Kontextleiste. */
      const templateEntry = (id: string) =>
        findTemplateEntry(elementsRef.current, currentState, layoutRef.current, id);

      // Während getippt wird gehört JEDE dieser Tasten dem Textfeld: Strg+D
      // setzt dort kein Duplikat auf die Fläche, Strg+C/V meint die Textauswahl.
      // Der Schutz stand früher hinter Duplizieren/Einfügen/Kopieren und wirkte
      // deshalb fuer genau die drei nicht.
      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      // ESCAPE — deselect (skipped while typing in an inline editor or input)
      if (e.key === 'Escape') {
        if (isTyping) return;
        if (selectedElement) setSelectedElement(null);
        return;
      }

      if (isTyping) return;

      // DUPLICATE (Ctrl+D) — dieselbe Tür wie der Knopf in der Kontextleiste.
      if (isCtrlOrCmd && e.key === 'd' && selectedElement) {
        e.preventDefault();
        // Das Ergebnis wird VOR dem Schreiben berechnet, nicht im Updater:
        // React ruft den Updater erst beim nächsten Rendern, die neue Id und
        // der Zustand für den Verlauf stünden hier sonst noch nicht bereit.
        const result = duplicateElementInState(currentState, selectedElement, {
          template: templateEntry,
        });
        if (!result) return;
        setState(result.state);
        // Ohne diesen Eintrag lässt sich das Duplikat nicht rückgängig machen:
        // `setState` allein schreibt keinen Verlauf.
        saveToHistoryRef.current?.(result.state);
        setTimeout(() => setSelectedElement(result.newId), 0);
        return;
      }

      // PASTE (Ctrl+V)
      if (isCtrlOrCmd && e.key === 'v') {
        const entry = CanvasClipboard.paste();
        if (!entry) return;

        const result = insertInstance(currentState, entry);
        setState(result.state);
        saveToHistoryRef.current?.(result.state);
        setTimeout(() => setSelectedElement(result.newId), 0);
        return;
      }

      if (!selectedElement) return;

      // COPY (Ctrl+C)
      if (isCtrlOrCmd && e.key === 'c') {
        const entry = findDuplicableEntry(currentState, selectedElement, templateEntry);
        if (entry) CanvasClipboard.copy(entry.type, entry.data);
        return;
      }

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

        // Config-Elemente der Vorlage (Pfeil, Sonnenblume, Zitatzeichen …).
        // Sie sind keine Instanz in einer Liste, ihre Position steht im
        // `positionStateKey`; die aktuelle Lage kommt aus der gemeldeten
        // Geometrie, damit auch das erste Antippen von der Layout-Position
        // aus rechnet statt bei 0/0 anzufangen.
        const elementConfig = elementsRef.current?.find((el) => el.id === selectedElement);
        const positionKey =
          elementConfig && (elementConfig.type === 'image' || elementConfig.type === 'text')
            ? elementConfig.positionStateKey
            : undefined;
        if (positionKey) {
          const stored = (currentState as Record<string, unknown>)[positionKey];
          const base =
            stored != null
              ? assertAsPosition(stored)
              : store.getState().elementPositions[selectedElement];
          if (base) {
            e.preventDefault();
            const nextPosition = { x: base.x + dx, y: base.y + dy };
            setState({ [positionKey]: nextPosition } as Partial<TState>);
            saveToHistoryRef.current?.({
              ...currentState,
              [positionKey]: nextPosition,
            } as TState);
            return;
          }
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

        if (currentState.circleBadgeInstances?.find((c) => c.id === selectedElement)) {
          if (currentActions.removeCircleBadge) {
            currentActions.removeCircleBadge(selectedElement);
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

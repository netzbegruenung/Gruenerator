import { useEffect, useRef } from 'react';

import { commandForKey } from '../utils/canvasCommandRegistry';
import { returnFocusToPage } from '../utils/editorFocus';
import { isTextEditingTarget, isWidgetOwnedKey } from '../utils/keyboardOwnership';
import { isLayerLocked } from '../utils/layerLock';
import { assertAsPosition } from '../utils/stateTypeAssertions';

import type { OptionalCanvasActions } from './useCanvasElementHandlers';
import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { CanvasElementConfig } from '../configs/types';
import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';
import type { CanvasCommands } from '../utils/canvasCommands';

/**
 * Canvas Keyboard Handlers - Keyboard shortcuts for canvas
 *
 * Die Kürzel stehen in `utils/canvasCommandRegistry.ts` und laufen über
 * dieselben Türen wie Kontextmenü und Leiste (`utils/canvasCommands.ts`).
 * Hier bleiben nur die Tasten, die keine Befehle sind: Pfeile schieben,
 * Escape hebt die Auswahl auf.
 *
 * Automatically prevents actions when typing in input/textarea fields.
 */

export interface UseCanvasKeyboardHandlersOptions<TState extends Partial<BaseCanvasState>> {
  store: CanvasEditorStoreApi;
  state: TState;
  actions: OptionalCanvasActions;
  setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void;
  setSelectedElement: (id: string | null) => void;
  /** Die Türen der Seite — Kopieren, Einfügen, Duplizieren, Löschen … */
  commands: CanvasCommands;
  /** Config-Elemente der Vorlage — fuer Pfeiltasten an layoutgebundenen Elementen. */
  elements?: readonly CanvasElementConfig<TState>[];
  saveToHistory?: (state: TState) => void;
  /**
   * Attach the global keydown listener. Defaults to true; offscreen preview
   * canvases pass false so a hidden, render-once stage never answers the
   * user's Delete or Cmd+Z.
   */
  enabled?: boolean;
}

/**
 * Hook to handle keyboard shortcuts for canvas operations
 */
export function useCanvasKeyboardHandlers<TState extends Partial<BaseCanvasState>>(
  options: UseCanvasKeyboardHandlersOptions<TState>
): void {
  const {
    store,
    state,
    actions,
    setState,
    setSelectedElement,
    commands,
    elements,
    saveToHistory,
    enabled = true,
  } = options;

  // Use refs for values that the handler reads but shouldn't trigger re-attachment
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  const commandsRef = useRef(commands);
  const elementsRef = useRef(elements);
  const saveToHistoryRef = useRef(saveToHistory);
  useEffect(() => {
    stateRef.current = state;
    actionsRef.current = actions;
    commandsRef.current = commands;
    elementsRef.current = elements;
    saveToHistoryRef.current = saveToHistory;
  });

  useEffect(() => {
    // Ging der Fokus mit dem Gelöschten verloren, landet er auf der Seite.
    // Aus der Ebenen-Liste heraus nimmt ihn deren nächster Eintrag
    // (`LayersSection`), nicht die Seite.
    const keepFocusAfterRemoval = (target: EventTarget | null) => {
      const from = target instanceof Element ? target : null;
      if (from?.closest('[role="listbox"]')) return;
      returnFocusToPage(from);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const selectedElement = store.getState().selectedElement;
      const currentState = stateRef.current;
      const currentActions = actionsRef.current;

      // Während getippt wird gehört JEDE dieser Tasten dem Textfeld: Strg+D
      // setzt dort kein Duplikat auf die Fläche, Strg+C/V meint die Textauswahl.
      // Der Schutz stand früher hinter Duplizieren/Einfügen/Kopieren und wirkte
      // deshalb fuer genau die drei nicht.
      // Auch die Formatleiste des offenen Texteditors zählt als Tippen.
      // Hat ein Widget die Taste schon verbraucht (Radix-Regler bei Alt+Pfeil),
      // schiebt der Editor nicht noch zusätzlich.
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const isTyping = isTextEditingTarget(target);
      // Im offenen Kontextmenü gehören Pfeile, Enter und Escape dem Menü:
      // sonst schöbe ArrowDown das Element und Enter öffnete die Dateiauswahl.
      if (target instanceof Element && target.closest('[role="menu"]')) return;
      // Was ein fokussiertes Widget selbst verbraucht (Pfeile am Regler, Enter
      // am Knopf, Escape im Dialog), erreicht die Canvas-Aktionen nicht.
      if (isWidgetOwnedKey(e)) return;

      // Ausschnitt mode: Escape or Enter ends it and keeps the photo selected;
      // the other keys wait, so an arrow cannot move the frame mid-crop.
      if (!isTyping && store.getState().croppingElement) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          store.getState().setCroppingElement(null);
        }
        return;
      }

      // ESCAPE — deselect (skipped while typing in an inline editor or input)
      if (e.key === 'Escape') {
        if (isTyping) return;
        if (store.getState().selectedLayerIds.length > 0) setSelectedElement(null);
        return;
      }

      if (isTyping) return;

      const selection = store.getState().selectedLayerIds;
      const commands = commandsRef.current;
      const command = commandForKey(e);
      switch (command) {
        case 'duplicate':
          if (selection.length === 0) break;
          e.preventDefault();
          commands.duplicate();
          return;
        case 'paste':
          commands.paste(null);
          return;
        case 'copy':
          commands.copy();
          return;
        case 'cut':
          if (selection.length === 0) break;
          e.preventDefault();
          commands.cut();
          keepFocusAfterRemoval(target);
          return;
        case 'selectAll':
          e.preventDefault();
          commands.selectAll();
          return;
        case 'delete':
          commands.remove();
          if (selection.length > 0) keepFocusAfterRemoval(target);
          return;
        case 'insertFrameImage':
          if (selection.length === 1 && commands.insertFrameImage()) {
            e.preventDefault();
            return;
          }
          break;
        case 'editText':
          // Nur ein Text: der Doppelklick, den die Tür auslöst, schaltete ein
          // Bild in den Ausschnitt.
          if (!commands.capabilities().canEditText) break;
          e.preventDefault();
          commands.editText();
          return;
        case 'flipHorizontal':
        case 'flipVertical':
          if (selection.length === 0) break;
          e.preventDefault();
          commands.flip(command === 'flipHorizontal' ? 'x' : 'y');
          return;
        default:
          break;
      }

      // Schieben gibt es nur für ein einzelnes Element.
      if (selection.length > 1 || !selectedElement) return;

      // ARROW KEYS — nudge selected element (1px, Shift = 10px)
      const NUDGE_DELTAS: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      if (e.key in NUDGE_DELTAS) {
        // Gesperrt: die Pfeile schieben nicht, scrollen aber auch nicht die Seite.
        if (isLayerLocked(currentState, selectedElement)) {
          e.preventDefault();
          return;
        }
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
    };

    if (!enabled) return undefined;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store, setState, setSelectedElement, enabled]);
}

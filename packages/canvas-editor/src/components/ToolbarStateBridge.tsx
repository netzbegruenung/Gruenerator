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

import { toast } from '@gruenerator/ui';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

import { useCanvasEditorServices } from '../CanvasEditorProvider';
import { useFloatingModuleHandlers } from '../hooks/useFloatingModuleHandlers';
import { useFloatingModuleState } from '../hooks/useFloatingModuleState';
import { useOptionalUserUploads } from '../sidebar/UserUploadsProvider';
import {
  useCanvasStore,
  useCanvasStoreSelector,
  useCanvasStoreShallow,
} from '../stores/CanvasStoreProvider';
import { cropRotationOf, cropRotationUpdate } from '../utils/cropSession';
import { cropImageSrc, expandResetPatch, expandTarget } from '../utils/expandImage';
import { buildPlacementUrl, fetchShareImageFile } from '../utils/mediaPlacement';
import { findOrientationDoor } from '../utils/orientElement';
import { selectionCapabilities } from '../utils/selectionCapabilities';
import {
  smartCropSource,
  smartCropUpdate,
  smartCropView,
  suggestSmartCrop,
} from '../utils/smartCrop';
import { findTemplateEntry } from '../utils/templateElementInstance';

import type { ToolbarStateReport } from './GenericCanvas';
import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { CanvasElementConfig, FullCanvasConfig, LayoutResult } from '../configs/types';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';
import type { ShadowPatch } from '../hooks/useFloatingModuleHandlers';
import type { FloatingModuleState } from '../hooks/useFloatingModuleState';
import type { CanvasItem } from '../utils/canvasLayerManager';
import type { Rect } from '../utils/coverFit';
import type { CropAspectId } from '../utils/cropAspect';
import type { GradientFill } from '../utils/gradientFill';
import type { TextAlign } from '../utils/textAlign';
import type Konva from 'konva';

export interface ToolbarBridgeState {
  activeFloatingModule: FloatingModuleState | null;
  handleColorSelect: (color: string) => void;
  handleOpacityChange: (id: string, opacity: number, type: string) => void;
  handleShadowChange: (id: string, patch: ShadowPatch, type: string) => void;
  handleOutlineChange: (id: string, patch: { stroke?: string; strokeWidth?: number }) => void;
  handleBlurChange: (id: string, blur: number) => void;
  handleGradientSelect: (gradient: GradientFill | null) => void;
  handleTextAlignChange: (id: string, align: TextAlign) => void;
  /** Ausschnitt mode for the selected framed photo. */
  handleCropImage: () => void;
  /** Seitenverhältnis-Vorgabe im Zuschneide-Modus eines eigenen Bildes. */
  handleCropAspect: (id: CropAspectId) => void;
  /** Begradigen im Zuschneide-Modus, Grad. */
  handleCropRotation: (deg: number) => void;
  /** „Automatisch" im Zuschneide-Modus: smartcrop wählt den Ausschnitt. */
  handleSmartCrop: () => void;
  /** „Erweitern" im Zuschneide-Modus: die KI ergänzt das Foto auf das Rahmenformat. */
  handleExpandImage: () => void;
}

const SMART_CROP_FAILED = 'Automatischer Ausschnitt nicht möglich';
const EXPAND_FAILED = 'Erweitern hat nicht geklappt. Bitte versuche es noch einmal.';

interface ToolbarStateBridgeProps<
  TState extends Record<string, unknown> & Partial<BaseCanvasState>,
  TActions extends OptionalCanvasActions,
> {
  bridgeRef: MutableRefObject<ToolbarBridgeState | null>;
  config: FullCanvasConfig<TState, TActions>;
  state: TState;
  layout: LayoutResult;
  actions: TActions;
  sortedRenderList: CanvasItem[];
  setState: (partial: Partial<TState> | ((prev: TState) => TState)) => void;
  debouncedSaveToHistory: (state: TState) => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Lesemodus: Drehen & Spiegeln werden nicht angeboten. */
  readOnly: boolean;
  saveToHistory: (state: TState) => void;
  /** Mehrere Speicherungen als ein Verlaufsschritt (Erweitern: neue Quelle und Zuschnitt). */
  runHistoryBatch: (fn: () => void) => void;
  /** Zähler von „Abbrechen" (`useCropSession`): Abbrechen verwirft ein laufendes Erweitern. */
  cropCancelCount: () => number;
  /** Die Bühne der Seite: „Automatisch" liest dort das geladene Foto. */
  getStage: () => Konva.Stage | null;
  onToolbarStateChange?: (state: ToolbarStateReport) => void;
}

export function ToolbarStateBridge<
  TState extends Record<string, unknown> & Partial<BaseCanvasState>,
  TActions extends OptionalCanvasActions,
>({
  bridgeRef,
  config,
  state,
  layout,
  actions,
  sortedRenderList,
  setState,
  debouncedSaveToHistory,
  canUndo,
  canRedo,
  readOnly,
  saveToHistory,
  runHistoryBatch,
  cropCancelCount,
  getStage,
  onToolbarStateChange,
}: ToolbarStateBridgeProps<TState, TActions>) {
  const store = useCanvasStore();
  const { expandImage } = useCanvasEditorServices();
  const uploads = useOptionalUserUploads();
  // Je Seite höchstens ein Erweitern zugleich; es kostet KI-Budget.
  const [isExpanding, setIsExpanding] = useState(false);
  const expandingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const selectedElement = useCanvasStoreSelector((s) => s.selectedElement);

  const activeFloatingModule = useFloatingModuleState({
    selectedElement,
    config,
    state,
    layout,
  });

  const selectedLayerIds = useCanvasStoreShallow((s) => s.selectedLayerIds);
  const setCroppingElement = useCanvasStoreSelector((s) => s.setCroppingElement);
  const isCropping = useCanvasStoreSelector(
    (s) => s.croppingElement !== null && s.croppingElement === s.selectedElement
  );
  const cropAspect = useCanvasStoreSelector((s) => s.cropAspect);
  const setCropAspect = useCanvasStoreSelector((s) => s.setCropAspect);
  const croppingElement = useCanvasStoreSelector((s) => s.croppingElement);
  const cropTarget = isCropping ? croppingElement : null;
  const cropRotation = cropTarget ? cropRotationOf(state, cropTarget) : 0;

  /**
   * Vorlagen-Grafiken liegen in keiner Sammlung des Zustands — gefunden werden
   * sie nur über die Elementliste der Vorlage und das gerechnete Layout. Beides
   * hat dieser Bridge, `duplicateElement` nicht (#3403).
   */
  const templateEntry = useCallback(
    (id: string) => findTemplateEntry(config.elements, state, layout, id),
    [config.elements, state, layout]
  );

  // Dieselben Fragen, die die Türen beim Ausführen stellen (`utils/canvasCommands.ts`).
  const capabilities = selectionCapabilities({
    ids: selectedLayerIds,
    state,
    actions,
    template: templateEntry,
    renderList: sortedRenderList,
    orient: (id) =>
      findOrientationDoor(
        {
          state,
          actions,
          // Die Tür liest nur id, Typ und Positionsschlüssel (wie in GenericCanvas).
          elements: config.elements as readonly CanvasElementConfig[],
          layout,
          updateState: setState,
          saveToHistory,
        },
        id
      ),
    readOnly,
  });

  const floatingHandlers = useFloatingModuleHandlers({
    activeFloatingModule,
    actions,
    config,
    state,
    setState,
    debouncedSaveToHistory,
  });

  // Nach dem Warten auf smartcrop schreibt der Stand der letzten Darstellung, nicht der beim Klick.
  const applySmartCropRef = useRef<
    (id: string, src: string | null, image: HTMLImageElement, region: Rect) => void
  >(() => {});
  const applyExpandRef = useRef<(id: string, src: string, file: File, url: string) => void>(
    () => {}
  );

  // Write bridge state for GenericCanvasInner's useImperativeHandle.
  // Uses useEffect (not render-time assignment) for React 19 concurrent mode safety.
  useEffect(() => {
    bridgeRef.current = {
      activeFloatingModule,
      handleColorSelect: floatingHandlers.handleColorSelect,
      handleOpacityChange: floatingHandlers.handleOpacityChange,
      handleShadowChange: floatingHandlers.handleShadowChange,
      handleOutlineChange: floatingHandlers.handleOutlineChange,
      handleBlurChange: floatingHandlers.handleBlurChange,
      handleGradientSelect: floatingHandlers.handleGradientSelect,
      handleTextAlignChange: floatingHandlers.handleTextAlignChange,
      handleCropImage: () => setCroppingElement(isCropping ? null : selectedElement),
      handleCropAspect: setCropAspect,
      handleCropRotation: (deg) => {
        if (!cropTarget) return;
        const update = cropRotationUpdate(state, cropTarget, deg);
        if (!update) return;
        if (update.kind === 'user-image') {
          // updateUserImage schreibt den Verlauf selbst.
          actions.updateUserImage?.(cropTarget, update.patch);
          return;
        }
        const next = { ...state, ...update.patch } as TState;
        setState((prev) => ({ ...prev, ...update.patch }) as TState);
        debouncedSaveToHistory(next);
      },
      handleSmartCrop: () => {
        const id = cropTarget;
        if (!id) return;
        const image = smartCropSource(getStage(), id);
        const view = image
          ? smartCropView({
              id,
              state,
              elements: config.elements as readonly CanvasElementConfig[],
              layout,
              natural: { width: image.naturalWidth, height: image.naturalHeight },
            })
          : null;
        if (!image || !view) {
          toast.error(SMART_CROP_FAILED);
          return;
        }
        const src = cropImageSrc(state, config.elements as readonly CanvasElementConfig[], id);
        suggestSmartCrop(image, view).then(
          (region) => {
            // Inzwischen beendet oder gewechselt: nichts mehr schreiben.
            if (store.getState().croppingElement !== id) return;
            applySmartCropRef.current(id, src, image, region);
          },
          () => toast.error(SMART_CROP_FAILED)
        );
      },
      handleExpandImage: () => {
        const id = cropTarget;
        if (!id || !expandImage || expandingRef.current) return;
        const target = expandTarget(
          state,
          config.elements as readonly CanvasElementConfig[],
          layout,
          id
        );
        if (!target || !uploads) {
          toast.error(EXPAND_FAILED);
          return;
        }
        expandingRef.current = true;
        setIsExpanding(true);
        // Nur „Abbrechen" verwirft; Fertig, Escape und Auswahlwechsel übernehmen das Ergebnis.
        const cancels = cropCancelCount();
        const run = async () => {
          const source = await fetchShareImageFile(target.src, target.fileName);
          const file = await expandImage(source, target.aspect);
          // Wie „Ersetzen": erst hochladen, damit keine `blob:`/data-URL gespeichert wird.
          const item = await uploads.upload(file, 'canvas-element');
          const url = item ? buildPlacementUrl(item) : null;
          if (!url) throw new Error(EXPAND_FAILED);
          return { file, url };
        };
        run()
          .then(
            ({ file, url }) => {
              if (cropCancelCount() !== cancels) return;
              applyExpandRef.current(id, target.src, file, url);
            },
            (error: unknown) =>
              toast.error(error instanceof Error && error.message ? error.message : EXPAND_FAILED)
          )
          .finally(() => {
            expandingRef.current = false;
            if (mountedRef.current) setIsExpanding(false);
          });
      },
    };
    applySmartCropRef.current = (id, src, image, region) => {
      // Inzwischen ersetzt (Erweitern, Ersetzen): der Vorschlag gilt für das alte Foto.
      if (cropImageSrc(state, config.elements as readonly CanvasElementConfig[], id) !== src) {
        return;
      }
      const update = smartCropUpdate(
        {
          id,
          state,
          elements: config.elements as readonly CanvasElementConfig[],
          layout,
          natural: { width: image.naturalWidth, height: image.naturalHeight },
        },
        region
      );
      if (!update) return;
      if (update.kind === 'user-image') {
        actions.updateUserImage?.(id, update.patch);
        return;
      }
      const next = { ...state, ...update.patch } as TState;
      setState((prev) => ({ ...prev, ...update.patch }) as TState);
      debouncedSaveToHistory(next);
    };
    applyExpandRef.current = (id, src, file, url) => {
      const elements = config.elements as readonly CanvasElementConfig[];
      // Gelöscht oder inzwischen ersetzt: das Ergebnis gehört zum alten Foto.
      if (cropImageSrc(state, elements, id) !== src) return;
      const reset = expandResetPatch(state, elements, id);
      if (!reset) return;
      // „Fertig" vor dem Ersetzen: die Sitzung wird ihr eigener Schritt, das Erweitern der nächste.
      if (store.getState().croppingElement === id) store.getState().setCroppingElement(null);
      if (reset.kind === 'user-image') {
        // Ein Aufruf, ein Schritt; der Nachweis (`attribution`) bleibt am Bild.
        actions.updateUserImage?.(id, { ...reset.patch, src: url, fileName: file.name });
        return;
      }
      const background = config.background?.(state, actions);
      const onImageChange = background?.onImageChange;
      if (!onImageChange) return;
      runHistoryBatch(() => {
        setState((prev) => ({ ...prev, ...reset.patch }) as TState);
        // Ein erweitertes Stockfoto ist eine Bearbeitung desselben Fotos: der Nachweis bleibt.
        onImageChange(file, url, background.imageAttribution ?? null);
      });
    };
  });

  // Report toolbar state to CanvasEditor
  useEffect(() => {
    onToolbarStateChange?.({
      selectedElement,
      activeFloatingModule,
      canUndo,
      canRedo,
      canMoveUp: capabilities.canBringForward,
      canMoveDown: capabilities.canSendBackward,
      canDuplicate: capabilities.canCopy,
      canDelete: capabilities.canDelete,
      isCropping,
      cropAspect,
      cropRotation,
      isExpanding,
      selectionCount: capabilities.count,
      canCopy: capabilities.canCopy,
      lockState: capabilities.lock,
      canLock: capabilities.canLock,
      canFlip: capabilities.canFlip,
      canAlign: capabilities.canAlign,
      canDistribute: capabilities.canDistribute,
    });
  }, [
    isCropping,
    cropAspect,
    cropRotation,
    isExpanding,
    selectedElement,
    activeFloatingModule,
    canUndo,
    canRedo,
    capabilities.canBringForward,
    capabilities.canSendBackward,
    capabilities.canCopy,
    capabilities.canDelete,
    capabilities.count,
    capabilities.lock,
    capabilities.canLock,
    capabilities.canFlip,
    capabilities.canAlign,
    capabilities.canDistribute,
    onToolbarStateChange,
  ]);

  return null;
}

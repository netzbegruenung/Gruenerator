/**
 * GenericCanvas - Unified config-driven canvas component
 *
 * Renders any canvas type based on FullCanvasConfig.
 * Manages state, history, interactions, and sidebar.
 *
 * Refactored to use extracted hooks, utilities, and components for better maintainability.
 */

import Konva from 'konva';
import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  memo,
  useImperativeHandle,
  useLayoutEffect,
} from 'react';

import { HOST_EMITTED_STATE_KEYS } from '../collab/pageElementStateKeys';
import { useEmitHostStateChanges } from '../collab/useEmitHostStateChanges';
import { useSelectionAwareness } from '../collab/useSelectionAwareness';
import { useYjsCanvasBinding } from '../collab/useYjsCanvasBinding';
import { useYjsPageStateSync } from '../collab/useYjsPageStateSync';
import { stateKeyOfCallback } from '../collab/wrapCallbacksWithPageSync';
import { blockElementIds, placeBlock, type LiftedBlock } from '../composer/liftBlock';
import { getCanvasFormatOrDefault } from '../formats';
import {
  useCanvasInteractions,
  useCanvasStoreReset,
  useCanvasHistorySetup,
  useFontGeneration,
  useFontLoader,
} from '../hooks';
import { useCanvasAutoSave } from '../hooks/useCanvasAutoSave';
import { useCanvasElementHandlers } from '../hooks/useCanvasElementHandlers';
import { useCanvasKeyboardHandlers } from '../hooks/useCanvasKeyboardHandlers';
import { useContextPress } from '../hooks/useContextPress';
import { useDeepSelect } from '../hooks/useDeepSelect';
import { floatingModuleFor } from '../hooks/useFloatingModuleState';
import { CanvasStage, SnapGuidelines } from '../primitives';
import {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreSelector,
} from '../stores/CanvasStoreProvider';
import { useAutoSaveStore } from '../stores/useAutoSaveStore';
import {
  createCanvasCommands,
  type ClientPoint,
  type SelectionGeometry,
} from '../utils/canvasCommands';
import { canvasFontFamilies } from '../utils/canvasFontFamilies';
import { buildCanvasItems, buildSortedRenderList } from '../utils/canvasLayerManager';
import {
  captureStageImage,
  captureStageImageAsync,
  rasterizeStageElement,
  visibleStageTexts,
} from '../utils/captureStage';
import { itemBodyRect } from '../utils/deepSelect';
import { ensureFontsReady } from '../utils/ensureFontsReady';
import { MAX_ICON_SELECTIONS, selectedCatalogIconIds } from '../utils/iconInstances';
import { locateDrop, type ElementDragPayload, type MediaDragPayload } from '../utils/mediaDrop';
import { selectableItemIds } from '../utils/multiSelect';
import { PendingImagesContext } from '../utils/pendingImages';
import { stageCssScale } from '../utils/stageCssScale';
import { findTemplateEntry } from '../utils/templateElementInstance';
import { getOptimalContainerWidth } from '../utils/viewport';

import { CanvasRenderLayer } from './CanvasRenderLayer';
import { PrintGuides } from './PrintGuides';
import { ToolbarStateBridge } from './ToolbarStateBridge';

import type { CanvasMenuSnapshot } from './CanvasContextMenu/canvasMenuModel';
import type { RemoteSelector } from './RemoteSelectionOverlay';
import type { ToolbarBridgeState } from './ToolbarStateBridge';

const EMPTY_CALLBACKS: Record<string, ((val: unknown) => void) | undefined> = {};
const HOST_EMITTED_KEY_SET: ReadonlySet<string> = new Set(HOST_EMITTED_STATE_KEYS);

import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { CanvasElementConfig, FullCanvasConfig, LayoutResult } from '../configs/types';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';
import type { ShadowPatch } from '../hooks/useFloatingModuleHandlers';
import type { FloatingModuleState } from '../hooks/useFloatingModuleState';
import type { CanvasStageRef } from '../primitives/CanvasStage';
import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';
import type { PageCommandId } from '../utils/canvasCommandRegistry';
import type { GradientFill } from '../utils/gradientFill';
import type { LockState } from '../utils/layerLock';
import type { ExportOptions } from '@gruenerator/shared/canvas-editor';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type * as Y from 'yjs';

export interface ToolbarStateReport {
  selectedElement: string | null;
  activeFloatingModule: FloatingModuleState | null;
  canUndo: boolean;
  canRedo: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Liegt die Auswahl in einer Instanz-Sammlung? Vorlagen-Elemente und Icons
   *  nicht — siehe `utils/duplicateElement.ts`. */
  canDuplicate: boolean;
  /** Ist die Auswahl löschbar? Dieselbe Frage wie die Entf-Taste — siehe
   *  `utils/removeElement.ts`. */
  canDelete: boolean;
  /** The selected framed photo is in Ausschnitt mode. */
  isCropping: boolean;
  /** Wie viele Elemente ausgewählt sind; bei mehr als einem ist `selectedElement` null. */
  selectionCount: number;
  /** Lässt sich mindestens ein ausgewähltes Element kopieren? */
  canCopy: boolean;
  /** Wie viel der sperrbaren Auswahl gesperrt ist — siehe `utils/layerLock.ts`. */
  lockState: LockState;
  canLock: boolean;
  /** Drehen & Spiegeln — dieselben Fragen wie die Befehle (`utils/selectionCapabilities.ts`). */
  canRotate: boolean;
  canFlip: boolean;
  /** Drehung der Einzelauswahl, sonst `null`. */
  rotation: number | null;
  /** Ausrichten, Verteilen und Position — siehe `utils/selectionCapabilities.ts`. */
  canAlign: boolean;
  canDistribute: boolean;
}

export interface GenericCanvasProps<TState, TActions extends OptionalCanvasActions> {
  config: FullCanvasConfig<TState, TActions>;
  /** The canvas document's format id; sizes the stage. Absent: the default format. */
  formatId?: string;
  initialProps: Record<string, unknown>;
  onExport: (base64: string) => void;
  onSave?: (base64: string) => void;
  onCancel: () => void;
  callbacks?: Record<string, ((val: unknown) => void) | undefined>;
  className?: string;
  onAddPage?: () => void;
  /** Custom renderer for add page section (e.g., template picker for heterogeneous mode) */
  renderAddPage?: () => React.ReactNode;
  onDelete?: () => void;
  // Multi-page export props (passed to share section)
  multiPageExport?: {
    pageCount: number;
    onDownloadAllZip: () => Promise<void>;
    isExporting: boolean;
    exportProgress: { current: number; total: number };
  };
  /** Callback to report toolbar state to parent (for layout-level toolbar rendering) */
  onToolbarStateChange?: (state: ToolbarStateReport) => void;
  /**
   * Reports the auto-save share token to the host as soon as a save creates
   * or adopts one. Called from the save routine itself (not a store
   * subscription) so tokens resolving after unmount still reach the host.
   */
  onAutoSaveShareToken?: (token: string) => void;
  /**
   * Gallery autosave of this page. Defaults to true (standalone usage); the
   * multi-page CanvasEditor passes an explicit value because deck-level
   * autosave replaces the per-page path beyond one page, and collab docs
   * persist via Hocuspocus.
   */
  autoSave?: boolean;
  /**
   * Render-once snapshot, never shown or touched by a user — the offscreen
   * root that `renderSharepicToImage` mounts to turn a chat sharepic into a
   * preview image.
   *
   * Everything switched off here is editor machinery that a hidden, one-shot
   * canvas still paid for: gallery auto-save (network writes, a `beforeunload`
   * handler and its own pixelRatio-2 capture 1500ms after every history
   * change), the global keydown handlers, and Konva's hit graph, which doubles
   * the canvas memory per stage for events nothing will ever fire.
   *
   * Die Stage-Registry stand hier auch einmal: sie war nach `config.id`
   * verschluesselt, sodass zwei Vorschauen derselben Vorlage einander und den
   * Studio-Eintrag verdraengten. Sie ist mit #3406 ganz entfallen — gelesen
   * hat sie niemand —, also gibt es hier nichts mehr abzuschalten.
   */
  preview?: boolean;
  /**
   * False for the pages of a multi-page editor that are not the active one:
   * they drop their selection and ignore keyboard shortcuts, which every page
   * registers on `window`. Single-canvas hosts leave it at the default.
   */
  isActivePage?: boolean;
  /**
   * Shown to a viewer: rendered and exportable, but no hit graph, no
   * selection, marquee or context press, and no keyboard shortcuts.
   */
  readOnly?: boolean;
  /**
   * Pushes this page's live state/actions/selection to the host on every
   * change — the multi-page editor's shared sidebar renders from it.
   */
  onLiveState?: (
    state: Record<string, unknown>,
    actions: Record<string, unknown>,
    selectedElement: string | null
  ) => void;
  /**
   * When provided, the per-instance Zustand store is bound to the supplied
   * page Y.Map. The page Y.Map owns its own `config` (Y.Map)
   * sub-collection so each page has independent state.
   * Set in BOTH modes now (collab doc or the editor's local Y.Doc);
   * `provider` is only present in collab mode.
   */
  pageBinding?: {
    pageYMap: Y.Map<unknown>;
    isSynced: boolean;
    /** Hocuspocus provider — enables awareness features (remote selections). */
    provider?: HocuspocusProvider | null;
    /** Id of this page, published to awareness so peers can filter selections per page. */
    pageId?: string | null;
    /** Only the active page publishes its selection to awareness. */
    publishSelection?: boolean;
  };
}

export interface SelectionBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Canvas px between blocks clicked in one after another. */
const BLOCK_CASCADE = 40;

/** What a block is composed against: the page's background. */
export interface BlockPageSurface {
  backgroundMode?: unknown;
  backgroundColor?: unknown;
}

export interface GenericCanvasRef {
  toDataURL: (options?: {
    format?: 'png' | 'jpeg' | 'webp';
    pixelRatio?: number;
    quality?: number;
    includeBackground?: boolean;
  }) => string | undefined;
  captureCanvas: (options?: Partial<ExportOptions>) => Promise<string | null>;
  /** One print tile as JPEG bytes (format px rect, whole-pixel output size). */
  capturePrintTile: (
    tile: { x: number; y: number; outWidth: number; outHeight: number },
    pixelRatio: number,
    quality: number
  ) => Promise<Uint8Array | null>;
  /** User photos with source and displayed width, for the print resolution check. */
  getPrintImages: () => Array<{ naturalWidthPx: number; displayedWidthPx: number }>;
  /** False while an image element's source is still loading — a capture
   *  taken then is missing that image. */
  imagesSettled: () => boolean;
  /** Lightweight JPEG capture for sending the canvas to vision models. */
  captureCanvasForAi: () => Promise<string | null>;
  /** The page's visible texts in reading order, for alt texts. */
  getVisibleTexts: () => string[];
  /** One element alone as PNG plus its box in page px (PPTX raster fallback); null when not on the stage. */
  rasterizeElement: (elementId: string) => Promise<ReturnType<typeof rasterizeStageElement>>;
  /** Clears this page's element selection — the per-page store lives behind
   *  CanvasStoreProvider, so the parent editor reaches it through this handle. */
  deselect: () => void;
  /** Starts a marquee selection from a press outside the stage (the work area). */
  beginMarquee: (evt: MouseEvent) => void;
  /** Places a dragged upload where it was dropped: into the frame under the
   *  pointer, else as a new image centred there. False when nothing was placed. */
  dropMedia: (evt: { clientX: number; clientY: number }, media: MediaDragPayload) => boolean;
  /** Adds a dragged Elemente tile centred where it was dropped. False when nothing was placed. */
  dropElement: (evt: { clientX: number; clientY: number }, payload: ElementDragPayload) => boolean;
  /**
   * Composes a block for this page (`make` gets its background) and adds it,
   * centred where it was dropped or on the canvas, as one undo step; its parts
   * are selected together after. False when the page holds no blocks.
   */
  insertBlock: (
    make: (page: BlockPageSurface) => Promise<LiftedBlock | null>,
    at?: { clientX: number; clientY: number }
  ) => Promise<boolean>;
  /** Toolbar handlers — called by parent when toolbar is rendered at layout level */
  undo?: () => void;
  redo?: () => void;
  handleMoveLayer?: (direction: 'up' | 'down') => void;
  handleDuplicate?: () => void;
  handleDeleteElement?: () => void;
  /** Führt einen Seiten-Befehl aus; `at` ist der Punkt eines Rechtsklicks. */
  runCommand?: (id: PageCommandId, at: ClientPoint | null) => void;
  /** Dreht die Einzelauswahl um ihre Mitte; ein Schritt im Verlauf. */
  setRotation?: (deg: number) => void;
  /** Dreht nur die Anzeige der Einzelauswahl (Regler ziehen) — ohne Zustand, ohne Verlauf. */
  previewRotation?: (deg: number) => void;
  /** Lage und Größe der Einzelauswahl für das Positionsfeld; `null`, wenn sie sich nicht bewegen lässt. */
  getGeometry?: () => SelectionGeometry | null;
  /** X/Y der Einzelauswahl (linke obere Ecke ihres gedrehten Umrisses); ein Schritt im Verlauf. */
  setPosition?: (patch: { x?: number; y?: number }) => void;
  /** B/H der Einzelauswahl; ein Schritt im Verlauf. */
  setSize?: (patch: { width?: number; height?: number }) => void;
  /** Was das Kontextmenü beim Öffnen über diese Seite wissen muss. */
  getMenuSnapshot?: () => CanvasMenuSnapshot;
  /** Box der Auswahl in Fensterkoordinaten, für Bedienelemente am Objekt. */
  getSelectionBox?: () => SelectionBox | null;
  /** Meldet Beginn (`true`) und Ende (`false`) von Ziehen und Transformieren;
   *  gibt das Abmelden zurück. */
  subscribeManipulation?: (listener: (active: boolean) => void) => () => void;
  handleColorSelect?: (color: string) => void;
  handleOpacityChange?: (id: string, opacity: number, type: string) => void;
  handleFontSizeChange?: (id: string, size: number) => void;
  handleShadowChange?: (id: string, patch: ShadowPatch, type: string) => void;
  handleOutlineChange?: (id: string, patch: { stroke?: string; strokeWidth?: number }) => void;
  handleBlurChange?: (id: string, blur: number) => void;
  handleCropImage?: () => void;
  handleGradientSelect?: (gradient: GradientFill | null) => void;
}

// Generic component with forwardRef - uses type assertion pattern for TypeScript compatibility
function GenericCanvasWithRef<
  TState extends Record<string, unknown> & Partial<BaseCanvasState>,
  TActions extends OptionalCanvasActions,
>(props: GenericCanvasProps<TState, TActions> & { forwardedRef?: React.Ref<GenericCanvasRef> }) {
  const {
    config,
    initialProps,
    callbacks = EMPTY_CALLBACKS,
    onDelete,
    forwardedRef,
    onToolbarStateChange,
    onAutoSaveShareToken,
    preview = false,
    isActivePage = true,
    readOnly = false,
  } = props;
  const interactive = !preview && !readOnly;
  const shortcutsEnabled = interactive && isActivePage;

  const stageRef = useRef<CanvasStageRef>(null);
  const [pendingImages] = useState(() => new Set<string>());

  // Export state (used by auto-save and attribution overlay)
  const [exportedImage, setExportedImage] = useState<string | null>(null);
  const exportedImageRef = useRef<string | null>(null);

  useCanvasStoreReset(preview ? null : config.id);

  // Dynamic maxContainerWidth for responsive rendering
  const [maxWidth, setMaxWidth] = useState(getOptimalContainerWidth());

  useEffect(() => {
    const handleResize = () => setMaxWidth(getOptimalContainerWidth());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Track config ID to detect actual config changes (not just reference changes)
  const configIdRef = useRef(config.id);

  const [state, setStateRaw] = useState<TState>(() => config.createInitialState(initialProps));

  // Only reset state when the config ID actually changes (different canvas type)
  // This prevents state reset when parent re-renders with same config but new object references
  useEffect(() => {
    if (configIdRef.current !== config.id) {
      configIdRef.current = config.id;
      setStateRaw(config.createInitialState(initialProps));
    }
  }, [config, initialProps]);

  // Push background-image fields and free-element collections back to the host.
  // The config stores change both only in local component state (unlike text
  // fields, which sync through their own callbacks), so without this the chosen
  // background image and every added element is lost on reload (#3416).
  useEmitHostStateChanges(state as Record<string, unknown>, callbacks, HOST_EMITTED_STATE_KEYS);

  const fontFamilies = useMemo(() => canvasFontFamilies(config), [config]);

  // Font loading - non-blocking! Renders immediately with fallback, swaps to custom font when ready
  const { isFontAvailable } = useFontLoader(
    config.fonts?.requireFontLoad !== false && fontFamilies.length > 0
      ? {
          fontFamily: fontFamilies,
          fontSize: config.fonts?.fontSize ?? 60,
          maxAttempts: 30,
          pollInterval: 50,
        }
      : null
  );

  const setStateWrapper = useCallback((partial: Partial<TState> | ((prev: TState) => TState)) => {
    setStateRaw((prev) => {
      if (typeof partial === 'function') {
        return partial(prev);
      }
      return { ...prev, ...partial };
    });
  }, []);

  // External edits to this page's `state` Y.Map (chat sharepic editing via
  // the Hocuspocus internal API) merge into the live component state.
  // Rebuilding through createInitialState recomputes the derived fields.
  //
  // Nothing is withheld from the merge. This used to delete `balkenInstances`
  // so the dreizeilen bar would regenerate from the new text — but that bar is
  // one entry in a collection users also add to by hand, and dropping the whole
  // array took every hand-added balken with it (#3421). Which entry a template
  // derives is the template's own knowledge, and `createInitialState` is where
  // it already lives.
  const [remoteStateCount, setRemoteStateCount] = useState(0);
  const handleRemotePageState = useCallback(
    (partial: Record<string, unknown>) => {
      setStateRaw((prev) => config.createInitialState({ ...prev, ...partial }) as TState);
      setRemoteStateCount((n) => n + 1);
    },
    [config]
  );

  // Measured fits need the brand fonts, so normalization waits for them. The
  // result reaches the page through useEmitHostStateChanges like any edit; a
  // preview has no writers and only renders it.
  const normalizeLoadedState = config.normalizeLoadedState;
  useEffect(() => {
    if (!normalizeLoadedState) return undefined;
    let cancelled = false;
    void ensureFontsReady().then(() => {
      if (!cancelled) setStateRaw((prev) => normalizeLoadedState(prev) ?? prev);
    });
    return () => {
      cancelled = true;
    };
  }, [normalizeLoadedState, remoteStateCount]);
  useYjsPageStateSync({
    pageYMap: props.pageBinding?.pageYMap ?? null,
    isSynced: props.pageBinding?.isSynced ?? false,
    onRemoteState: handleRemotePageState,
  });

  const collectState = useCallback(() => state, [state]);
  const committedStateRef = useRef(state);
  useLayoutEffect(() => {
    committedStateRef.current = state;
  }, [state]);
  // Text fields reach the page document only through their `on<Key>Change`
  // callback, so a restore reports each one it changed (#4247). The emitted
  // keys are left to useEmitHostStateChanges, which already reports them.
  const handleRestore = useCallback(
    (restoredState: Record<string, unknown>) => {
      const prev = committedStateRef.current as Record<string, unknown>;
      // Every entry snapshots the whole state, so a key it lacks did not exist
      // yet — the position a first drag or turn of a template text wrote.
      // Merging alone kept that key: one undo turned the text back but left
      // it shifted.
      setStateRaw((p) => {
        const next: Record<string, unknown> = { ...p, ...restoredState };
        for (const key of Object.keys(p)) if (!(key in restoredState)) delete next[key];
        return next as TState;
      });
      for (const [name, callback] of Object.entries(callbacks)) {
        const key = stateKeyOfCallback(name);
        if (!key || !(key in restoredState) || HOST_EMITTED_KEY_SET.has(key)) continue;
        if (JSON.stringify(restoredState[key]) === JSON.stringify(prev[key])) continue;
        callback?.(restoredState[key]);
      }
    },
    [callbacks]
  );

  const { saveToHistory, debouncedSaveToHistory, runHistoryBatch, undo, redo, canUndo, canRedo } =
    useCanvasHistorySetup(collectState, handleRestore, 500, shortcutsEnabled);

  // Read through the ref so `actions` keeps its identity across edits; every
  // action calls getState() when it runs, so it still sees the latest state.
  const getState = useCallback(() => committedStateRef.current, []);

  // `runHistoryBatch` rides on the actions so the AI bridge (built from the
  // page's live actions) coalesces one op batch into one undo step.
  const actions = useMemo(
    () => ({
      ...config.createActions(
        getState,
        setStateWrapper,
        saveToHistory,
        debouncedSaveToHistory,
        callbacks
      ),
      runHistoryBatch,
    }),
    [
      config,
      getState,
      setStateWrapper,
      saveToHistory,
      debouncedSaveToHistory,
      runHistoryBatch,
      callbacks,
    ]
  );

  // Allowlist of state fields that calculateLayout reads across all canvas configs.
  // New fields must be added here if a new config's calculateLayout reads them.
  const layoutKey = useMemo(() => {
    const s = state as Record<string, unknown>;
    return JSON.stringify([
      // Text content
      s.line1,
      s.line2,
      s.line3,
      s.headline,
      s.subtext,
      s.subtext2,
      s.header,
      s.body,
      s.quote,
      s.eventTitle,
      s.beschreibung,
      s.label,
      // Font sizes
      s.fontSize,
      s.customPrimaryFontSize,
      s.customSecondaryFontSize,
      s.customEventTitleFontSize,
      s.customBeschreibungFontSize,
      s.customLabelFontSize,
      s.customHeadlineFontSize,
      s.customSubtextFontSize,
      s.customSubtext2FontSize,
      // Colors & styling
      s.colorSchemeId,
      s.colorScheme,
      s.backgroundColor,
      // Layout positioning
      s.balkenOffset,
      s.barOffsets,
      s.balkenWidthScale,
      // Variants
      s.slideVariant,
    ]);
  }, [state]);

  // `isFontAvailable` schlägt genau einmal um, und zwar sobald die
  // GRUNDSCHNITTE da sind — bei PT Sans ist das schon beim Seitenaufbau der
  // Fall, weil der Fließtext ihn benutzt. Fett und Kursiv treffen danach ein.
  // `calculateLayout` misst aber mit (Auto-Fit-Schriftgrad, Y-Stapelung), also
  // braucht es den Zähler zusätzlich, sonst stünde ein Slider-Untertext für
  // immer in der Größe, die gegen den synthetisch gefetteten Regular passte.
  const fontGeneration = useFontGeneration();
  const layout = useMemo<LayoutResult>(() => {
    return config.calculateLayout(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutKey is a stable string derived from layout-relevant state fields
  }, [config, layoutKey, isFontAvailable, fontGeneration]);

  const {
    setSelectedElement,
    selectElement,
    beginMarquee,
    handleStageClick,
    handleSnapChange,
    getSnapTargets,
  } = useCanvasInteractions({ stageRef, marqueeEnabled: interactive });

  const store = useCanvasStore();
  const { setSnapLines, updateElementPosition } = store.getState();
  // Before the deep select: a ⌃-click on a Mac is a right-click, not a pick.
  useContextPress(stageRef, interactive);
  useDeepSelect(stageRef, interactive);

  // One selection across all pages: leaving the active page drops its own.
  useEffect(() => {
    if (!isActivePage) setSelectedElement(null);
  }, [isActivePage, setSelectedElement]);

  // Output canvas dimensions are driven by the chosen format. Layout calculators
  // continue to operate in the template's reference space (config.canvas.{width,height});
  // CanvasStage scales them up to the format dims via a Konva Group when they differ.
  const formatId = useCanvasStoreSelector((s) => s.formatId);
  const format = getCanvasFormatOrDefault(formatId);
  const stageWidth = format.width;
  const stageHeight = format.height;
  const referenceWidth = config.canvas.width;
  const referenceHeight = config.canvas.height;

  // Auto-save hook for gallery integration. The multi-page editor passes an
  // explicit value (off in collab — Hocuspocus persists server-side — and off
  // beyond one page, where deck-level autosave takes over); standalone
  // consumers keep the historical default of on.
  const autoSaveEnabled = !preview && (props.autoSave ?? true);

  // Fresh capture for the unmount-flush path — transformer hiding makes the
  // shot clean even while an element is still selected.
  const captureForAutoSaveFlush = useCallback(
    (): string | null => captureStageImage(stageRef.current),
    []
  );

  useCanvasAutoSave(exportedImage, {
    canvasType: config.id,
    canvasState: state,
    enabled: autoSaveEnabled,
    captureImage: captureForAutoSaveFlush,
    onShareToken: onAutoSaveShareToken,
  });

  // History-synced auto-save: capture canvas whenever undo/redo history changes
  const historyIndex = useCanvasStoreSelector((s) => s.historyIndex);
  const setAutoSaveDirty = useAutoSaveStore((s) => s.setDirty);
  const lastAutoSaveHistoryIndexRef = useRef(-1);

  useEffect(() => {
    if (historyIndex < 0) return;
    // historyIndex 0 is the initial mount snapshot — an untouched canvas is not dirty
    if (
      autoSaveEnabled &&
      historyIndex > 0 &&
      lastAutoSaveHistoryIndexRef.current !== historyIndex
    ) {
      setAutoSaveDirty(true);
    }
    // The capture only feeds useCanvasAutoSave — without auto-save it is a
    // wasted pixelRatio-2 PNG encode on the main thread after every edit.
    if (!autoSaveEnabled || lastAutoSaveHistoryIndexRef.current === historyIndex) return;

    // Debounce screenshot capture — toDataURL at pixelRatio:2 is expensive (~100-200ms).
    // 1500ms ensures we only capture after the user stops editing. Transformer
    // hiding inside captureStageImage keeps the shot clean even while an
    // element is selected, so edits made with a live selection auto-save too.
    const timer = setTimeout(() => {
      const dataUrl = captureStageImage(stageRef.current);
      if (dataUrl) {
        setExportedImage(dataUrl);
        exportedImageRef.current = dataUrl;
        lastAutoSaveHistoryIndexRef.current = historyIndex;
      } else {
        console.warn('[AutoSave] capture failed: stage toDataURL returned null');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [historyIndex, autoSaveEnabled, setAutoSaveDirty]);

  // Push live state/actions/selection up to the shared sidebar. Replaces the
  // old 200ms poll in PageWrapper: updates land synchronously with edits.
  const onLiveState = props.onLiveState;
  const liveStateRef = useRef({ state, actions });
  const clickedBlocksRef = useRef(0);
  liveStateRef.current = { state, actions };
  useEffect(() => {
    if (!onLiveState) return;
    onLiveState(
      state as Record<string, unknown>,
      actions as unknown as Record<string, unknown>,
      store.getState().selectedElement
    );
  }, [onLiveState, state, actions, store]);
  useEffect(() => {
    if (!onLiveState) return undefined;
    let prev = store.getState().selectedElement;
    return store.subscribe((s) => {
      if (s.selectedElement === prev) return;
      prev = s.selectedElement;
      const { state: liveState, actions: liveActions } = liveStateRef.current;
      onLiveState(
        liveState as Record<string, unknown>,
        liveActions as unknown as Record<string, unknown>,
        s.selectedElement
      );
    });
  }, [onLiveState, store]);

  // Live remote selections (collab mode). Publishes the local selection to
  // awareness (active page only) and maps remote peers' selections on this
  // page to element ids for the render layer's outlines.
  const collabPageId = props.pageBinding?.pageId ?? null;
  const remoteSelectionsRaw = useSelectionAwareness(props.pageBinding?.provider ?? null, {
    activePageId: collabPageId,
    publish: props.pageBinding?.publishSelection ?? true,
  });
  const remoteSelections = useMemo(() => {
    if (remoteSelectionsRaw.length === 0) return undefined;
    const map = new Map<string, RemoteSelector>();
    for (const peer of remoteSelectionsRaw) {
      if (peer.activePageId !== collabPageId) continue;
      for (const id of peer.selectedLayerIds) {
        if (!map.has(id)) map.set(id, { userName: peer.userName, color: peer.color });
      }
    }
    return map.size > 0 ? map : undefined;
  }, [remoteSelectionsRaw, collabPageId]);

  const elementHandlers = useCanvasElementHandlers({
    config,
    state,
    setState: setStateWrapper,
    actions,
    layout,
    callbacks,
    selectElement,
    updateElementPosition,
    saveToHistory,
    debouncedSaveToHistory,
  });

  const canvasItems = useMemo(() => buildCanvasItems(config, state), [config, state]);

  const sortedRenderList = useMemo(
    () => buildSortedRenderList(canvasItems, state.layerOrder ?? []),
    [canvasItems, state.layerOrder]
  );

  // The doors read the page at call time, not from a render closure: a menu
  // or key acts on what is on screen now.
  const commandInputsRef = useRef({ layout, sortedRenderList, actions });
  useLayoutEffect(() => {
    commandInputsRef.current = { layout, sortedRenderList, actions };
  }, [layout, sortedRenderList, actions]);
  const logicalScale = stageWidth / referenceWidth;
  const commands = useMemo(
    () =>
      createCanvasCommands<TState>({
        store,
        getState: () => committedStateRef.current,
        setState: setStateWrapper,
        saveToHistory,
        runHistoryBatch,
        getActions: () => commandInputsRef.current.actions,
        template: (id) =>
          findTemplateEntry(
            config.elements,
            committedStateRef.current,
            commandInputsRef.current.layout,
            id
          ),
        getRenderList: () => commandInputsRef.current.sortedRenderList,
        getStage: () => stageRef.current?.getStage() ?? null,
        logicalScale: () => logicalScale,
        // Die Tür liest nur id, Typ und Positionsschlüssel; der Zustandstyp der Config spielt dort keine Rolle.
        getElements: () => config.elements as readonly CanvasElementConfig[],
        getLayout: () => commandInputsRef.current.layout,
        isReadOnly: () => !interactive,
        getPageSize: () => ({ width: referenceWidth, height: referenceHeight }),
      }),
    [
      store,
      setStateWrapper,
      saveToHistory,
      runHistoryBatch,
      config.elements,
      logicalScale,
      interactive,
      referenceWidth,
      referenceHeight,
    ]
  );

  useCanvasKeyboardHandlers({
    store,
    state,
    actions,
    setState: setStateWrapper,
    setSelectedElement,
    commands,
    elements: config.elements,
    saveToHistory,
    enabled: shortcutsEnabled,
  });

  // Bridge ref for ToolbarStateBridge → useImperativeHandle communication
  const bridgeRef = useRef<ToolbarBridgeState | null>(null);

  /**
   * Konva berechnet den Zeilenumbruch eines Text-Knotens EINMAL, beim Setzen
   * seiner Eigenschaften, und legt ihn in `textArr` ab. Ist die Webschrift zu
   * diesem Zeitpunkt noch nicht geladen, misst es gegen die Ersatzschrift und
   * behaelt diesen Umbruch, auch wenn die echte Schrift eintrifft: Das Bild
   * wird dann in der richtigen Schrift mit den falschen Bruechen gezeichnet.
   * Im Realtest lief „aus Erneuerbaren." so auf drei Zeilen, mit dem Punkt
   * allein auf der letzten — die Ersatzschrift Georgia ist breiter als
   * Vollkorn und drueckte ihn ueber das Satzmass.
   *
   * `layout` wird an `isFontAvailable` zwar neu berechnet, das rettet aber nur
   * die Faelle, in denen sich dabei eine Eigenschaft aendert. Bleibt der
   * Schriftgrad gleich, sieht React identische Props und Konva rechnet nichts
   * neu. Der Text wird deshalb zweimal gesetzt: Konvas Setter steigt bei
   * unveraendertem Wert frueh aus, ein einzelnes Setzen waere wirkungslos.
   *
   * Nur beim Umschlagen von `isFontAvailable`, nicht bei jeder Neuberechnung
   * des Layouts: danach misst Konva ohnehin gegen die richtige Schrift, und
   * ein Zuruecksetzen bei jeder Textaenderung wuerde der laufenden Bearbeitung
   * in die Quere kommen.
   */
  useEffect(() => {
    if (!isFontAvailable) return;
    const stage = stageRef.current?.getStage();
    if (!stage) return;
    for (const node of stage.find('Text')) {
      const textNode = node as unknown as { text: (value?: string) => string };
      const value = textNode.text();
      if (!value) continue;
      textNode.text('');
      textNode.text(value);
    }
    stage.batchDraw();
  }, [isFontAvailable]);

  // Expose ref methods for parent access (multi-page export, shared sidebar, and toolbar handlers)
  // Bridge handlers are read from bridgeRef.current at call time (set by ToolbarStateBridge)
  useImperativeHandle(
    forwardedRef,
    () => ({
      toDataURL: (options) => {
        return stageRef.current?.toDataURL(options);
      },
      // Transformer hiding replaces the old deselect + 50ms-rerender hack:
      // the user's selection survives a capture.
      captureCanvas: async (options) => {
        await ensureFontsReady();
        return captureStageImageAsync(stageRef.current, options);
      },
      capturePrintTile: async (tile, pixelRatio, quality) => {
        await ensureFontsReady();
        return stageRef.current?.toTileJpeg({ ...tile, pixelRatio, quality }) ?? null;
      },
      getPrintImages: () => stageRef.current?.getPrintImages() ?? [],
      imagesSettled: () => pendingImages.size === 0,
      captureCanvasForAi: async () =>
        captureStageImage(stageRef.current, { format: 'jpeg', pixelRatio: 1, quality: 0.85 }),
      getVisibleTexts: () => visibleStageTexts(stageRef.current?.getStage() ?? null),
      rasterizeElement: async (elementId) => {
        await ensureFontsReady();
        return rasterizeStageElement(stageRef.current?.getStage() ?? null, elementId);
      },
      deselect: () => setSelectedElement(null),
      beginMarquee,
      dropMedia: (evt, media) => {
        const stage = stageRef.current?.getStage();
        if (!stage) return false;
        const drop = locateDrop(stage, evt, stageWidth / referenceWidth);
        if (!drop) return false;
        if (drop.frameId && actions.setFrameImage) {
          // The file argument is unused there; the durable URL is the image.
          actions.setFrameImage(drop.frameId, new File([], media.name), media.url);
          setSelectedElement(drop.frameId);
          return true;
        }
        if (!actions.addUserImageFromUrl) return false;
        actions.addUserImageFromUrl(media.url, media.name, {
          center: drop.point,
          ...(media.attribution && { attribution: media.attribution }),
        });
        return true;
      },
      insertBlock: async (make, at) => {
        if (!actions.insertBlock) return false;
        // The drop point before the await: the pointer is only known now.
        const stage = stageRef.current?.getStage();
        const drop = at && stage ? locateDrop(stage, at, stageWidth / referenceWidth) : null;
        const { backgroundMode, backgroundColor } = liveStateRef.current.state as BlockPageSurface;
        const block = await make({ backgroundMode, backgroundColor });
        if (!block) return false;
        const canvas = { width: referenceWidth, height: referenceHeight };
        // Clicked in again and again, each lands a step down-right, not on the last.
        const step = drop ? 0 : (clickedBlocksRef.current++ % 5) * BLOCK_CASCADE;
        const placed = placeBlock(
          block,
          drop?.point ?? { x: canvas.width / 2 + step, y: canvas.height / 2 + step },
          canvas
        );
        const { insertBlock } = liveStateRef.current.actions;
        if (!insertBlock) return false;
        insertBlock(placed);
        store.getState().setSelectedLayers(blockElementIds(placed));
        return true;
      },
      dropElement: (evt, payload) => {
        const stage = stageRef.current?.getStage();
        if (!stage) return false;
        const drop = locateDrop(stage, evt, stageWidth / referenceWidth);
        if (!drop) return false;
        const placement = { center: drop.point };
        switch (payload.kind) {
          case 'asset':
            if (!actions.addAsset) return false;
            actions.addAsset(payload.assetId, placement);
            return true;
          case 'sticker':
            if (!actions.addStickerAsset) return false;
            actions.addStickerAsset(payload.ref, placement);
            return true;
          case 'shape':
            if (!actions.addShape) return false;
            actions.addShape(payload.shapeType, payload.color, placement);
            return true;
          case 'illustration':
            if (!actions.addIllustration) return false;
            actions.addIllustration(payload.id, placement);
            return true;
          case 'chart':
            if (!actions.addChart) return false;
            actions.addChart(payload.chartType, placement);
            return true;
          case 'frame':
            if (!actions.addFrame) return false;
            actions.addFrame(payload.clipType, placement);
            return true;
          case 'balken':
            if (!actions.addBalken) return false;
            actions.addBalken(payload.mode, placement);
            return true;
          case 'icon': {
            if (!actions.toggleIcon) return false;
            // This page's icons; the sidebar's limit counts the active page's.
            const { selectedIcons, iconStates } = liveStateRef.current.state as Partial<
              Pick<BaseCanvasState, 'selectedIcons' | 'iconStates'>
            >;
            const onPage = selectedCatalogIconIds(selectedIcons, iconStates);
            if (onPage.includes(payload.iconId) || onPage.length >= MAX_ICON_SELECTIONS)
              return false;
            actions.toggleIcon(payload.iconId, true, placement);
            return true;
          }
          // Composed asynchronously: the page wrapper hands it to `insertBlock`.
          case 'block':
            return false;
        }
      },
      undo,
      redo,
      handleMoveLayer: (dir) => commands.moveLayer(dir === 'up' ? 'forward' : 'backward'),
      handleDuplicate: commands.duplicate,
      handleDeleteElement: commands.remove,
      runCommand: commands.run,
      setRotation: commands.setRotation,
      previewRotation: commands.previewRotation,
      getGeometry: commands.geometry,
      setPosition: commands.setPosition,
      setSize: commands.setSize,
      getMenuSnapshot: () => {
        const { selectedLayerIds, selectedElement, croppingElement } = store.getState();
        const committed = committedStateRef.current;
        const layer = stageRef.current?.getStage()?.getLayers()[0];
        return {
          selection: selectedLayerIds,
          module: floatingModuleFor(
            selectedElement,
            config,
            committed,
            commandInputsRef.current.layout
          ),
          caps: commands.capabilities(),
          canSelectAll: layer ? selectableItemIds(layer).length > 0 : false,
          isCropping: croppingElement !== null,
          background: config.background?.(committed, actions) ?? null,
        };
      },
      getSelectionBox: () => {
        const ids = store.getState().selectedLayerIds;
        const stage = stageRef.current?.getStage();
        if (ids.length === 0 || !stage) return null;
        const rects = ids.map((id) => itemBodyRect(stage, id)).filter((r) => r !== null);
        if (rects.length === 0) return null;
        const left = Math.min(...rects.map((r) => r.x));
        const top = Math.min(...rects.map((r) => r.y));
        const rect = {
          x: left,
          y: top,
          width: Math.max(...rects.map((r) => r.x + r.width)) - left,
          height: Math.max(...rects.map((r) => r.y + r.height)) - top,
        };
        const container = stage.container().getBoundingClientRect();
        const cssScale = stageCssScale(stage, container);
        return {
          left: container.left + rect.x * cssScale,
          top: container.top + rect.y * cssScale,
          width: rect.width * cssScale,
          height: rect.height * cssScale,
        };
      },
      subscribeManipulation: (listener) => {
        const stage = stageRef.current?.getStage();
        if (!stage) return () => {};
        const start = () => listener(true);
        const end = () => listener(false);
        // `transformstart`/`transformend` fire without bubbling (Konva's
        // `_fire` on the Transformer and its node), so the stage never hears
        // them. The press on an anchor does bubble: that is the start, and
        // the end is taken from the Transformer that owns the anchor.
        const onTransformerEnd = (e: Konva.KonvaEventObject<Event>) => {
          e.currentTarget.off('transformend', onTransformerEnd);
          end();
        };
        const onPress = (e: Konva.KonvaEventObject<Event>) => {
          const transformer = e.target.getParent();
          if (!(transformer instanceof Konva.Transformer)) return;
          start();
          transformer.on('transformend', onTransformerEnd);
        };
        stage.on('dragstart', start);
        stage.on('dragend', end);
        stage.on('mousedown touchstart', onPress);
        return () => {
          stage.off('dragstart', start);
          stage.off('dragend', end);
          stage.off('mousedown touchstart', onPress);
          stage.find('Transformer').forEach((t) => t.off('transformend', onTransformerEnd));
        };
      },
      handleColorSelect: (color) => bridgeRef.current?.handleColorSelect(color),
      handleOpacityChange: (id, op, type) => bridgeRef.current?.handleOpacityChange(id, op, type),
      handleFontSizeChange: elementHandlers.handleFontSizeChange,
      handleShadowChange: (id, patch, type) =>
        bridgeRef.current?.handleShadowChange(id, patch, type),
      handleOutlineChange: (id, patch) => bridgeRef.current?.handleOutlineChange(id, patch),
      handleBlurChange: (id, blur) => bridgeRef.current?.handleBlurChange(id, blur),
      handleCropImage: () => bridgeRef.current?.handleCropImage(),
      handleGradientSelect: (gradient) => bridgeRef.current?.handleGradientSelect(gradient),
    }),
    [
      undo,
      redo,
      elementHandlers.handleFontSizeChange,
      setSelectedElement,
      beginMarquee,
      pendingImages,
      store,
      actions,
      stageWidth,
      referenceWidth,
      referenceHeight,
      commands,
      config,
    ]
  );

  return (
    <PendingImagesContext.Provider value={pendingImages}>
      <CanvasStage
        ref={stageRef}
        width={stageWidth}
        height={stageHeight}
        logicalWidth={referenceWidth}
        logicalHeight={referenceHeight}
        responsive
        maxContainerWidth={maxWidth}
        onStageClick={handleStageClick}
        listening={interactive}
        className={`${config.id}-stage`}
      >
        <CanvasRenderLayer
          sortedRenderList={sortedRenderList}
          config={config}
          state={state}
          layout={layout}
          handlers={elementHandlers}
          getSnapTargets={getSnapTargets}
          registerGeometry={updateElementPosition}
          handleSnapChange={handleSnapChange}
          setSnapLines={setSnapLines}
          stageWidth={config.canvas.width}
          stageHeight={config.canvas.height}
          isFontAvailable={isFontAvailable}
          remoteSelections={remoteSelections}
        />

        <PrintGuides format={format} />

        <SnapGuidelines stageWidth={config.canvas.width} stageHeight={config.canvas.height} />
      </CanvasStage>

      {/* Renderless bridge: owns all selectedElement-derived computation.
          Re-renders only this component (returns null) on selection change,
          NOT GenericCanvasInner or the Konva tree. */}
      <ToolbarStateBridge
        bridgeRef={bridgeRef}
        config={config}
        state={state}
        layout={layout}
        actions={actions}
        sortedRenderList={sortedRenderList}
        setState={setStateWrapper}
        debouncedSaveToHistory={debouncedSaveToHistory}
        canUndo={canUndo}
        canRedo={canRedo}
        readOnly={!interactive}
        saveToHistory={saveToHistory}
        onToolbarStateChange={onToolbarStateChange}
      />
    </PendingImagesContext.Provider>
  );
}

GenericCanvasWithRef.displayName = 'GenericCanvasInner';

const MemoizedGenericCanvas = memo(GenericCanvasWithRef) as typeof GenericCanvasWithRef;

/**
 * GenericCanvas — each instance gets its own scoped Zustand store via CanvasStoreProvider.
 * The provider's context value (store reference) is stable, so wrapping adds zero re-render cost.
 * Outer component is NOT memo'd — the inner MemoizedGenericCanvas handles prop comparison.
 */
function CanvasYjsBindingMount({
  pageYMap,
  isSynced,
}: {
  pageYMap: Y.Map<unknown>;
  isSynced: boolean;
}) {
  useYjsCanvasBinding({ parent: pageYMap, isSynced });
  return null;
}

function GenericCanvasWithProvider<
  TState extends Record<string, unknown> & Partial<BaseCanvasState>,
  TActions extends OptionalCanvasActions,
>(props: GenericCanvasProps<TState, TActions> & { forwardedRef?: React.Ref<GenericCanvasRef> }) {
  return (
    <CanvasStoreProvider initialFormatId={props.formatId}>
      {props.pageBinding ? (
        <CanvasYjsBindingMount
          pageYMap={props.pageBinding.pageYMap}
          isSynced={props.pageBinding.isSynced}
        />
      ) : null}
      <MemoizedGenericCanvas {...props} />
    </CanvasStoreProvider>
  );
}

GenericCanvasWithProvider.displayName = 'GenericCanvas';

export const GenericCanvas = GenericCanvasWithProvider;

export default GenericCanvas;

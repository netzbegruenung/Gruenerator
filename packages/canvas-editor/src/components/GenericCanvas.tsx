/**
 * GenericCanvas - Unified config-driven canvas component
 *
 * Renders any canvas type based on FullCanvasConfig.
 * Manages state, history, interactions, and sidebar.
 *
 * Refactored to use extracted hooks, utilities, and components for better maintainability.
 */

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  memo,
  useImperativeHandle,
} from 'react';
import { Layer } from 'react-konva';

import { useSelectionAwareness } from '../collab/useSelectionAwareness';
import { useYjsCanvasBinding } from '../collab/useYjsCanvasBinding';
import { useYjsPageStateSync } from '../collab/useYjsPageStateSync';
import {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreSelector,
} from '../stores/CanvasStoreProvider';
import {
  useCanvasInteractions,
  useCanvasStoreSetup,
  useCanvasHistorySetup,
  useFontLoader,
} from '../hooks';
import { useCanvasAutoSave } from '../hooks/useCanvasAutoSave';
import { useAutoSaveStore } from '../stores/useAutoSaveStore';
import { useCanvasElementHandlers } from '../hooks/useCanvasElementHandlers';
import { useCanvasKeyboardHandlers } from '../hooks/useCanvasKeyboardHandlers';
import { getCanvasFormatOrDefault } from '../formats';
import { CanvasStage, SnapGuidelines, AttributionOverlay } from '../primitives';
import { alignElementX, alignElementY } from '../utils/alignment';
import { calculateAttributionOverlay } from '../utils/attributionOverlay';
import { buildCanvasItems, buildSortedRenderList } from '../utils/canvasLayerManager';
import { captureStageImage } from '../utils/captureStage';
import { ensureFontsReady } from '../utils/ensureFontsReady';
import { getOptimalContainerWidth } from '../utils/viewport';

import { CanvasRenderLayer } from './CanvasRenderLayer';
import { ToolbarStateBridge } from './ToolbarStateBridge';

import type { RemoteSelector } from './RemoteSelectionOverlay';

import type { ToolbarBridgeState } from './ToolbarStateBridge';

const EMPTY_CALLBACKS: Record<string, ((val: unknown) => void) | undefined> = {};

// Background-image state keys that must be synced back to the host (and thus
// persisted to the collaborative document) when changed in-editor. Each maps to
// an `on<Key>Change` callback wired per canvas type in CanvasEditorRouter.
const SYNCED_IMAGE_KEYS = [
  'currentImageSrc',
  'backgroundMode',
  'imageAttribution',
  'imageOffset',
  'imageScale',
  'backgroundImageOpacity',
  'hasBackgroundImage',
] as const;

import type { AlignmentDirection } from './Toolbar';
import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { FullCanvasConfig, LayoutResult } from '../configs/types';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';
import type { FloatingModuleState } from '../hooks/useFloatingModuleState';
import type { ShadowPatch } from '../hooks/useFloatingModuleHandlers';
import type { GradientFill } from '../utils/gradientFill';
import type { MobileBridgeProps } from '../hooks/useMobileBridge';
import type { CanvasStageRef } from '../primitives/CanvasStage';
import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';

export interface ToolbarStateReport {
  selectedElement: string | null;
  activeFloatingModule: FloatingModuleState | null;
  canUndo: boolean;
  canRedo: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export interface GenericCanvasProps<TState, TActions extends OptionalCanvasActions> {
  config: FullCanvasConfig<TState, TActions>;
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
  /** Mobile bridge — when provided, hides Toolbar and reports state to native */
  mobileBridge?: MobileBridgeProps;
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
   * page Y.Map. The page Y.Map owns its own `layers` (Y.Array<Y.Map>) and
   * `config` (Y.Map) sub-collections so each page has independent state.
   * Set in BOTH modes now (collab doc or the editor's local Y.Doc);
   * `provider` is only present in collab mode.
   */
  pageBinding?: {
    pageYMap: import('yjs').Map<unknown>;
    isSynced: boolean;
    /** Hocuspocus provider — enables awareness features (remote selections). */
    provider?: import('@hocuspocus/provider').HocuspocusProvider | null;
    /** Id of this page, published to awareness so peers can filter selections per page. */
    pageId?: string | null;
    /** Only the active page publishes its selection to awareness. */
    publishSelection?: boolean;
  };
}

export interface GenericCanvasRef {
  toDataURL: (options?: {
    format?: 'png' | 'jpeg' | 'webp';
    pixelRatio?: number;
    quality?: number;
    includeBackground?: boolean;
  }) => string | undefined;
  captureCanvas: () => Promise<string | null>;
  /** Lightweight JPEG capture for sending the canvas to vision models. */
  captureCanvasForAi: () => Promise<string | null>;
  /** Toolbar handlers — called by parent when toolbar is rendered at layout level */
  undo?: () => void;
  redo?: () => void;
  handleMoveLayer?: (direction: 'up' | 'down') => void;
  handleColorSelect?: (color: string) => void;
  handleOpacityChange?: (id: string, opacity: number, type: string) => void;
  handleFontSizeChange?: (id: string, size: number) => void;
  handleAlign?: (direction: AlignmentDirection) => void;
  handleShadowChange?: (id: string, patch: ShadowPatch, type: string) => void;
  handleOutlineChange?: (id: string, patch: { stroke?: string; strokeWidth?: number }) => void;
  handleBlurChange?: (id: string, blur: number) => void;
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
    mobileBridge,
    onToolbarStateChange,
    onAutoSaveShareToken,
  } = props;

  const stageRef = useRef<CanvasStageRef>(null);

  // Export state (used by auto-save and attribution overlay)
  const [exportedImage, setExportedImage] = useState<string | null>(null);
  const exportedImageRef = useRef<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useCanvasStoreSetup(config.id, stageRef);

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

  // Sync background-image fields back to the host whenever they change. The
  // config stores update only local component state for these (unlike text
  // fields, which sync through their own callbacks), so without this the chosen
  // background image is lost on reload in the collaborative editor. Emitting the
  // matching `on<Key>Change` callback routes the value through the same
  // formState persistence path text fields use. No-op for keys the active
  // canvas type doesn't wire in CanvasEditorRouter.buildCallbacks.
  const prevSyncedRef = useRef<Record<string, unknown>>({});
  const syncedSeededRef = useRef(false);
  useEffect(() => {
    const s = state as Record<string, unknown>;
    if (!syncedSeededRef.current) {
      // Seed on first render so initial state isn't re-emitted as a change.
      syncedSeededRef.current = true;
      for (const key of SYNCED_IMAGE_KEYS) prevSyncedRef.current[key] = s[key];
      return;
    }
    for (const key of SYNCED_IMAGE_KEYS) {
      const next = s[key];
      if (next !== prevSyncedRef.current[key]) {
        prevSyncedRef.current[key] = next;
        const cbName = `on${key.charAt(0).toUpperCase()}${key.slice(1)}Change`;
        callbacks[cbName]?.(next);
      }
    }
  }, [state, callbacks]);

  // Font loading - non-blocking! Renders immediately with fallback, swaps to custom font when ready
  const { isFontAvailable } = useFontLoader(
    config.fonts?.requireFontLoad !== false && config.fonts
      ? {
          fontFamily: config.fonts.primary,
          fontSize: config.fonts.fontSize,
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
  // Rebuilding through createInitialState recomputes derived fields
  // (balkenInstances, hasBackgroundImage); balkenInstances is dropped from
  // the input so the primary balken regenerates from the new text/colors.
  const handleRemotePageState = useCallback(
    (partial: Record<string, unknown>) => {
      setStateRaw((prev) => {
        const merged: Record<string, unknown> = { ...prev, ...partial };
        delete merged.balkenInstances;
        return config.createInitialState(merged) as TState;
      });
    },
    [config]
  );
  useYjsPageStateSync({
    pageYMap: props.pageBinding?.pageYMap ?? null,
    isSynced: props.pageBinding?.isSynced ?? false,
    onRemoteState: handleRemotePageState,
  });

  const collectState = useCallback(() => state, [state]);
  const handleRestore = useCallback((restoredState: Record<string, unknown>) => {
    setStateRaw((prev) => ({ ...prev, ...restoredState }) as TState);
  }, []);

  const { saveToHistory, debouncedSaveToHistory, undo, redo, canUndo, canRedo } =
    useCanvasHistorySetup(collectState, handleRestore, 500);

  const getState = useCallback(() => state, [state]);

  const actions = useMemo(
    () =>
      config.createActions(
        getState,
        setStateWrapper,
        saveToHistory,
        debouncedSaveToHistory,
        callbacks
      ),
    [config, getState, setStateWrapper, saveToHistory, debouncedSaveToHistory, callbacks]
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

  const layout = useMemo<LayoutResult>(() => {
    return config.calculateLayout(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutKey is a stable string derived from layout-relevant state fields
  }, [config, layoutKey, isFontAvailable]);

  const { setSelectedElement, handleStageClick, handleSnapChange, getSnapTargets } =
    useCanvasInteractions({ stageRef });

  const store = useCanvasStore();
  const { setSnapLines, updateElementPosition } = store.getState();

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
  const autoSaveEnabled = !mobileBridge && (props.autoSave ?? true);

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
    if (historyIndex < 0 || isExporting) return;
    // historyIndex 0 is the initial mount snapshot — an untouched canvas is not dirty
    if (
      autoSaveEnabled &&
      historyIndex > 0 &&
      lastAutoSaveHistoryIndexRef.current !== historyIndex
    ) {
      setAutoSaveDirty(true);
    }
    if (lastAutoSaveHistoryIndexRef.current === historyIndex) return;

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
  }, [historyIndex, isExporting, autoSaveEnabled, setAutoSaveDirty]);

  // Push live state/actions/selection up to the shared sidebar. Replaces the
  // old 200ms poll in PageWrapper: updates land synchronously with edits.
  const onLiveState = props.onLiveState;
  const liveStateRef = useRef({ state, actions });
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
    setSelectedElement,
    updateElementPosition,
    saveToHistory,
    debouncedSaveToHistory,
  });

  useCanvasKeyboardHandlers({
    store,
    state,
    actions,
    setState: setStateWrapper,
    setSelectedElement,
  });

  const canvasItems = useMemo(() => buildCanvasItems(config, state), [config, state]);

  const sortedRenderList = useMemo(
    () => buildSortedRenderList(canvasItems, state.layerOrder ?? []),
    [canvasItems, state.layerOrder]
  );

  // Bridge ref for ToolbarStateBridge → useImperativeHandle communication
  const bridgeRef = useRef<ToolbarBridgeState | null>(null);

  // Calculate attribution overlay data for export (only when exporting)
  const attributionOverlayData = useMemo(() => {
    if (!isExporting) return null;

    const imageAttribution = state.imageAttribution;
    if (!imageAttribution) return null;

    return calculateAttributionOverlay(
      imageAttribution,
      config.canvas.width,
      config.canvas.height,
      'bottom-right',
      10
    );
  }, [isExporting, state, config.canvas.width, config.canvas.height]);

  const handleAlign = useCallback(
    (direction: AlignmentDirection) => {
      const selectedElement = store.getState().selectedElement;
      if (!selectedElement) return;
      const stage = stageRef.current?.getStage();
      if (!stage) return;

      const node = stage.findOne(`#${selectedElement}`);
      if (!node) return;

      const w = node.width() * node.scaleX();
      const h = node.height() * node.scaleY();
      const bounds = { id: selectedElement, x: node.x(), y: node.y(), width: w, height: h };

      let newX = bounds.x;
      let newY = bounds.y;

      if (direction === 'left' || direction === 'center-h' || direction === 'right') {
        newX = alignElementX(bounds, config.canvas.width, direction);
      } else {
        newY = alignElementY(bounds, config.canvas.height, direction);
      }

      elementHandlers.handleElementPositionChange(selectedElement, newX, newY, w, h);
    },
    [store, config.canvas.width, config.canvas.height, elementHandlers]
  );

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
      captureCanvas: async () => {
        await ensureFontsReady();
        return captureStageImage(stageRef.current);
      },
      captureCanvasForAi: async () =>
        captureStageImage(stageRef.current, { format: 'jpeg', pixelRatio: 1, quality: 0.85 }),
      undo,
      redo,
      handleMoveLayer: (dir) => bridgeRef.current?.handleMoveLayer(dir),
      handleColorSelect: (color) => bridgeRef.current?.handleColorSelect(color),
      handleOpacityChange: (id, op, type) => bridgeRef.current?.handleOpacityChange(id, op, type),
      handleFontSizeChange: elementHandlers.handleFontSizeChange,
      handleAlign,
      handleShadowChange: (id, patch, type) =>
        bridgeRef.current?.handleShadowChange(id, patch, type),
      handleOutlineChange: (id, patch) => bridgeRef.current?.handleOutlineChange(id, patch),
      handleBlurChange: (id, blur) => bridgeRef.current?.handleBlurChange(id, blur),
      handleGradientSelect: (gradient) => bridgeRef.current?.handleGradientSelect(gradient),
    }),
    [undo, redo, elementHandlers.handleFontSizeChange, handleAlign]
  );

  return (
    <>
      <CanvasStage
        ref={stageRef}
        width={stageWidth}
        height={stageHeight}
        logicalWidth={referenceWidth}
        logicalHeight={referenceHeight}
        responsive
        maxContainerWidth={maxWidth}
        onStageClick={handleStageClick}
        className={`${config.id}-stage`}
      >
        <CanvasRenderLayer
          sortedRenderList={sortedRenderList}
          config={config}
          state={state}
          layout={layout}
          handlers={elementHandlers}
          getSnapTargets={getSnapTargets}
          handleSnapChange={handleSnapChange}
          setSnapLines={setSnapLines}
          stageWidth={config.canvas.width}
          stageHeight={config.canvas.height}
          isFontAvailable={isFontAvailable}
          remoteSelections={remoteSelections}
        />

        {/* Attribution overlay - only visible during export */}
        {attributionOverlayData && (
          <Layer listening={false}>
            <AttributionOverlay data={attributionOverlayData} />
          </Layer>
        )}

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
        saveToHistory={saveToHistory}
        debouncedSaveToHistory={debouncedSaveToHistory}
        canUndo={canUndo}
        canRedo={canRedo}
        undo={undo}
        redo={redo}
        onToolbarStateChange={onToolbarStateChange}
        mobileBridge={mobileBridge}
        handleFontSizeChange={elementHandlers.handleFontSizeChange}
      />
    </>
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
  pageYMap: import('yjs').Map<unknown>;
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
    <CanvasStoreProvider>
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

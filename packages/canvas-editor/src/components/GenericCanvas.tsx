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
   * When provided, the per-instance Zustand store is bound to the supplied
   * page Y.Map for collaborative editing. The page Y.Map owns its own
   * `layers` (Y.Array<Y.Map>) and `config` (Y.Map) sub-collections so each
   * page in a multi-page canvas has independent CRDT state.
   */
  collaborative?: {
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
    format?: 'png' | 'jpeg';
    pixelRatio?: number;
    quality?: number;
  }) => string | undefined;
  captureCanvas: () => Promise<string | null>;
  /** Lightweight JPEG capture for sending the canvas to vision models. */
  captureCanvasForAi: () => Promise<string | null>;
  /** Get the current canvas state (for shared sidebar in multi-page mode) */
  getState: () => Record<string, unknown>;
  /**
   * Get the canvas actions (for shared sidebar in multi-page mode).
   * Existentially typed: each page's GenericCanvas holds its own concrete
   * TActions; the multi-page CanvasEditor consumes them polymorphically.
   * Use OptionalCanvasActions for typed access to shared optional methods.
   */
  getActions: () => Record<string, unknown>;
  /** Get the currently selected element ID (for shared sidebar tab visibility) */
  getSelectedElement?: () => string | null;
  /** Toolbar handlers — called by parent when toolbar is rendered at layout level */
  undo?: () => void;
  redo?: () => void;
  handleMoveLayer?: (direction: 'up' | 'down') => void;
  handleColorSelect?: (color: string) => void;
  handleOpacityChange?: (id: string, opacity: number, type: string) => void;
  handleFontSizeChange?: (id: string, size: number) => void;
  handleAlign?: (direction: AlignmentDirection) => void;
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
    pageYMap: props.collaborative?.pageYMap ?? null,
    isSynced: props.collaborative?.isSynced ?? false,
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

  // Auto-save hook for gallery integration. Skipped in collaborative mode —
  // Hocuspocus persists Yjs updates server-side; the gallery share-token path
  // would race with Y.Doc state.
  const autoSaveEnabled = !mobileBridge && !props.collaborative;
  useCanvasAutoSave(exportedImage, {
    canvasType: config.id,
    canvasState: state,
    enabled: autoSaveEnabled,
  });

  // History-synced auto-save: capture canvas whenever undo/redo history changes
  const historyIndex = useCanvasStoreSelector((s) => s.historyIndex);
  const selectedElementForCapture = useCanvasStoreSelector((s) => s.selectedElement);
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
    // Capture waits until nothing is selected (selection handles would end up in
    // the screenshot); selectedElementForCapture in the deps re-runs this effect
    // on deselect so the pending historyIndex still gets captured.
    if (store.getState().selectedElement) return;
    if (lastAutoSaveHistoryIndexRef.current === historyIndex) return;

    // Debounce screenshot capture — toDataURL at pixelRatio:2 is expensive (~100-200ms).
    // 1500ms ensures we only capture after the user stops editing.
    const timer = setTimeout(() => {
      // Re-check at capture time in case selection changed during debounce
      if (store.getState().selectedElement) return;
      const dataUrl = stageRef.current?.toDataURL({ format: 'png', pixelRatio: 2 });
      if (dataUrl) {
        setExportedImage(dataUrl);
        exportedImageRef.current = dataUrl;
        lastAutoSaveHistoryIndexRef.current = historyIndex;
      } else {
        console.warn('[AutoSave] capture failed: stage toDataURL returned null');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [
    historyIndex,
    isExporting,
    store,
    selectedElementForCapture,
    autoSaveEnabled,
    setAutoSaveDirty,
  ]);

  // Live remote selections (collab mode). Publishes the local selection to
  // awareness (active page only) and maps remote peers' selections on this
  // page to element ids for the render layer's outlines.
  const collabPageId = props.collaborative?.pageId ?? null;
  const remoteSelectionsRaw = useSelectionAwareness(props.collaborative?.provider ?? null, {
    activePageId: collabPageId,
    publish: props.collaborative?.publishSelection ?? true,
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
      captureCanvas: async () => {
        if (store.getState().selectedElement) {
          setSelectedElement(null);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return stageRef.current?.toDataURL({ format: 'png', pixelRatio: 2 }) ?? null;
      },
      captureCanvasForAi: async () => {
        if (store.getState().selectedElement) {
          setSelectedElement(null);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return (
          stageRef.current?.toDataURL({ format: 'jpeg', pixelRatio: 1, quality: 0.85 }) ?? null
        );
      },
      getState: () => state as Record<string, unknown>,
      getActions: () => actions as unknown as Record<string, unknown>,
      getSelectedElement: () => store.getState().selectedElement,
      undo,
      redo,
      handleMoveLayer: (dir) => bridgeRef.current?.handleMoveLayer(dir),
      handleColorSelect: (color) => bridgeRef.current?.handleColorSelect(color),
      handleOpacityChange: (id, op, type) => bridgeRef.current?.handleOpacityChange(id, op, type),
      handleFontSizeChange: elementHandlers.handleFontSizeChange,
      handleAlign,
    }),
    [
      state,
      actions,
      store,
      setSelectedElement,
      undo,
      redo,
      elementHandlers.handleFontSizeChange,
      handleAlign,
    ]
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
      {props.collaborative ? (
        <CanvasYjsBindingMount
          pageYMap={props.collaborative.pageYMap}
          isSynced={props.collaborative.isSynced}
        />
      ) : null}
      <MemoizedGenericCanvas {...props} />
    </CanvasStoreProvider>
  );
}

GenericCanvasWithProvider.displayName = 'GenericCanvas';

export const GenericCanvas = GenericCanvasWithProvider;

export default GenericCanvas;

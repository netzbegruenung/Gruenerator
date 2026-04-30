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

import { useYjsCanvasBinding } from '../collab/useYjsCanvasBinding';
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

import type { ToolbarBridgeState } from './ToolbarStateBridge';

const EMPTY_CALLBACKS: Record<string, ((val: unknown) => void) | undefined> = {};

import type { AlignmentDirection } from './Toolbar';
import type { StockImageAttribution } from '../common/imageSourceTypes';
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
  /** Get the canvas actions (for shared sidebar in multi-page mode) */
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
  TState extends Record<string, unknown>,
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
  useCanvasAutoSave(exportedImage, {
    canvasType: config.id,
    canvasState: state,
    enabled: !mobileBridge && !props.collaborative,
  });

  // History-synced auto-save: capture canvas whenever undo/redo history changes
  const historyIndex = useCanvasStoreSelector((s) => s.historyIndex);
  const lastAutoSaveHistoryIndexRef = useRef(-1);

  useEffect(() => {
    // Skip initial render, invalid states, and when already exporting
    if (historyIndex < 0 || isExporting) return;
    // Skip if element is selected (read non-reactively — no rerender on selection change)
    if (store.getState().selectedElement) return;
    // Skip if already saved for this history index
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
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [historyIndex, isExporting, store]);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actions: actions as any, // TActions may have different shape; keyboard handlers check with optional chaining
    setState: setStateWrapper,
    setSelectedElement,
  });

  const canvasItems = useMemo(() => buildCanvasItems(config, state), [config, state]);

  const sortedRenderList = useMemo(
    () =>
      buildSortedRenderList(
        canvasItems,
        ((state as unknown as Record<string, unknown>).layerOrder as string[]) || []
      ),
    [canvasItems, (state as unknown as Record<string, unknown>).layerOrder]
  );

  // Bridge ref for ToolbarStateBridge → useImperativeHandle communication
  const bridgeRef = useRef<ToolbarBridgeState | null>(null);

  // Calculate attribution overlay data for export (only when exporting)
  const attributionOverlayData = useMemo(() => {
    if (!isExporting) return null;

    // Check if state has imageAttribution field
    const imageAttribution = (state as unknown as Record<string, unknown>).imageAttribution as
      | StockImageAttribution
      | null
      | undefined;
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
  TState extends Record<string, unknown>,
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

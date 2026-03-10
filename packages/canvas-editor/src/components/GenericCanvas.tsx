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

import { useCanvasEditorStore, useSnapGuides, useSnapLines } from '../stores/canvasEditorStore';
import {
  useCanvasInteractions,
  useCanvasStoreSetup,
  useCanvasHistorySetup,
  useFontLoader,
} from '../hooks';
import { useCanvasAutoSave } from '../hooks/useCanvasAutoSave';
import { useCanvasElementHandlers } from '../hooks/useCanvasElementHandlers';
import { useCanvasKeyboardHandlers } from '../hooks/useCanvasKeyboardHandlers';
import { useCanvasLayerControls } from '../hooks/useCanvasLayerControls';
import { useFloatingModuleHandlers } from '../hooks/useFloatingModuleHandlers';
import { useFloatingModuleState } from '../hooks/useFloatingModuleState';
import { CanvasStage, SnapGuidelines, AttributionOverlay } from '../primitives';
import { alignElementX, alignElementY } from '../utils/alignment';
import { calculateAttributionOverlay } from '../utils/attributionOverlay';
import { buildCanvasItems, buildSortedRenderList } from '../utils/canvasLayerManager';
import { getOptimalContainerWidth } from '../utils/viewport';

import { useMobileBridge } from '../hooks/useMobileBridge';
import { CanvasRenderLayer } from './CanvasRenderLayer';
import { FloatingToolbar } from './FloatingToolbar';

import type { AlignmentDirection } from './FloatingToolbar';
import type { StockImageAttribution } from '../common/imageSourceTypes';
import type { FullCanvasConfig, LayoutResult } from '../configs/types';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';
import type { MobileBridgeProps } from '../hooks/useMobileBridge';
import type { CanvasStageRef } from '../primitives/CanvasStage';

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
  /** Mobile bridge — when provided, hides FloatingToolbar and reports state to native */
  mobileBridge?: MobileBridgeProps;
}

export interface GenericCanvasRef {
  toDataURL: (options?: { format?: 'png' | 'jpeg'; pixelRatio?: number }) => string | undefined;
  captureCanvas: () => Promise<string | null>;
  /** Get the current canvas state (for shared sidebar in multi-page mode) */
  getState: () => Record<string, unknown>;
  /** Get the canvas actions (for shared sidebar in multi-page mode) */
  getActions: () => Record<string, unknown>;
  /** Get the currently selected element ID (for shared sidebar tab visibility) */
  getSelectedElement?: () => string | null;
}

// Generic component with forwardRef - uses type assertion pattern for TypeScript compatibility
function GenericCanvasWithRef<
  TState extends Record<string, unknown>,
  TActions extends OptionalCanvasActions,
>(props: GenericCanvasProps<TState, TActions> & { forwardedRef?: React.Ref<GenericCanvasRef> }) {
  const {
    config,
    initialProps,
    onSave,
    callbacks = {},
    onDelete,
    forwardedRef,
    mobileBridge,
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

  const {
    selectedElement,
    setSelectedElement,
    handleStageClick,
    handleSnapChange,
    handleExport: _handleExport, // Not used - we handle export ourselves
    handleSave: _handleSave,
    getSnapTargets,
  } = useCanvasInteractions<string | null>({
    stageRef,
    onExport: () => {}, // No-op - prevents unwanted navigation to result screen
    onSave,
  });

  // Expose ref methods for parent access (multi-page export and shared sidebar)
  useImperativeHandle(
    forwardedRef,
    () => ({
      toDataURL: (options) => {
        return stageRef.current?.toDataURL(options);
      },
      captureCanvas: async () => {
        if (selectedElement) {
          setSelectedElement(null);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return stageRef.current?.toDataURL({ format: 'png', pixelRatio: 2 }) ?? null;
      },
      getState: () => state as Record<string, unknown>,
      getActions: () => actions as unknown as Record<string, unknown>,
      getSelectedElement: () => selectedElement,
    }),
    [state, actions, selectedElement]
  );

  const snapGuides = useSnapGuides();
  const snapLines = useSnapLines();
  const { setSnapLines, updateElementPosition } = useCanvasEditorStore();

  // Auto-save hook for gallery integration
  useCanvasAutoSave(exportedImage, {
    canvasType: config.id,
    canvasState: state,
    enabled: true,
  });

  // History-synced auto-save: capture canvas whenever undo/redo history changes: capture canvas whenever undo/redo history changes
  const historyIndex = useCanvasEditorStore((s) => s.historyIndex);
  const lastAutoSaveHistoryIndexRef = useRef(-1);

  useEffect(() => {
    // Skip initial render, invalid states, and when already exporting
    if (historyIndex < 0 || isExporting || selectedElement) return;
    // Skip if already saved for this history index
    if (lastAutoSaveHistoryIndexRef.current === historyIndex) return;

    // Debounce screenshot capture — toDataURL at pixelRatio:2 is expensive (~100-200ms).
    // 1500ms ensures we only capture after the user stops editing.
    const timer = setTimeout(() => {
      const dataUrl = stageRef.current?.toDataURL({ format: 'png', pixelRatio: 2 });
      if (dataUrl) {
        setExportedImage(dataUrl);
        exportedImageRef.current = dataUrl;
        lastAutoSaveHistoryIndexRef.current = historyIndex;
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [historyIndex, isExporting, selectedElement]);

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
    selectedElement,
    state,
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

  const layerControls = useCanvasLayerControls({
    selectedElement,
    sortedRenderList,
    setState: setStateWrapper,
    saveToHistory,
    state,
  });

  const activeFloatingModule = useFloatingModuleState({
    selectedElement,
    config,
    state,
    layout,
  });

  const floatingHandlers = useFloatingModuleHandlers({
    activeFloatingModule,
    actions,
    config,
    state,
    setState: setStateWrapper,
    debouncedSaveToHistory,
  });

  // Mobile bridge: report element/history state and execute native toolbar actions
  useMobileBridge(mobileBridge, {
    selectedElement,
    activeFloatingModule,
    canUndo,
    canRedo,
    canMoveUp: layerControls.canMoveUp,
    canMoveDown: layerControls.canMoveDown,
    handlers: {
      undo,
      redo,
      handleMoveLayer: layerControls.handleMoveLayer,
      handleColorSelect: floatingHandlers.handleColorSelect,
      handleOpacityChange: floatingHandlers.handleOpacityChange,
      handleFontSizeChange: elementHandlers.handleFontSizeChange,
    },
  });

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

      // Update position through the element handler system
      elementHandlers.handleElementPositionChange(selectedElement, newX, newY, w, h);
    },
    [selectedElement, config.canvas.width, config.canvas.height, elementHandlers]
  );

  // In mobile bridge mode, native handles the toolbar — skip rendering the web one
  const toolbarElement = mobileBridge ? null : (
    <FloatingToolbar
      selectedElement={selectedElement}
      activeFloatingModule={activeFloatingModule}
      canUndo={canUndo}
      canRedo={canRedo}
      canMoveUp={layerControls.canMoveUp}
      canMoveDown={layerControls.canMoveDown}
      handlers={{
        undo,
        redo,
        handleMoveLayer: layerControls.handleMoveLayer,
        handleColorSelect: floatingHandlers.handleColorSelect,
        handleOpacityChange: floatingHandlers.handleOpacityChange,
        handleFontSizeChange: elementHandlers.handleFontSizeChange,
        handleAlign,
      }}
      onDelete={onDelete}
    />
  );

  const canvasContent = (
    <CanvasStage
      ref={stageRef}
      width={config.canvas.width}
      height={config.canvas.height}
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
        selectedElement={selectedElement}
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

      <SnapGuidelines
        showH={snapGuides.h}
        showV={snapGuides.v}
        stageWidth={config.canvas.width}
        stageHeight={config.canvas.height}
        snapLines={snapLines}
      />
    </CanvasStage>
  );

  return (
    <>
      {toolbarElement}
      {canvasContent}
    </>
  );
}

GenericCanvasWithRef.displayName = 'GenericCanvas';

export const GenericCanvas = memo(GenericCanvasWithRef) as typeof GenericCanvasWithRef;

export default GenericCanvas;

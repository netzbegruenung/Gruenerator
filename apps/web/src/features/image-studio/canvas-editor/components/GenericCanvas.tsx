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
import { useNavigate } from 'react-router-dom';

import SharepicShareModal from '../../../../components/common/SharepicShareModal';
import {
  useCanvasEditorStore,
  useSnapGuides,
  useSnapLines,
} from '../../../../stores/canvasEditorStore';
import {
  useCanvasInteractions,
  useCanvasStoreSetup,
  useCanvasHistorySetup,
  useFontLoader,
} from '../hooks';
import { useBackendCanvasExport } from '../hooks/useBackendCanvasExport';
import { useCanvasAutoSave } from '../hooks/useCanvasAutoSave';
import { useCanvasElementHandlers } from '../hooks/useCanvasElementHandlers';
import { useCanvasKeyboardHandlers } from '../hooks/useCanvasKeyboardHandlers';
import { useCanvasLayerControls } from '../hooks/useCanvasLayerControls';
import { useFloatingModuleHandlers } from '../hooks/useFloatingModuleHandlers';
import { useFloatingModuleState } from '../hooks/useFloatingModuleState';
import { CanvasStage, SnapGuidelines, AttributionOverlay } from '../primitives';
import { calculateAttributionOverlay } from '../utils/attributionOverlay';
import { buildCanvasItems, buildSortedRenderList } from '../utils/canvasLayerManager';
import { downloadCanvasImage } from '../utils/downloadCanvas';
import { getOptimalContainerWidth } from '../utils/viewport';

import { CanvasRenderLayer } from './CanvasRenderLayer';
import { FloatingToolbar } from './FloatingToolbar';
import { GenericCanvasEditor } from './GenericCanvasEditor';
import './GenericCanvas.css';

import type { StockImageAttribution } from '../../services/imageSourceService';
import type { FullCanvasConfig, LayoutResult } from '../configs/types';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';
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
  bare?: boolean;
  onDelete?: () => void;
  // Multi-page export props (passed to share section)
  multiPageExport?: {
    pageCount: number;
    onDownloadAllZip: () => Promise<void>;
    isExporting: boolean;
    exportProgress: { current: number; total: number };
  };
}

export interface GenericCanvasRef {
  toDataURL: (options?: { format?: 'png' | 'jpeg'; pixelRatio?: number }) => string | undefined;
  captureCanvas: () => Promise<string | null>;
  /** Get the current canvas state (for shared sidebar in multi-page mode) */
  getState: () => Record<string, unknown>;
  /** Get the canvas actions (for shared sidebar in multi-page mode) */
  getActions: () => Record<string, unknown>;
}

// Generic component with forwardRef - uses type assertion pattern for TypeScript compatibility
function GenericCanvasWithRef<
  TState extends Record<string, unknown>,
  TActions extends OptionalCanvasActions,
>(props: GenericCanvasProps<TState, TActions> & { forwardedRef?: React.Ref<GenericCanvasRef> }) {
  const {
    config,
    initialProps,
    onExport: _onExport,
    onSave,
    onCancel: _onCancel,
    callbacks = {},
    className: _className,
    onAddPage,
    renderAddPage,
    bare = false,
    onDelete,
    multiPageExport,
    forwardedRef,
  } = props;

  const stageRef = useRef<CanvasStageRef>(null);
  const navigate = useNavigate();

  // Share feature state
  const [exportedImage, setExportedImage] = useState<string | null>(null);
  const exportedImageRef = useRef<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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

  // Expose ref methods for parent access (multi-page export and shared sidebar)
  useImperativeHandle(
    forwardedRef,
    () => ({
      toDataURL: (options) => {
        return stageRef.current?.toDataURL(options);
      },
      captureCanvas: async () => {
        // Small delay to ensure canvas is fully rendered
        await new Promise((resolve) => setTimeout(resolve, 100));
        return stageRef.current?.toDataURL({ format: 'png', pixelRatio: 2 }) ?? null;
      },
      getState: () => state as Record<string, unknown>,
      getActions: () => actions as unknown as Record<string, unknown>,
    }),
    [state, actions]
  );

  const layout = useMemo<LayoutResult>(() => {
    // Recalculates when font becomes available, ensuring text measurements use the correct font
    return config.calculateLayout(state);
  }, [config, state, isFontAvailable]);

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

  const snapGuides = useSnapGuides();
  const snapLines = useSnapLines();
  const { setSnapLines, updateElementPosition } = useCanvasEditorStore();

  // Auto-save hook for gallery integration
  const {
    status: autoSaveStatus,
    shareToken,
    retry: _retryAutoSave,
  } = useCanvasAutoSave(exportedImage, {
    canvasType: config.id,
    canvasState: state,
    enabled: true,
  });

  // History-synced auto-save: capture canvas whenever undo/redo history changes
  const historyIndex = useCanvasEditorStore((s) => s.historyIndex);
  const lastAutoSaveHistoryIndexRef = useRef(-1);

  useEffect(() => {
    // Skip initial render, invalid states, and when already exporting
    if (historyIndex < 0 || isExporting) return;
    // Skip if already saved for this history index
    if (lastAutoSaveHistoryIndexRef.current === historyIndex) return;

    // Small delay to ensure canvas is fully rendered after state change
    const timer = setTimeout(() => {
      const dataUrl = stageRef.current?.toDataURL({ format: 'png', pixelRatio: 2 });
      if (dataUrl) {
        setExportedImage(dataUrl);
        exportedImageRef.current = dataUrl;
        lastAutoSaveHistoryIndexRef.current = historyIndex;
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [historyIndex, isExporting]);

  // Backend canvas export hook (server-side rendering via Free Canvas API)
  const {
    exportViaBackend,
    isExporting: _isBackendExporting,
    error: backendExportError,
  } = useBackendCanvasExport(config, state);

  // Share handlers - use ref to always get latest image (fixes stale closure)
  const handleDownload = useCallback(() => {
    const image = exportedImageRef.current;
    if (image) {
      downloadCanvasImage(image, config.id);
    }
  }, [config.id]);

  const _handleShareClick = useCallback(() => {
    setShareModalOpen(true);
  }, []);

  const handleNavigateToGallery = useCallback(() => {
    if (shareToken) {
      navigate(`/image-studio/gallery?highlight=${shareToken}`);
    }
  }, [shareToken, navigate]);

  // Override handleExport to capture canvas for share flow (with attribution overlay)
  const handleExportWithShare = useCallback(() => {
    return new Promise<void>((resolve) => {
      setSelectedElement(null);
      setIsExporting(true);
      setTimeout(() => {
        const dataUrl = stageRef.current?.toDataURL({ format: 'png', pixelRatio: 2 });
        setIsExporting(false);
        if (dataUrl) {
          setExportedImage(dataUrl);
          exportedImageRef.current = dataUrl;
          // Auto-save will trigger automatically via useCanvasAutoSave hook
          resolve();
        } else {
          resolve(); // Resolve even on error to not block UI
        }
      }, 100);
    });
  }, [stageRef, setSelectedElement]);

  // Backend export handler (uses Free Canvas API for server-side rendering)
  const handleExportViaBackend = useCallback(async () => {
    setSelectedElement(null);
    setExportError(null);
    setIsExporting(true);

    const result = await exportViaBackend();

    setIsExporting(false);

    if (result) {
      setExportedImage(result);
      exportedImageRef.current = result;
      // Auto-save will trigger automatically via useCanvasAutoSave hook
    } else if (backendExportError) {
      setExportError(backendExportError);
    }
  }, [exportViaBackend, setSelectedElement, backendExportError]);

  // Choose export method: Use backend for simple_canvas, frontend for others
  const handleExportAction =
    config.id === 'simple-canvas' ? handleExportViaBackend : handleExportWithShare;

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

  const canvasState = useMemo(
    () => ({
      ...state,
      isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
    }),
    [state]
  );

  // Extract text content for sharing from canvas state
  const _canvasTextContent = useMemo(() => {
    const s = state as unknown as Partial<
      Record<
        'quote' | 'headline' | 'header' | 'body' | 'subtext' | 'eventTitle' | 'beschreibung',
        string
      >
    >;
    const textParts: string[] = [];

    // Common text fields across different canvas types
    if (s.quote) textParts.push(s.quote);
    if (s.headline) textParts.push(s.headline);
    if (s.header) textParts.push(s.header);
    if (s.body) textParts.push(s.body);
    if (s.subtext) textParts.push(s.subtext);
    if (s.eventTitle) textParts.push(s.eventTitle);
    if (s.beschreibung) textParts.push(s.beschreibung);

    return textParts.filter(Boolean).join('\n').trim();
  }, [state]);

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

  // Share props (MUST be before ANY return statement, including early returns)
  const sharePropsToPass = useMemo(() => {
    return {
      exportedImage,
      autoSaveStatus: autoSaveStatus,
      shareToken,
      onCaptureCanvas: handleExportAction,
      onDownload: handleDownload,
      onNavigateToGallery: handleNavigateToGallery,
      // Multi-page export props (only present when in multi-page mode)
      ...(multiPageExport && {
        pageCount: multiPageExport.pageCount,
        onDownloadAllZip: multiPageExport.onDownloadAllZip,
        isMultiExporting: multiPageExport.isExporting,
        exportProgress: multiPageExport.exportProgress,
      }),
    };
  }, [
    exportedImage,
    autoSaveStatus,
    shareToken,
    handleExportAction,
    handleDownload,
    handleNavigateToGallery,
    multiPageExport,
  ]);

  const canvasContent = (
    <>
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
        }}
        onDelete={onDelete}
      />

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
    </>
  );

  return bare ? (
    canvasContent
  ) : (
    <>
      <GenericCanvasEditor
        config={config}
        state={canvasState}
        actions={actions}
        selectedElement={selectedElement}
        onExport={handleExportAction}
        onAddPage={onAddPage}
        renderAddPage={renderAddPage}
        shareProps={sharePropsToPass}
      >
        {canvasContent}
      </GenericCanvasEditor>

      {/* Export error message */}
      {exportError && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: '#f44336',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 1000,
            maxWidth: '400px',
          }}
        >
          <strong>Export Failed:</strong> {exportError}
          <button
            onClick={() => setExportError(null)}
            style={{
              marginLeft: '10px',
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Share modal for platform selection */}
      {shareModalOpen && exportedImage && (
        <SharepicShareModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          sharepicData={{ image: exportedImage }}
          socialContent=""
          selectedPlatforms={[]}
        />
      )}
    </>
  );
}

GenericCanvasWithRef.displayName = 'GenericCanvas';

export const GenericCanvas = memo(GenericCanvasWithRef) as typeof GenericCanvasWithRef;

export default GenericCanvas;

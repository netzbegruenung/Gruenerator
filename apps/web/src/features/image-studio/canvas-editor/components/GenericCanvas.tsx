/**
 * GenericCanvas - Unified config-driven canvas component
 *
 * Renders any canvas type based on FullCanvasConfig.
 * Manages state, history, interactions, and sidebar.
 *
 * Refactored to use extracted hooks, utilities, and components for better maintainability.
 */

import React, { useRef, useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Layer } from 'react-konva';
import { CanvasStage, SnapGuidelines, AttributionOverlay } from '../primitives';
import type { FullCanvasConfig, LayoutResult } from '../configs/types';
import type { CanvasStageRef } from '../primitives/CanvasStage';
import { useCanvasInteractions, useCanvasStoreSetup, useCanvasHistorySetup, useFontLoader } from '../hooks';
import { calculateAttributionOverlay } from '../utils/attributionOverlay';
import type { StockImageAttribution } from '../../../services/imageSourceService';
import { useCanvasEditorStore, useSnapGuides, useSnapLines } from '../../../../stores/canvasEditorStore';
import { useCanvasElementHandlers } from '../hooks/useCanvasElementHandlers';
import { useCanvasKeyboardHandlers } from '../hooks/useCanvasKeyboardHandlers';
import { useCanvasLayerControls } from '../hooks/useCanvasLayerControls';
import { useFloatingModuleState } from '../hooks/useFloatingModuleState';
import { useFloatingModuleHandlers } from '../hooks/useFloatingModuleHandlers';
import { buildCanvasItems, buildSortedRenderList } from '../utils/canvasLayerManager';
import { getOptimalContainerWidth } from '../utils/viewport';
import { GenericCanvasEditor } from './GenericCanvasEditor';
import { FloatingToolbar } from './FloatingToolbar';
import { CanvasRenderLayer } from './CanvasRenderLayer';
import { useCanvasAutoSave } from '../hooks/useCanvasAutoSave';
import { useBackendCanvasExport } from '../hooks/useBackendCanvasExport';
import SharepicShareModal from '../../../../components/common/SharepicShareModal';
import { downloadCanvasImage } from '../utils/downloadCanvas';
import { useNavigate } from 'react-router-dom';
import './GenericCanvas.css';

export interface GenericCanvasProps<TState, TActions> {
    config: FullCanvasConfig<TState, TActions>;
    initialProps: Record<string, any>;
    onExport: (base64: string) => void;
    onSave?: (base64: string) => void;
    onCancel: () => void;
    callbacks?: Record<string, ((val: any) => void) | undefined>;
    className?: string;
    onAddPage?: () => void;
    bare?: boolean;
    onDelete?: () => void;
}

function GenericCanvasInner<TState extends Record<string, any>, TActions>({
    config,
    initialProps,
    onExport,
    onSave,
    onCancel,
    callbacks = {},
    className,
    onAddPage,
    bare = false,
    onDelete,
}: GenericCanvasProps<TState, TActions>) {
    const stageRef = useRef<CanvasStageRef>(null);
    const navigate = useNavigate();

    // Share feature state
    const [exportedImage, setExportedImage] = useState<string | null>(null);
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

    const [state, setStateRaw] = useState<TState>(() => config.createInitialState(initialProps));

    useEffect(() => {
        setStateRaw(config.createInitialState(initialProps));
    }, [config, initialProps]);

    // Font loading - only if config specifies fonts
    const fontLoaded = useFontLoader(
        config.fonts?.requireFontLoad !== false && config.fonts
            ? {
                fontFamily: config.fonts.primary,
                fontSize: config.fonts.fontSize,
                maxAttempts: 30,
                pollInterval: 50,
            }
            : null
    );

    const shouldWaitForFont = config.fonts?.requireFontLoad !== false && !fontLoaded;

    const setStateWrapper = useCallback(
        (partial: Partial<TState> | ((prev: TState) => TState)) => {
            setStateRaw((prev) => {
                if (typeof partial === 'function') {
                    return partial(prev);
                }
                return { ...prev, ...partial };
            });
        },
        []
    );

    const collectState = useCallback(() => state, [state]);
    const handleRestore = useCallback((restoredState: Record<string, unknown>) => {
        setStateRaw((prev) => ({ ...prev, ...restoredState } as TState));
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

    const layout = useMemo<LayoutResult>(() => {
        // Defer layout calculation until font loads
        if (shouldWaitForFont) {
            return {} as LayoutResult;
        }
        return config.calculateLayout(state);
    }, [config, state, shouldWaitForFont]);

    const {
        selectedElement,
        setSelectedElement,
        handleStageClick,
        handleSnapChange,
        handleExport, // Not used - we handle export ourselves
        handleSave,
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
    const { status: autoSaveStatus, shareToken, retry: retryAutoSave } = useCanvasAutoSave(
        exportedImage,
        {
            canvasType: config.id,
            canvasState: state,
            enabled: true,
        }
    );

    // Backend canvas export hook (server-side rendering via Free Canvas API)
    const {
        exportViaBackend,
        isExporting: isBackendExporting,
        error: backendExportError,
    } = useBackendCanvasExport(config, state);

    // Share handlers
    const handleDownload = useCallback(() => {
        if (exportedImage) {
            downloadCanvasImage(exportedImage, config.id);
        }
    }, [exportedImage, config.id]);

    const handleShareClick = useCallback(() => {
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
            // Auto-save will trigger automatically via useCanvasAutoSave hook
        } else if (backendExportError) {
            setExportError(backendExportError);
        }
    }, [exportViaBackend, setSelectedElement, backendExportError]);

    // Choose export method: Use backend for simple_canvas, frontend for others
    const handleExportAction = config.id === 'simple-canvas' ? handleExportViaBackend : handleExportWithShare;

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
        actions,
        setState: setStateWrapper,
        setSelectedElement,
    });

    const canvasItems = useMemo(() => buildCanvasItems(config, state), [config, state]);

    const sortedRenderList = useMemo(
        () => buildSortedRenderList(canvasItems, (state as any).layerOrder || []),
        [canvasItems, (state as any).layerOrder]
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
    const canvasTextContent = useMemo(() => {
        const s = state as any;
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
        const imageAttribution = (state as any).imageAttribution as StockImageAttribution | null | undefined;
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
            autoSaveStatus,
            shareToken,
            onCaptureCanvas: handleExportAction,
            onDownload: handleDownload,
            onNavigateToGallery: handleNavigateToGallery,
        };
    }, [exportedImage, autoSaveStatus, shareToken, handleExportAction, handleDownload, handleNavigateToGallery]);

    // Show loading state while font loads
    if (shouldWaitForFont) {
        return (
            <div className="generic-canvas-font-loading">
                <div className="font-loading-text">
                    Schriftart wird geladen...
                </div>
                <div className="font-loading-bar">
                    <div className="font-loading-progress" />
                </div>
            </div>
        );
    }

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
                onSave={handleSave}
                onAddPage={onAddPage}
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

export const GenericCanvas = memo(GenericCanvasInner) as typeof GenericCanvasInner;

export default GenericCanvas;

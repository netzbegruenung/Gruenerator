/**
 * CanvasEditor - Canvas editor with shared sidebar and page management
 *
 * Architecture: SHARED SIDEBAR pattern
 * - ONE sidebar managed at this level (not per-page)
 * - Sidebar reads config/state/actions from the ACTIVE page
 * - GenericCanvas children render in "bare" mode (no individual sidebars)
 * - Click on a page to select it, sidebar updates automatically
 *
 * Performance optimizations applied (Vercel React Best Practices):
 * - Memoized page components to prevent unnecessary re-renders
 * - Functional setState for stable callbacks
 * - Hoisted static JSX elements
 * - content-visibility CSS for off-screen pages
 */

import React, {
  useCallback,
  useRef,
  useMemo,
  useEffect,
  useState,
  Suspense,
  memo,
  lazy,
} from 'react';

import Spinner from '../common/Spinner';
import { usePageManager, useMultiPageExport, usePresentationExport } from '../hooks';
import { useMobileBridge } from '../hooks/useMobileBridge';
import { CanvasEditorLayout } from '../layouts';
import { MobileSubsectionBridgeContext } from '../sidebar/MobileSubsectionBridgeContext';
import { UserUploadsProvider } from '../sidebar/UserUploadsProvider';
import { AutoSaveStoreProvider, useAutoSaveStoreApi } from '../stores/useAutoSaveStore';
import { useCanvasSidebarStore } from '../stores/canvasSidebarStore';

import { GenericCanvas } from './GenericCanvas';
import { PageToolbar } from './PageToolbar';
import { Toolbar } from './Toolbar';
import { AddPageButton } from './TemplatePickerFlyout';
import { ZoomableViewport } from './ZoomableViewport';

import type { GenericCanvasRef, ToolbarStateReport } from './GenericCanvas';
import type { AlignmentDirection } from './Toolbar';
import type { CanvasConfigId, FullCanvasConfig } from '../configs/types';
import type { MobileBridgeProps } from '../hooks/useMobileBridge';
import type { MobileSubsectionBridgeValue } from '../sidebar/MobileSubsectionBridgeContext';
import type { InitialPageDef } from '../hooks/usePageManager';
import type { SidebarTabId } from '../sidebar/types';

import { cn } from '../utils/cn';

const LazySidebarTabBar = lazy(() =>
  import('../sidebar').then((m) => ({ default: m.SidebarTabBar }))
);
const LazySidebarPanel = lazy(() =>
  import('../sidebar').then((m) => ({ default: m.SidebarPanel }))
);
const LazyWebSubsectionBar = lazy(() =>
  import('../sidebar').then((m) => ({ default: m.WebSubsectionBar }))
);

// Hoisted static JSX elements (Rule 6.3: avoids re-creation every render)
const sidebarLoadingFallback = (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      padding: 'var(--spacing-large)',
      minHeight: '200px',
    }}
  >
    <Spinner size="medium" />
  </div>
);

const pageLoadingIndicator = (
  <div className="flex flex-col w-full items-center justify-center min-h-[400px]">
    <div className="text-sm text-foreground-muted">Lädt Vorlagen...</div>
  </div>
);

interface CanvasEditorProps {
  initialConfigId: CanvasConfigId;
  initialProps: Record<string, unknown>;
  onExport: (base64: string) => void;
  onCancel: () => void;
  callbacks?: Record<string, (val: unknown) => void>;
  maxPages?: number;
  /** Pre-populated pages — overrides single-page initialization when provided */
  initialPages?: InitialPageDef[];
  /** Mobile bridge — when provided, hides web tab bar + floating toolbar, uses native controls */
  mobileBridge?: MobileBridgeProps;
  /** When true, tab bar is handled externally (e.g. web app sidebar) via canvasSidebarStore */
  externalSidebar?: boolean;
  /** When true + externalSidebar, syncs mobile subsection state to canvasSidebarStore for external mobile UI */
  externalMobileMode?: boolean;
  /**
   * Collaborative mode — fed into usePageManager to back the pages list with
   * a Yjs doc, and used to derive each page's Y.Map for layers/config sync.
   */
  collaborative?: {
    ydoc: import('yjs').Doc;
    isSynced: boolean;
  };
  /**
   * Seeds the per-instance AutoSaveStore with a known share token, e.g. when
   * the editor is opened against an existing share via URL. Without this seed,
   * the first save after a page reload creates a new draft instead of updating.
   */
  initialShareToken?: string | null;
}

interface PageWrapperProps {
  page: { id: string; configId: CanvasConfigId; state: Record<string, unknown> };
  index: number;
  pageCount: number;
  config: FullCanvasConfig;
  isActive: boolean;
  canDelete: boolean;
  canvasRef: React.RefObject<GenericCanvasRef | null>;
  onSelect: (index: number) => void;
  onDelete: (id: string) => void;
  onMovePage: (id: string, direction: 'up' | 'down') => void;
  onDuplicatePage: (id: string) => void;
  onExport: (base64: string) => void;
  onCancel: () => void;
  callbacks: Record<string, (val: unknown) => void>;
  multiPageExport?: {
    pageCount: number;
    onDownloadAllZip: () => Promise<void>;
    isExporting: boolean;
    exportProgress: { current: number; total: number };
  };
  onStateChange: (
    pageId: string,
    state: Record<string, unknown>,
    actions: Record<string, unknown>,
    selectedElement: string | null
  ) => void;
  mobileBridge?: MobileBridgeProps;
  onToolbarStateChange?: (state: ToolbarStateReport) => void;
  /**
   * Per-page collaborative binding. The page Y.Map under which `layers` and
   * `config` are stored. Set on every page in collab mode (one Y.Map per page).
   */
  pageCollaborative?: {
    pageYMap: import('yjs').Map<unknown>;
    isSynced: boolean;
  };
}

/**
 * Memoized page wrapper component (Rule 5.2: enables early returns before computation)
 * Prevents re-rendering all pages when only one changes
 */
const PageWrapper = memo(function PageWrapper({
  page,
  index,
  pageCount,
  config,
  isActive,
  canDelete,
  canvasRef,
  onSelect,
  onDelete,
  onMovePage,
  onDuplicatePage,
  onExport,
  onCancel,
  callbacks,
  multiPageExport,
  onStateChange,
  onToolbarStateChange,
  mobileBridge,
  pageCollaborative,
}: PageWrapperProps) {
  const lastReportedRef = useRef<{
    state: Record<string, unknown> | null;
    actions: Record<string, unknown> | null;
    selectedElement: string | null;
  }>({ state: null, actions: null, selectedElement: null });

  useEffect(() => {
    if (!canvasRef) return undefined;

    const checkRef = () => {
      const ref = canvasRef.current;
      if (ref && isActive) {
        const state = ref.getState?.();
        const actions = ref.getActions?.();
        const selectedElement = ref.getSelectedElement?.() ?? null;
        if (state && actions) {
          const last = lastReportedRef.current;
          if (
            last.state !== state ||
            last.actions !== actions ||
            last.selectedElement !== selectedElement
          ) {
            lastReportedRef.current = { state, actions, selectedElement };
            onStateChange(page.id, state, actions, selectedElement);
          }
        }
      }
    };

    checkRef();

    if (isActive) {
      const interval = setInterval(checkRef, 200);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [canvasRef, isActive, page.id, onStateChange]);

  // Functional setState callback (Rule 5.5: stable callback)
  const handleSelect = useCallback(() => {
    onSelect(index);
  }, [onSelect, index]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(index);
      }
    },
    [onSelect, index]
  );

  return (
    <div
      className={cn(
        'heterogeneous-multipage__page-wrapper group relative cursor-pointer w-fit focus-visible:outline-2 focus-visible:outline-[var(--tanne,#0a2b1e)] focus-visible:outline-offset-1',
        '[&_.zoomable-viewport-wrapper]:w-fit [&_.zoomable-viewport-container]:p-0 [&_.zoomable-viewport-container]:overflow-visible',
        isActive && 'heterogeneous-multipage__page-wrapper--active'
      )}
      onClick={handleSelect}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`Seite ${index + 1}${isActive ? ' (ausgewählt)' : ''}`}
      aria-pressed={isActive}
    >
      <PageToolbar
        pageIndex={index}
        pageCount={pageCount}
        isActive={isActive}
        onMoveUp={() => onMovePage(page.id, 'up')}
        onMoveDown={() => onMovePage(page.id, 'down')}
        onDuplicate={() => onDuplicatePage(page.id)}
        onDelete={canDelete ? () => onDelete(page.id) : undefined}
      />

      <ZoomableViewport
        canvasWidth={config.canvas.width}
        canvasHeight={config.canvas.height}
        defaultZoom="fit"
      >
        <GenericCanvas
          forwardedRef={canvasRef}
          config={config}
          initialProps={page.state}
          onExport={onExport}
          onCancel={onCancel}
          callbacks={callbacks}
          multiPageExport={multiPageExport}
          mobileBridge={mobileBridge}
          onToolbarStateChange={onToolbarStateChange}
          collaborative={pageCollaborative}
        />
      </ZoomableViewport>
    </div>
  );
});

export function CanvasEditor(props: CanvasEditorProps) {
  return (
    <AutoSaveStoreProvider initialShareToken={props.initialShareToken ?? null}>
      <CanvasEditorInner {...props} />
    </AutoSaveStoreProvider>
  );
}

function CanvasEditorInner({
  initialConfigId,
  initialProps,
  onExport,
  onCancel,
  callbacks = {},
  maxPages = 10,
  initialPages,
  mobileBridge,
  externalSidebar = false,
  externalMobileMode = false,
  collaborative,
}: CanvasEditorProps) {
  const autoSaveStoreApi = useAutoSaveStoreApi();
  const isMobileBridge = Boolean(mobileBridge);
  const isExternalSidebar = externalSidebar && !isMobileBridge;

  // Track mobile web viewport (< 900px, not native bridge)
  const [isMobileWeb, setIsMobileWeb] = useState(
    typeof window !== 'undefined' && window.innerWidth < 900 && !isMobileBridge
  );
  useEffect(() => {
    if (isMobileBridge) return;
    const handleResize = () => setIsMobileWeb(window.innerWidth < 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobileBridge]);

  // Mobile web subsection state (for WebSubsectionBar)
  const [mobileWebSubsections, setMobileWebSubsections] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [mobileWebActiveSubsection, setMobileWebActiveSubsection] = useState<string | null>(null);
  const {
    pages,
    addPage,
    duplicateCurrentPage,
    duplicatePage,
    movePage,
    removePage,
    currentPageIndex,
    setCurrentPageIndex,
    canAddMore,
    pageCount,
    getConfigForPage,
    getPageYMap,
  } = usePageManager({
    initialConfigId,
    initialProps,
    maxPages,
    initialPages,
    collaborative,
  });

  // Store loaded configs for rendering
  const [loadedConfigs, setLoadedConfigs] = useState<Map<CanvasConfigId, FullCanvasConfig>>(
    new Map()
  );

  // Sidebar state - ONE shared sidebar for all pages
  // In mobile bridge mode, activeTab is controlled by native via mobileBridge.activeTab
  const [localActiveTab, setLocalActiveTab] = useState<SidebarTabId | null>(null);
  const prevTabRef = useRef<SidebarTabId | null>(null);
  const activeTab = isMobileBridge ? (mobileBridge!.activeTab ?? null) : localActiveTab;
  const setActiveTab = setLocalActiveTab;

  // Active page state/actions/selectedElement - synced via effect from PageWrapper
  const [activePageData, setActivePageData] = useState<{
    pageId: string;
    state: Record<string, unknown>;
    actions: Record<string, unknown>;
    selectedElement: string | null;
  } | null>(null);

  // Toolbar state - reported by active page's GenericCanvas
  const [toolbarState, setToolbarState] = useState<ToolbarStateReport | null>(null);

  // Create refs array for all canvas instances
  const canvasRefsRef = useRef<React.RefObject<GenericCanvasRef | null>[]>([]);

  // Ensure refs array has entries for all pages (synchronous, before render)
  // This must be synchronous to avoid race conditions where refs are accessed
  // during render before useEffect would run
  while (canvasRefsRef.current.length < pages.length) {
    canvasRefsRef.current.push(React.createRef<GenericCanvasRef>());
  }

  const pageCollaborativeAt = useCallback(
    (index: number) => {
      if (!collaborative) return undefined;
      const pageYMap = getPageYMap(index);
      return pageYMap ? { pageYMap, isSynced: collaborative.isSynced } : undefined;
    },
    [collaborative, getPageYMap]
  );

  // Load configs for all pages
  useEffect(() => {
    const loadConfigs = async () => {
      const configIdsToLoad = pages.map((p) => p.configId).filter((id) => !loadedConfigs.has(id));

      if (configIdsToLoad.length === 0) return;

      const newConfigs = new Map(loadedConfigs);
      await Promise.all(
        configIdsToLoad.map(async (configId) => {
          try {
            const config = await getConfigForPage(configId);
            newConfigs.set(configId, config);
          } catch (err) {
            console.error(`Failed to load config for ${configId}:`, err);
          }
        })
      );
      setLoadedConfigs(newConfigs);
    };

    void loadConfigs();
  }, [pages, loadedConfigs, getConfigForPage]);

  // Get stable refs array for the hook
  const canvasRefs = useMemo(() => {
    return canvasRefsRef.current.slice(0, pages.length);
  }, [pages.length]);

  // Detect presentation mode from initial config
  const isPresentationMode = initialConfigId.startsWith('pres-');

  // Multi-page export hook
  const {
    exportAllPages,
    downloadAllAsZip,
    isExporting: isMultiExporting,
    exportProgress,
  } = useMultiPageExport({
    canvasRefs,
    canvasType: isPresentationMode ? 'presentation' : 'heterogeneous',
  });

  // Presentation-specific export (PPTX + PDF)
  const {
    exportAsPptx,
    exportAsPdf,
    isExporting: isPresentationExporting,
    exportProgress: presentationExportProgress,
  } = usePresentationExport(pages, canvasRefs);

  // Stable callback using functional pattern (Rule 5.5)
  const handleExport = useCallback(
    (base64: string) => {
      onExport(base64);
    },
    [onExport]
  );

  // Template selection handler
  const handleAddPage = useCallback(
    async (configId: CanvasConfigId, stateOverrides?: Record<string, unknown>) => {
      await addPage(configId, true, stateOverrides);
    },
    [addPage]
  );

  // Add a slider variant page (cover, content, or last)
  const handleAddSliderVariant = useCallback(
    async (variant: 'cover' | 'content' | 'last') => {
      const overrides: Record<string, unknown> = { slideVariant: variant };
      if (variant === 'last') {
        overrides.headline = '';
        overrides.subtext = '';
        overrides.label = '';
      }
      await addPage('slider' as CanvasConfigId, true, overrides);
    },
    [addPage]
  );

  // Sidebar handlers - functional setState (Rule 5.5)
  const handleTabClick = useCallback((tabId: SidebarTabId) => {
    setActiveTab((current) => (current === tabId ? null : tabId));
  }, []);

  const handlePanelClose = useCallback(() => {
    setActiveTab(null);
  }, []);

  // Page selection handler - functional setState (Rule 5.5)
  const handlePageSelect = useCallback(
    (index: number) => {
      setCurrentPageIndex(index);
    },
    [setCurrentPageIndex]
  );

  // Callback for PageWrapper to report state changes
  const handlePageStateChange = useCallback(
    (
      pageId: string,
      state: Record<string, unknown>,
      actions: Record<string, unknown>,
      selectedElement: string | null
    ) => {
      setActivePageData((prev) => {
        // Only update if data actually changed (shallow compare)
        if (
          prev?.pageId === pageId &&
          prev?.state === state &&
          prev?.actions === actions &&
          prev?.selectedElement === selectedElement
        ) {
          return prev;
        }
        return { pageId, state, actions, selectedElement };
      });
    },
    []
  );

  const handleToolbarStateChange = useCallback((report: ToolbarStateReport) => {
    setToolbarState((prev) => {
      if (
        prev &&
        prev.selectedElement === report.selectedElement &&
        prev.activeFloatingModule === report.activeFloatingModule &&
        prev.canUndo === report.canUndo &&
        prev.canRedo === report.canRedo &&
        prev.canMoveUp === report.canMoveUp &&
        prev.canMoveDown === report.canMoveDown
      ) {
        return prev;
      }
      return report;
    });
  }, []);

  const toolbarHandlers = useMemo(() => {
    const ref = canvasRefsRef.current[currentPageIndex];
    return {
      undo: () => ref?.current?.undo?.(),
      redo: () => ref?.current?.redo?.(),
      handleMoveLayer: (direction: 'up' | 'down') => ref?.current?.handleMoveLayer?.(direction),
      handleColorSelect: (color: string) => ref?.current?.handleColorSelect?.(color),
      handleOpacityChange: (id: string, opacity: number, type: string) =>
        ref?.current?.handleOpacityChange?.(id, opacity, type),
      handleFontSizeChange: (id: string, size: number) =>
        ref?.current?.handleFontSizeChange?.(id, size),
      handleAlign: (direction: AlignmentDirection) => ref?.current?.handleAlign?.(direction),
    };
  }, [currentPageIndex]);

  const handleCaptureCanvas = useCallback(async () => {
    const ref = canvasRefsRef.current[currentPageIndex];
    if (!ref?.current) return null;
    return await ref.current.captureCanvas();
  }, [currentPageIndex]);

  const handleCaptureCanvasForAi = useCallback(async () => {
    const ref = canvasRefsRef.current[currentPageIndex];
    if (!ref?.current) return null;
    return await ref.current.captureCanvasForAi();
  }, [currentPageIndex]);

  const handleDownload = useCallback(
    (format: 'png' | 'jpeg' = 'png', pixelRatio = 2) => {
      const ref = canvasRefsRef.current[currentPageIndex];
      if (!ref?.current) return;
      const dataUrl = ref.current.toDataURL({ format, pixelRatio });
      if (dataUrl) {
        const ext = format === 'jpeg' ? 'jpg' : 'png';
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `gruenerator-seite-${currentPageIndex + 1}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },
    [currentPageIndex]
  );

  // Get active page data for shared sidebar
  const currentPage = pages[currentPageIndex];
  const activeConfig = currentPage ? loadedConfigs.get(currentPage.configId) : undefined;

  // Use synced state/actions/selectedElement from PageWrapper
  const activeState = activePageData?.pageId === currentPage?.id ? activePageData.state : null;
  const activeActions = activePageData?.pageId === currentPage?.id ? activePageData.actions : null;
  const activeSelectedElement =
    activePageData?.pageId === currentPage?.id ? activePageData.selectedElement : null;

  // Compute visible tabs for active config
  const visibleTabs = useMemo(() => {
    if (!activeConfig) return [];
    if (activeConfig.getVisibleTabs && activeState) {
      const visibleIds = activeConfig.getVisibleTabs(activeState, {
        selectedElement: activeSelectedElement,
      });
      return activeConfig.tabs.filter((tab) => visibleIds.includes(tab.id));
    }
    return activeConfig.tabs;
  }, [activeConfig, activeState, activeSelectedElement]);

  // Compute disabled tabs for active config
  const disabledTabs = useMemo(() => {
    if (!activeConfig || !activeState) return [];
    if (activeConfig.getDisabledTabs) {
      return activeConfig.getDisabledTabs(activeState);
    }
    return [];
  }, [activeConfig, activeState]);

  // Auto-switch tabs based on config (e.g., switch to 'settings' when a balken is selected)
  useEffect(() => {
    if (!activeConfig?.getAutoSwitchTab) return;
    const targetTab = activeConfig.getAutoSwitchTab(activeSelectedElement ?? null);
    if (targetTab) {
      setActiveTab((current) => {
        if (current !== targetTab) {
          prevTabRef.current = current;
        }
        return targetTab;
      });
    } else {
      setActiveTab((current) => {
        if (prevTabRef.current !== null && current !== prevTabRef.current) {
          const restored = prevTabRef.current;
          prevTabRef.current = null;
          return restored;
        }
        return current;
      });
    }
  }, [activeSelectedElement, activeConfig]);

  // Mobile bridge: report tab changes to native
  useEffect(() => {
    if (!mobileBridge) return;
    const disabledSet = new Set(disabledTabs);
    mobileBridge.callbacks.onTabsChange(
      visibleTabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        disabled: disabledSet.has(tab.id),
      }))
    );
  }, [mobileBridge, visibleTabs, disabledTabs]);

  useEffect(() => {
    if (!mobileBridge) return;
    mobileBridge.callbacks.onActiveTabChange(activeTab);
  }, [mobileBridge, activeTab]);

  // Clear stale subsections when active tab changes (new section will report its own)
  const prevActiveTabRef = useRef(activeTab);
  useEffect(() => {
    if (prevActiveTabRef.current !== activeTab) {
      prevActiveTabRef.current = activeTab;
      if (mobileBridge) {
        mobileBridge.callbacks.onSubsectionsChange([]);
      }
      if (isMobileWeb) {
        setMobileWebSubsections([]);
        setMobileWebActiveSubsection(null);
      }
      if (isExternalSidebar && externalMobileMode) {
        setMobileWebSubsections([]);
        setMobileWebActiveSubsection(null);
        useCanvasSidebarStore.getState().update({
          mobileSubsections: [],
          activeMobileSubsection: null,
        });
      }
    }
  }, [mobileBridge, isMobileWeb, isExternalSidebar, externalMobileMode, activeTab]);

  // External sidebar store: lifecycle (activate on mount, deactivate on unmount)
  useEffect(() => {
    if (!isExternalSidebar) return;
    useCanvasSidebarStore.getState().activate({
      tabs: visibleTabs,
      activeTab,
      disabledTabs,
      onTabClick: handleTabClick,
    });
    return () => {
      useCanvasSidebarStore.getState().deactivate();
    };
  }, [isExternalSidebar]);

  // External sidebar store: sync tab state + auto-save status on changes
  useEffect(() => {
    if (!isExternalSidebar) return;
    const autoSave = autoSaveStoreApi.getState().autoSaveStatus;
    useCanvasSidebarStore.getState().update({
      tabs: visibleTabs,
      activeTab,
      disabledTabs,
      autoSaveStatus: autoSave,
    });
  }, [isExternalSidebar, visibleTabs, activeTab, disabledTabs, autoSaveStoreApi]);

  // Subscribe to auto-save changes separately (different store)
  useEffect(() => {
    if (!isExternalSidebar) return;
    let prevStatus = autoSaveStoreApi.getState().autoSaveStatus;
    return autoSaveStoreApi.subscribe((state) => {
      if (state.autoSaveStatus !== prevStatus) {
        prevStatus = state.autoSaveStatus;
        useCanvasSidebarStore.getState().update({ autoSaveStatus: state.autoSaveStatus });
      }
    });
  }, [isExternalSidebar, autoSaveStoreApi]);

  // External mobile mode: sync onMobileSubsectionClick callback to store
  useEffect(() => {
    if (!isExternalSidebar || !externalMobileMode) return;
    useCanvasSidebarStore.getState().update({
      onMobileSubsectionClick: setMobileWebActiveSubsection,
    });
  }, [isExternalSidebar, externalMobileMode]);

  // Build subsection bridge context value for MobileSubsectionBridgeContext
  // Active for both native bridge AND mobile web (< 900px)
  const subsectionBridgeValue = useMemo<MobileSubsectionBridgeValue>(() => {
    if (isMobileBridge) {
      return {
        active: true,
        activeSubsection: mobileBridge?.activeSubsection ?? null,
        onSubsectionsChange: mobileBridge?.callbacks.onSubsectionsChange ?? (() => {}),
        onActiveSubsectionChange: mobileBridge?.callbacks.onActiveSubsectionChange ?? (() => {}),
      };
    }
    if (isExternalSidebar && externalMobileMode) {
      return {
        active: true,
        activeSubsection: mobileWebActiveSubsection,
        onSubsectionsChange: (subs: Array<{ id: string; label: string }>) => {
          setMobileWebSubsections(subs);
          useCanvasSidebarStore.getState().update({ mobileSubsections: subs });
        },
        onActiveSubsectionChange: (id: string | null) => {
          setMobileWebActiveSubsection(id);
          useCanvasSidebarStore.getState().update({ activeMobileSubsection: id });
        },
      };
    }
    if (isMobileWeb && !isExternalSidebar) {
      return {
        active: true,
        activeSubsection: mobileWebActiveSubsection,
        onSubsectionsChange: setMobileWebSubsections,
        onActiveSubsectionChange: setMobileWebActiveSubsection,
      };
    }
    return {
      active: false,
      activeSubsection: null,
      onSubsectionsChange: () => {},
      onActiveSubsectionChange: () => {},
    };
  }, [
    isMobileBridge,
    isMobileWeb,
    isExternalSidebar,
    externalMobileMode,
    mobileBridge?.activeSubsection,
    mobileBridge?.callbacks,
    mobileWebActiveSubsection,
  ]);

  // Share all pages via native share (Web Share API with multiple files)
  const shareAllPages = useCallback(async () => {
    const dataUrls = await exportAllPages();
    if (dataUrls.length === 0) return;

    const files = await Promise.all(
      dataUrls.map(async (dataUrl, i) => {
        const blob = await (await fetch(dataUrl)).blob();
        return new File([blob], `gruenerator-seite-${i + 1}.png`, { type: 'image/png' });
      })
    );

    if (navigator.canShare?.({ files })) {
      await navigator.share({ files, title: 'Grünerator Share' });
    } else {
      await navigator.share({ title: 'Grünerator Share' });
    }
  }, [exportAllPages]);

  // Share props for sidebar (used by share section)
  const shareProps = useMemo(
    () => ({
      exportedImage: null,
      autoSaveStatus: 'idle' as const,
      shareToken: null,
      onCaptureCanvas: () => {},
      captureCanvasImage: handleCaptureCanvas,
      captureCanvasImageForAi: handleCaptureCanvasForAi,
      onDownload: async () => {
        const ref = canvasRefsRef.current[currentPageIndex];
        if (ref?.current) {
          const dataUrl = await ref.current.captureCanvas();
          if (dataUrl) {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `gruenerator-slider-seite-${currentPageIndex + 1}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        }
      },
      onNavigateToGallery: () => {},
      pageCount,
      onDownloadAllZip: downloadAllAsZip,
      onShareAllPages: shareAllPages,
      isMultiExporting: isMultiExporting || isPresentationExporting,
      exportProgress: isPresentationExporting
        ? { current: presentationExportProgress.current, total: presentationExportProgress.total }
        : exportProgress,
      onDownloadPptx: isPresentationMode ? exportAsPptx : undefined,
      onDownloadPdf: isPresentationMode ? exportAsPdf : undefined,
    }),
    [
      pageCount,
      downloadAllAsZip,
      shareAllPages,
      isMultiExporting,
      exportProgress,
      currentPageIndex,
      isPresentationMode,
      isPresentationExporting,
      presentationExportProgress,
      exportAsPptx,
      exportAsPdf,
      handleCaptureCanvas,
      handleCaptureCanvasForAi,
    ]
  );

  // Render the active section based on configuration
  const renderActiveSection = useCallback(() => {
    if (!activeTab || !activeConfig || !activeState || !activeActions) {
      return null;
    }

    const sectionConfig = activeConfig.sections[activeTab];
    if (!sectionConfig) return null;

    const SectionComponent = sectionConfig.component;
    const sectionProps = sectionConfig.propsFactory(activeState, activeActions, {
      selectedElement: activeSelectedElement,
      ...shareProps,
    });

    return (
      <Suspense fallback={sidebarLoadingFallback}>
        <SectionComponent {...sectionProps} />
      </Suspense>
    );
  }, [activeTab, activeConfig, activeState, activeActions, shareProps]);

  // Check if all configs are loaded
  const allConfigsLoaded = pages.every((p) => loadedConfigs.has(p.configId));

  // Multi-page export props - for the share section
  const multiPageExportProps = useMemo(
    () => ({
      pageCount,
      onDownloadAllZip: downloadAllAsZip,
      isExporting: isMultiExporting,
      exportProgress,
    }),
    [pageCount, downloadAllAsZip, isMultiExporting, exportProgress]
  );

  // External sidebar: sync panel content to store so web Sidebar can render it.
  // Must be before the early return to satisfy Rules of Hooks.
  useEffect(() => {
    if (!isExternalSidebar) return;
    const panelContentElement =
      activeTab !== null ? (
        <MobileSubsectionBridgeContext.Provider value={subsectionBridgeValue}>
          <Suspense fallback={sidebarLoadingFallback}>{renderActiveSection()}</Suspense>
        </MobileSubsectionBridgeContext.Provider>
      ) : null;
    useCanvasSidebarStore.getState().update({ panelContent: panelContentElement });
  }, [
    isExternalSidebar,
    activeTab,
    activeConfig,
    activeState,
    activeActions,
    activeSelectedElement,
    subsectionBridgeValue,
    renderActiveSection,
  ]);

  // Cleanup panelContent on unmount
  useEffect(() => {
    if (!isExternalSidebar) return;
    return () => {
      useCanvasSidebarStore.getState().update({ panelContent: null });
    };
  }, [isExternalSidebar]);

  const toolbarOnDelete = useMemo(
    () => (pageCount > 1 && currentPage ? () => removePage(currentPage.id) : undefined),
    [pageCount, currentPage?.id, removePage]
  );

  const canvasText = ((activeState as Record<string, unknown> | null)?.headline as string) ?? '';
  const canvasConfigId = pages[currentPageIndex]?.configId ?? '';
  const canvasWidth = activeConfig?.canvas.width ?? 1080;
  const canvasHeight = activeConfig?.canvas.height ?? 1080;

  const noop = useCallback(() => {}, []);
  const toolbarShareProps = useMemo(
    () => ({
      onCaptureCanvas: handleCaptureCanvas,
      onDownload: handleDownload,
      onNavigateToGallery: noop,
      canvasText,
      canvasType: canvasConfigId,
      canvasWidth,
      canvasHeight,
      shareToken: null,
      pageCount,
      onDownloadAllZip: downloadAllAsZip,
      onShareAllPages: shareAllPages,
      isMultiExporting,
      exportProgress,
    }),
    [
      handleCaptureCanvas,
      handleDownload,
      noop,
      canvasText,
      canvasConfigId,
      canvasWidth,
      canvasHeight,
      pageCount,
      downloadAllAsZip,
      shareAllPages,
      isMultiExporting,
      exportProgress,
    ]
  );

  if (!allConfigsLoaded) {
    return pageLoadingIndicator;
  }

  // Build sidebar elements (lazy-loaded to reduce initial bundle)
  // In mobile bridge mode, native handles the tab bar
  // In external sidebar mode, web app sidebar handles the tab bar
  const tabBar =
    isMobileBridge || isExternalSidebar ? null : (
      <Suspense fallback={null}>
        <LazySidebarTabBar
          tabs={visibleTabs}
          activeTab={activeTab}
          onTabClick={handleTabClick}
          disabledTabs={disabledTabs}
        />
      </Suspense>
    );

  // Height of the web subsection bar (matches WebSubsectionBar h-[40px])
  const subsectionBarOffset = isMobileWeb && mobileWebSubsections.length > 0 ? 40 : 0;

  // Internal/mobile mode: render SidebarPanel directly. External mode: panel is rendered by web Sidebar.
  const panel = isExternalSidebar ? null : (
    <MobileSubsectionBridgeContext.Provider value={subsectionBridgeValue}>
      <Suspense fallback={sidebarLoadingFallback}>
        <LazySidebarPanel
          isOpen={activeTab !== null}
          onClose={handlePanelClose}
          bottomOffset={subsectionBarOffset}
        >
          {renderActiveSection()}
        </LazySidebarPanel>
      </Suspense>
    </MobileSubsectionBridgeContext.Provider>
  );

  // Mobile web subsection bar (rendered above the tab bar)
  const webSubsectionBar =
    isMobileWeb && !isExternalSidebar && mobileWebSubsections.length > 0 ? (
      <Suspense fallback={null}>
        <LazyWebSubsectionBar
          subsections={mobileWebSubsections}
          activeSubsection={mobileWebActiveSubsection}
          onSubsectionClick={setMobileWebActiveSubsection}
        />
      </Suspense>
    ) : null;

  const toolbarElement =
    !isMobileBridge && toolbarState ? (
      <Toolbar
        selectedElement={toolbarState.selectedElement}
        activeFloatingModule={toolbarState.activeFloatingModule}
        canUndo={toolbarState.canUndo}
        canRedo={toolbarState.canRedo}
        canMoveUp={toolbarState.canMoveUp}
        canMoveDown={toolbarState.canMoveDown}
        handlers={toolbarHandlers}
        onDelete={toolbarOnDelete}
        shareProps={toolbarShareProps}
      />
    ) : null;

  return (
    <UserUploadsProvider>
      <CanvasEditorLayout
        sidebar={panel}
        tabBar={tabBar}
        actions={null}
        toolbar={toolbarElement}
        hideMobileChrome={isMobileBridge}
        externalSidebar={isExternalSidebar}
        subsectionBar={webSubsectionBar}
      >
        <div className="heterogeneous-multipage__pages-container flex flex-col items-center gap-md p-sm pb-lg w-full max-canvas-mobile:gap-sm max-canvas-mobile:p-xs">
          {pages.map((page, index) => {
            const config = loadedConfigs.get(page.configId);
            if (!config) return null;

            const isActive = index === currentPageIndex;
            const canDelete = pageCount > 1 && index > 0;

            return (
              <PageWrapper
                key={page.id}
                page={page}
                index={index}
                pageCount={pageCount}
                config={config}
                isActive={isActive}
                canDelete={canDelete}
                canvasRef={canvasRefsRef.current[index]}
                onSelect={handlePageSelect}
                onDelete={removePage}
                onMovePage={movePage}
                onDuplicatePage={duplicatePage}
                onExport={handleExport}
                onCancel={onCancel}
                callbacks={callbacks}
                multiPageExport={index === 0 ? multiPageExportProps : undefined}
                onStateChange={handlePageStateChange}
                onToolbarStateChange={isActive ? handleToolbarStateChange : undefined}
                mobileBridge={isActive ? mobileBridge : undefined}
                pageCollaborative={pageCollaborativeAt(index)}
              />
            );
          })}

          {/* Add page button at the end */}
          {canAddMore && (
            <div className="w-full max-w-[28rem] pt-sm max-canvas-mobile:pt-xs max-canvas-mobile:px-xs">
              <AddPageButton
                onSelectTemplate={handleAddPage}
                onDuplicateCurrent={duplicateCurrentPage}
                currentTemplateId={pages[currentPageIndex]?.configId}
                disabled={!canAddMore}
                onAddSliderVariant={
                  pages[0]?.configId === 'slider' ? handleAddSliderVariant : undefined
                }
                templateFilter={isPresentationMode ? 'pres-' : undefined}
              />
            </div>
          )}
        </div>
      </CanvasEditorLayout>
    </UserUploadsProvider>
  );
}

export default CanvasEditor;

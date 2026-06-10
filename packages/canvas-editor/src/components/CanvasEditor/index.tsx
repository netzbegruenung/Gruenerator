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
 *
 * The component is split into:
 * - PageWrapper            — memoized per-page renderer (./PageWrapper)
 * - usePageRefs            — imperative canvas/DOM ref arrays
 * - useLoadedConfigs       — async config cache
 * - useMobileWebViewport   — < 900px viewport tracking
 * - usePageScrollSync      — IntersectionObserver + auto-scroll on add
 * - usePageUndoRedoShortcuts — Cmd/Ctrl+Z page-array history
 * - useToolbarHandlers     — bundled toolbar actions for the active page
 */

import React, { useCallback, useRef, useMemo, useEffect, useState, Suspense } from 'react';

import { Skeleton } from '@gruenerator/ui';

import {
  usePageManager,
  useMultiPageExport,
  usePresentationExport,
  usePageThumbnails,
} from '../../hooks';
import { CanvasEditorLayout } from '../../layouts';
import { MobileSubsectionBridgeContext } from '../../sidebar/MobileSubsectionBridgeContext';
import { UserUploadsProvider } from '../../sidebar/UserUploadsProvider';
import { SidebarTabBar, SidebarPanel, WebSubsectionBar } from '../../sidebar';
import { AutoSaveStoreProvider, useAutoSaveStoreApi } from '../../stores/useAutoSaveStore';
import { useCanvasSidebarStore } from '../../stores/canvasSidebarStore';

import { CanvasMetaBar } from '../CanvasMetaBar';
import { getCategoryForTemplate } from '../../utils/templateRegistry';

import { PageThumbnailStrip } from '../PageThumbnailStrip';
import { Toolbar } from '../Toolbar';
import { AddPageButton } from '../TemplatePickerFlyout';

import { PageWrapper } from './PageWrapper';
import { useMobileWebViewport } from './hooks/useMobileWebViewport';
import { usePageRefs } from './hooks/usePageRefs';
import { useLoadedConfigs } from './hooks/useLoadedConfigs';
import { usePageScrollSync } from './hooks/usePageScrollSync';
import { usePageUndoRedoShortcuts } from './hooks/usePageUndoRedoShortcuts';
import { useToolbarHandlers } from './hooks/useToolbarHandlers';

import type { CanvasEditorProps } from './types';
import type { ToolbarStateReport } from '../GenericCanvas';
import type { CanvasConfigId } from '../../configs/types';
import type { MobileSubsectionBridgeValue } from '../../sidebar/MobileSubsectionBridgeContext';
import type { SidebarTabId } from '../../sidebar/types';

import { cn } from '../../utils/cn';

// Hoisted static JSX elements (Rule 6.3: avoids re-creation every render)
const sidebarLoadingFallback = (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--spacing-small)',
      padding: 'var(--spacing-large)',
      minHeight: '200px',
      width: '100%',
      maxWidth: '20rem',
    }}
  >
    <Skeleton className="h-6 w-3/4 rounded" />
    <Skeleton className="h-20 w-full rounded-lg" />
    <Skeleton className="h-4 w-1/2 rounded" />
    <Skeleton className="h-4 w-2/3 rounded" />
  </div>
);

const pageLoadingIndicator = (
  <div className="flex flex-col w-full items-center justify-center min-h-[400px]">
    <div className="text-sm text-foreground-muted">Lädt Vorlagen...</div>
  </div>
);

export function CanvasEditor(props: CanvasEditorProps) {
  console.log('[AutoSave][CanvasEditor] outer render', {
    initialConfigId: props.initialConfigId,
    initialShareToken: props.initialShareToken ?? null,
    collaborative: !!props.collaborative,
    mobileBridge: !!props.mobileBridge,
  });
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
  chromeLeft,
  chromeCenter,
  chromeRight,
  onInvitePeople,
}: CanvasEditorProps) {
  const autoSaveStoreApi = useAutoSaveStoreApi();
  const isMobileBridge = Boolean(mobileBridge);
  const isExternalSidebar = externalSidebar && !isMobileBridge;

  // Track mobile web viewport (< 900px, not native bridge)
  const isMobileWeb = useMobileWebViewport(isMobileBridge);

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
    undoPageOp,
    redoPageOp,
    canUndoPageOp,
    canRedoPageOp,
  } = usePageManager({
    initialConfigId,
    initialProps,
    maxPages,
    initialPages,
    collaborative,
  });

  // Store loaded configs for rendering
  const loadedConfigs = useLoadedConfigs({ pages, getConfigForPage });

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

  // Imperative canvas + DOM ref arrays (grown synchronously before render)
  const { canvasRefsRef, pageDomRefsRef, pagesContainerRef, ignoreScrollSyncUntilRef, canvasRefs } =
    usePageRefs(pages.length);

  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    pagesContainerRef.current?.style.setProperty('--canvas-zoom', String(zoom));
  }, [zoom, pagesContainerRef]);

  const pageCollaborativeAt = useCallback(
    (index: number) => {
      if (!collaborative) return undefined;
      const pageYMap = getPageYMap(index);
      return pageYMap ? { pageYMap, isSynced: collaborative.isSynced } : undefined;
    },
    [collaborative, getPageYMap]
  );

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
  const handleTabClick = useCallback(
    (tabId: SidebarTabId) => {
      setActiveTab((current) => (current === tabId ? null : tabId));
    },
    [setActiveTab]
  );

  const handlePanelClose = useCallback(() => {
    setActiveTab(null);
  }, [setActiveTab]);

  // Page selection handler - functional setState (Rule 5.5)
  const handlePageSelect = useCallback(
    (index: number) => {
      setCurrentPageIndex(index);
    },
    [setCurrentPageIndex]
  );

  // Thumbnail-strip click: select page AND smooth-scroll its full-size wrapper into view.
  // We briefly suppress IntersectionObserver scroll-driven updates so the destination
  // page stays selected during the smooth-scroll animation.
  const handleThumbnailSelect = useCallback(
    (index: number) => {
      setCurrentPageIndex(index);
      ignoreScrollSyncUntilRef.current = Date.now() + 700;
      pageDomRefsRef.current[index]?.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    },
    [setCurrentPageIndex, ignoreScrollSyncUntilRef, pageDomRefsRef]
  );

  // Track most-visible page as active + auto-scroll to newly added pages
  usePageScrollSync({
    pagesLength: pages.length,
    currentPageIndex,
    setCurrentPageIndex,
    pageDomRefsRef,
    ignoreScrollSyncUntilRef,
  });

  // Capture per-page PNG snapshots for the thumbnail strip
  const pageThumbnails = usePageThumbnails({
    pages,
    canvasRefs: canvasRefsRef.current,
    currentPageIndex,
  });

  // Page-level undo/redo via capture-phase keydown.
  const activePageCanUndo = toolbarState?.canUndo ?? false;
  const activePageCanRedo = toolbarState?.canRedo ?? false;
  usePageUndoRedoShortcuts({
    isMobileBridge,
    activePageCanUndo,
    activePageCanRedo,
    canUndoPageOp,
    canRedoPageOp,
    undoPageOp,
    redoPageOp,
  });

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

  const toolbarHandlers = useToolbarHandlers({
    canvasRefsRef,
    currentPageIndex,
    toolbarState,
    canUndoPageOp,
    canRedoPageOp,
    undoPageOp,
    redoPageOp,
  });

  const handleCaptureCanvas = useCallback(async () => {
    const ref = canvasRefsRef.current[currentPageIndex];
    if (!ref?.current) return null;
    return await ref.current.captureCanvas();
  }, [currentPageIndex, canvasRefsRef]);

  const handleCaptureCanvasForAi = useCallback(async () => {
    const ref = canvasRefsRef.current[currentPageIndex];
    if (!ref?.current) return null;
    return await ref.current.captureCanvasForAi();
  }, [currentPageIndex, canvasRefsRef]);

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
    [currentPageIndex, canvasRefsRef]
  );

  // Get active page data for shared sidebar
  const currentPage = pages[currentPageIndex];
  const activeConfig = currentPage ? loadedConfigs.get(currentPage.configId) : undefined;

  // Use synced state/actions/selectedElement from PageWrapper.
  // Guard on currentPage existing so we don't hit `undefined === undefined`
  // when pages is empty during the first collaborative render.
  const activeData =
    currentPage && activePageData?.pageId === currentPage.id ? activePageData : null;
  const activeState = activeData?.state ?? null;
  const activeActions = activeData?.actions ?? null;
  const activeSelectedElement = activeData?.selectedElement ?? null;

  // Compute visible tabs for active config.
  // Always call getVisibleTabs when defined — gating on `activeState` causes a
  // sticky stale-render after slide switches: the previous slide's PageWrapper
  // callback owns `activePageData`, so `activeState` collapses to null until
  // the new slide re-reports state, falling through to the unfiltered `tabs:`
  // list (which intentionally contains hidden entries like `settings`/
  // `frame-settings` for `getAutoSwitchTab` to target).
  const visibleTabs = useMemo(() => {
    if (!activeConfig) return [];
    if (activeConfig.getVisibleTabs) {
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
  }, [activeSelectedElement, activeConfig, setActiveTab]);

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

  // Reset mobile-web subsection state DURING render when the tab changes — before the
  // new section's SubsectionTabBar mounts and reports. A post-commit effect would run
  // after the child's report/auto-select (child effects fire before parent effects) and
  // clobber them, leaving the panel empty.
  const webSubsectionResetTabRef = useRef(activeTab);
  if (isMobileWeb && !isExternalSidebar && webSubsectionResetTabRef.current !== activeTab) {
    webSubsectionResetTabRef.current = activeTab;
    setMobileWebSubsections([]);
    setMobileWebActiveSubsection(null);
  }

  // Clear stale subsections when active tab changes (new section will report its own).
  // The mobile-web path is handled above during render; native + external stay here
  // because they invoke external callbacks/store updates that can't run during render.
  const prevActiveTabRef = useRef(activeTab);
  useEffect(() => {
    if (prevActiveTabRef.current !== activeTab) {
      prevActiveTabRef.current = activeTab;
      if (mobileBridge) {
        mobileBridge.callbacks.onSubsectionsChange([]);
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
  }, [mobileBridge, isExternalSidebar, externalMobileMode, activeTab]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      canvasRefsRef,
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
  }, [activeTab, activeConfig, activeState, activeActions, activeSelectedElement, shareProps]);

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
    [pageCount, currentPage, removePage]
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
      onInvitePeople,
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
      onInvitePeople,
    ]
  );

  if (!allConfigsLoaded) {
    return pageLoadingIndicator;
  }

  // Build sidebar elements (static within the already-async editor chunk)
  // In mobile bridge mode, native handles the tab bar
  // In external sidebar mode, web app sidebar handles the tab bar
  const tabBar =
    isMobileBridge || isExternalSidebar ? null : (
      <Suspense fallback={null}>
        <SidebarTabBar
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
        <SidebarPanel
          isOpen={activeTab !== null}
          onClose={handlePanelClose}
          bottomOffset={subsectionBarOffset}
        >
          {renderActiveSection()}
        </SidebarPanel>
      </Suspense>
    </MobileSubsectionBridgeContext.Provider>
  );

  // Mobile web subsection bar (rendered above the tab bar)
  const webSubsectionBar =
    isMobileWeb && !isExternalSidebar && mobileWebSubsections.length > 0 ? (
      <Suspense fallback={null}>
        <WebSubsectionBar
          subsections={mobileWebSubsections}
          activeSubsection={mobileWebActiveSubsection}
          onSubsectionClick={setMobileWebActiveSubsection}
        />
      </Suspense>
    ) : null;

  // Render the toolbar whenever there is something to put in it — either the
  // canvas has reported edit state (toolbarState) or the host has supplied
  // chrome slots (title, sync indicator, presence). This keeps host chrome
  // visible during the pre-sync "Synchronisiere..." phase in collab mode,
  // when toolbarState is still null.
  const showToolbar =
    !isMobileBridge && (toolbarState !== null || chromeLeft || chromeCenter || chromeRight);
  const toolbarElement = showToolbar ? (
    <Toolbar
      selectedElement={toolbarState?.selectedElement ?? null}
      activeFloatingModule={toolbarState?.activeFloatingModule ?? null}
      canUndo={(toolbarState?.canUndo ?? false) || canUndoPageOp}
      canRedo={(toolbarState?.canRedo ?? false) || canRedoPageOp}
      canMoveUp={toolbarState?.canMoveUp ?? false}
      canMoveDown={toolbarState?.canMoveDown ?? false}
      handlers={toolbarHandlers}
      onDelete={toolbarState ? toolbarOnDelete : undefined}
      shareProps={toolbarState ? toolbarShareProps : undefined}
      chromeLeft={chromeLeft}
      chromeCenter={chromeCenter}
      chromeRight={chromeRight}
    />
  ) : null;

  const showPageNavigator = !isMobileBridge && pages.length > 1;
  const currentTemplateId = pages[currentPageIndex]?.configId;
  const sliderVariantHandler = pages[0]?.configId === 'slider' ? handleAddSliderVariant : undefined;
  // Restrict the template picker to the same category as the current template
  // (sharepic, slider, presentation, plakat, profilbild) so e.g. a Zitat page
  // can't insert a presentation slide.
  const categoryFilter = currentTemplateId ? getCategoryForTemplate(currentTemplateId) : undefined;

  const bottomBar = showPageNavigator ? (
    <div className="canvas-bottom-bar flex items-stretch bg-white/85 dark:bg-[rgba(20,20,20,0.78)] backdrop-blur-[12px] border-t border-black/[0.06] dark:border-white/[0.08]">
      <div className="flex-1 min-w-0">
        <PageThumbnailStrip
          pages={pages}
          currentPageIndex={currentPageIndex}
          thumbnails={pageThumbnails}
          loadedConfigs={loadedConfigs}
          currentTemplateId={currentTemplateId}
          canAddMore={canAddMore}
          onSelect={handleThumbnailSelect}
          onAddPage={handleAddPage}
          onDuplicateCurrent={duplicateCurrentPage}
          onAddSliderVariant={sliderVariantHandler}
          templateFilter={categoryFilter}
        />
      </div>
      <div className="shrink-0 flex items-center border-l border-black/[0.06] dark:border-white/[0.08]">
        <CanvasMetaBar
          pageCount={pageCount}
          currentPageIndex={currentPageIndex}
          zoom={zoom}
          onZoomChange={setZoom}
        />
      </div>
    </div>
  ) : null;

  return (
    <UserUploadsProvider>
      <CanvasEditorLayout
        sidebar={panel}
        tabBar={tabBar}
        actions={null}
        toolbar={toolbarElement}
        bottomBar={bottomBar}
        hideMobileChrome={isMobileBridge}
        externalSidebar={isExternalSidebar}
        subsectionBar={webSubsectionBar}
      >
        <div
          ref={pagesContainerRef}
          className={cn(
            'heterogeneous-multipage__pages-container flex flex-col items-center gap-md p-sm pb-lg w-full max-canvas-mobile:gap-sm max-canvas-mobile:p-xs',
            showPageNavigator && 'has-page-navigator'
          )}
        >
          {pages.map((page, index) => {
            const config = loadedConfigs.get(page.configId);
            if (!config) return null;

            const isActive = index === currentPageIndex;
            const canDelete = pageCount > 1;

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
                pageRef={pageDomRefsRef.current[index]}
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

          {/* Tail AddPageButton — only when no strip is shown (single page or mobile bridge) */}
          {canAddMore && !showPageNavigator && (
            <div className="w-full max-w-[28rem] pt-sm max-canvas-mobile:pt-xs max-canvas-mobile:px-xs">
              <AddPageButton
                onSelectTemplate={handleAddPage}
                onDuplicateCurrent={duplicateCurrentPage}
                currentTemplateId={currentTemplateId}
                disabled={!canAddMore}
                onAddSliderVariant={sliderVariantHandler}
                templateFilter={categoryFilter}
              />
            </div>
          )}
        </div>
      </CanvasEditorLayout>
    </UserUploadsProvider>
  );
}

export type { CanvasEditorProps, PageWrapperProps } from './types';

export default CanvasEditor;

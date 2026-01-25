/**
 * HeterogeneousMultiPage - Multi-page canvas that supports different templates per page
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
} from 'react';

import Spinner from '../../../../components/common/Spinner';
import { useHeterogeneousMultiPage, useMultiPageExport } from '../hooks';
import { CanvasEditorLayout } from '../layouts';
import { SidebarTabBar, SidebarPanel } from '../sidebar';

import { GenericCanvas } from './GenericCanvas';
import { AddPageButton } from './TemplatePickerFlyout';
import { ZoomableViewport } from './ZoomableViewport';

import type { GenericCanvasRef } from './GenericCanvas';
import type { CanvasConfigId, FullCanvasConfig } from '../configs/types';
import type { SidebarTabId } from '../sidebar/types';

import './ConfigMultiPage.css';
import './HeterogeneousMultiPage.css';

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
  <div className="config-multipage config-multipage--loading">
    <div className="config-multipage__loader">Lädt Vorlagen...</div>
  </div>
);

interface HeterogeneousMultiPageProps {
  initialConfigId: CanvasConfigId;
  initialProps: Record<string, unknown>;
  onExport: (base64: string) => void;
  onCancel: () => void;
  callbacks?: Record<string, (val: unknown) => void>;
  maxPages?: number;
}

interface PageWrapperProps {
  page: { id: string; configId: CanvasConfigId; state: Record<string, unknown> };
  index: number;
  config: FullCanvasConfig;
  isActive: boolean;
  canDelete: boolean;
  canvasRef: React.RefObject<GenericCanvasRef | null>;
  onSelect: (index: number) => void;
  onDelete: (id: string) => void;
  onExport: (base64: string) => void;
  onCancel: () => void;
  callbacks: Record<string, (val: unknown) => void>;
  multiPageExport?: {
    pageCount: number;
    onDownloadAllZip: () => Promise<void>;
    isExporting: boolean;
    exportProgress: { current: number; total: number };
  };
  onStateChange: (pageId: string, state: Record<string, unknown>, actions: Record<string, unknown>) => void;
}

/**
 * Memoized page wrapper component (Rule 5.2: enables early returns before computation)
 * Prevents re-rendering all pages when only one changes
 */
const PageWrapper = memo(function PageWrapper({
  page,
  index,
  config,
  isActive,
  canDelete,
  canvasRef,
  onSelect,
  onDelete,
  onExport,
  onCancel,
  callbacks,
  multiPageExport,
  onStateChange,
}: PageWrapperProps) {
  // Report state/actions to parent when ref is ready or changes
  // This uses an effect to properly sync state up to the parent
  useEffect(() => {
    // Guard: canvasRef might be undefined during initialization
    if (!canvasRef) return;

    const checkRef = () => {
      const ref = canvasRef.current;
      if (ref && isActive) {
        const state = ref.getState?.();
        const actions = ref.getActions?.();
        if (state && actions) {
          onStateChange(page.id, state, actions);
        }
      }
    };

    // Check immediately
    checkRef();

    // Re-check periodically while active (handles canvas state updates)
    if (isActive) {
      const interval = setInterval(checkRef, 100);
      return () => clearInterval(interval);
    }
  }, [canvasRef, isActive, page.id, onStateChange]);

  // Functional setState callback (Rule 5.5: stable callback)
  const handleSelect = useCallback(() => {
    onSelect(index);
  }, [onSelect, index]);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(page.id);
    },
    [onDelete, page.id]
  );

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
      className={`heterogeneous-multipage__page-wrapper ${isActive ? 'heterogeneous-multipage__page-wrapper--active' : ''}`}
      onClick={handleSelect}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`Seite ${index + 1}${isActive ? ' (ausgewählt)' : ''}`}
      aria-pressed={isActive}
    >
      {/* Delete button (except first page) */}
      {canDelete && (
        <button
          className="heterogeneous-multipage__delete-btn"
          onClick={handleDelete}
          type="button"
          aria-label={`Seite ${index + 1} löschen`}
        >
          ×
        </button>
      )}

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
          bare={true}
          multiPageExport={multiPageExport}
        />
      </ZoomableViewport>
    </div>
  );
});

export function HeterogeneousMultiPage({
  initialConfigId,
  initialProps,
  onExport,
  onCancel,
  callbacks = {},
  maxPages = 10,
}: HeterogeneousMultiPageProps) {
  const {
    pages,
    addPage,
    duplicateCurrentPage,
    removePage,
    currentPageIndex,
    setCurrentPageIndex,
    canAddMore,
    pageCount,
    getConfigForPage,
  } = useHeterogeneousMultiPage({
    initialConfigId,
    initialProps,
    maxPages,
  });

  // Store loaded configs for rendering
  const [loadedConfigs, setLoadedConfigs] = useState<Map<CanvasConfigId, FullCanvasConfig>>(
    new Map()
  );

  // Sidebar state - ONE shared sidebar for all pages
  const [activeTab, setActiveTab] = useState<SidebarTabId | null>('text');

  // Active page state/actions - synced via effect from PageWrapper
  const [activePageData, setActivePageData] = useState<{
    pageId: string;
    state: Record<string, unknown>;
    actions: Record<string, unknown>;
  } | null>(null);

  // Create refs array for all canvas instances
  const canvasRefsRef = useRef<React.RefObject<GenericCanvasRef | null>[]>([]);

  // Ensure refs array has entries for all pages (synchronous, before render)
  // This must be synchronous to avoid race conditions where refs are accessed
  // during render before useEffect would run
  while (canvasRefsRef.current.length < pages.length) {
    canvasRefsRef.current.push(React.createRef<GenericCanvasRef>());
  }

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

  // Multi-page export hook
  const {
    downloadAllAsZip,
    isExporting: isMultiExporting,
    exportProgress,
  } = useMultiPageExport({
    canvasRefs,
    canvasType: 'heterogeneous',
  });

  // Stable callback using functional pattern (Rule 5.5)
  const handleExport = useCallback(
    (base64: string) => {
      onExport(base64);
    },
    [onExport]
  );

  // Template selection handler
  const handleAddPage = useCallback(
    async (configId: CanvasConfigId) => {
      await addPage(configId, true);
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
    (pageId: string, state: Record<string, unknown>, actions: Record<string, unknown>) => {
      setActivePageData((prev) => {
        // Only update if data actually changed (shallow compare)
        if (prev?.pageId === pageId && prev?.state === state && prev?.actions === actions) {
          return prev;
        }
        return { pageId, state, actions };
      });
    },
    []
  );

  // Get active page data for shared sidebar
  const currentPage = pages[currentPageIndex];
  const activeConfig = currentPage ? loadedConfigs.get(currentPage.configId) : undefined;

  // Use synced state/actions from PageWrapper
  const activeState = activePageData?.pageId === currentPage?.id ? activePageData.state : null;
  const activeActions = activePageData?.pageId === currentPage?.id ? activePageData.actions : null;

  // Compute visible tabs for active config
  const visibleTabs = useMemo(() => {
    if (!activeConfig) return [];
    if (activeConfig.getVisibleTabs && activeState) {
      const visibleIds = activeConfig.getVisibleTabs(activeState);
      return activeConfig.tabs.filter((tab) => visibleIds.includes(tab.id));
    }
    return activeConfig.tabs;
  }, [activeConfig, activeState]);

  // Compute disabled tabs for active config
  const disabledTabs = useMemo(() => {
    if (!activeConfig || !activeState) return [];
    if (activeConfig.getDisabledTabs) {
      return activeConfig.getDisabledTabs(activeState);
    }
    return [];
  }, [activeConfig, activeState]);

  // Share props for sidebar (used by share section)
  const shareProps = useMemo(
    () => ({
      exportedImage: null,
      autoSaveStatus: 'idle' as const,
      shareToken: null,
      onCaptureCanvas: () => {},
      onDownload: () => {},
      onNavigateToGallery: () => {},
      pageCount,
      onDownloadAllZip: downloadAllAsZip,
      isMultiExporting,
      exportProgress,
    }),
    [pageCount, downloadAllAsZip, isMultiExporting, exportProgress]
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
      selectedElement: null,
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

  if (!allConfigsLoaded) {
    return pageLoadingIndicator;
  }

  // Build sidebar elements
  const tabBar = (
    <SidebarTabBar
      tabs={visibleTabs}
      activeTab={activeTab}
      onTabClick={handleTabClick}
      disabledTabs={disabledTabs}
    />
  );

  const panel = (
    <SidebarPanel isOpen={activeTab !== null} onClose={handlePanelClose}>
      {renderActiveSection()}
    </SidebarPanel>
  );

  return (
    <CanvasEditorLayout sidebar={panel} tabBar={tabBar} actions={null}>
      <div className="heterogeneous-multipage__pages-container">
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
              config={config}
              isActive={isActive}
              canDelete={canDelete}
              canvasRef={canvasRefsRef.current[index]}
              onSelect={handlePageSelect}
              onDelete={removePage}
              onExport={handleExport}
              onCancel={onCancel}
              callbacks={callbacks}
              multiPageExport={index === 0 ? multiPageExportProps : undefined}
              onStateChange={handlePageStateChange}
            />
          );
        })}

        {/* Add page button at the end */}
        {canAddMore && (
          <div className="heterogeneous-multipage__add-page">
            <AddPageButton
              onSelectTemplate={handleAddPage}
              onDuplicateCurrent={duplicateCurrentPage}
              currentTemplateId={pages[currentPageIndex]?.configId}
              disabled={!canAddMore}
            />
          </div>
        )}
      </div>
    </CanvasEditorLayout>
  );
}

export default HeterogeneousMultiPage;

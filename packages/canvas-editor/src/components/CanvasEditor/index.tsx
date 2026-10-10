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
 * - useMobileSheetFit      — mobile: fit the active page above the open sheet
 * - useScrollToAddedPage   — auto-scroll to a newly added page
 * - usePageUndoRedoShortcuts — Cmd/Ctrl+Z page-array history
 * - useToolbarHandlers     — bundled toolbar actions for the active page
 */

import { downloadDataUrl } from '@gruenerator/shared';
import { Skeleton } from '@gruenerator/ui';
import Konva from 'konva';
import React, {
  useCallback,
  useRef,
  useMemo,
  useEffect,
  useState,
  Suspense,
  startTransition,
} from 'react';

import { PAGE_PERSISTED_STATE_KEYS } from '../../collab/pageElementStateKeys';
import { createPageSyncedCallbacks } from '../../collab/wrapCallbacksWithPageSync';
import { getCanvasFormatOrDefault } from '../../formats';
import { usePageManager, useMultiPageExport, usePageThumbnails } from '../../hooks';
import { useDeckAutoSave } from '../../hooks/useDeckAutoSave';
import { useIsCanvasMobile } from '../../hooks/useIsCanvasMobile';
import { useZoomGestures } from '../../hooks/useZoomGestures';
import { HOST_CALLBACK_KEYS } from '../../hostCallbackKeys';
import { CanvasEditorLayout } from '../../layouts';
import { SidebarTabBar, SidebarPanel } from '../../sidebar';
import { UserUploadsProvider } from '../../sidebar/UserUploadsProvider';
import { AutoSaveStoreProvider } from '../../stores/useAutoSaveStore';
import { cn } from '../../utils/cn';
import { ensureFontsReady } from '../../utils/ensureFontsReady';
import { getCategoryForTemplate } from '../../utils/templateRegistry';
import { CanvasPageSkeleton, CanvasTabRailSkeleton } from '../CanvasEditorSkeleton';
import { CanvasMetaBar } from '../CanvasMetaBar';
import { CanvasTextEditorProvider } from '../CanvasTextOverlay';
import { MobileSelectionPill } from '../MobileSelectionPill';
import { PageThumbnailStrip } from '../PageThumbnailStrip';
import { AddPageButton, TemplatePickerFlyout } from '../TemplatePickerFlyout';
import { Toolbar } from '../Toolbar';
import { ContextToolbar } from '../TopBar/ContextToolbar';
import { MobileSelectionBar } from '../TopBar/MobileSelectionBar';
import { MobileSelectionControls } from '../TopBar/MobileSelectionControls';

import { autoSwitchTab } from './autoSwitchTab';
import { useLoadedConfigs } from './hooks/useLoadedConfigs';
import { useMobileSheetFit } from './hooks/useMobileSheetFit';
import { usePageRefs } from './hooks/usePageRefs';
import { usePageUndoRedoShortcuts } from './hooks/usePageUndoRedoShortcuts';
import { useScrollToAddedPage } from './hooks/useScrollToAddedPage';
import { useToolbarHandlers } from './hooks/useToolbarHandlers';
import { getMobileSelectionArea } from './mobileSelectionArea';
import { PageWrapper } from './PageWrapper';

import type { CanvasEditorProps, PageWrapperProps } from './types';
import type { CanvasSpecEditBridge } from '../../CanvasEditorProvider';
import type { CanvasConfigId } from '../../configs/types';
import type { SidebarTabId } from '../../sidebar/types';
import type { ToolbarStateReport } from '../GenericCanvas';
import type { ExportOptions } from '@gruenerator/shared/canvas-editor';

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

export function CanvasEditor(props: CanvasEditorProps) {
  return (
    <AutoSaveStoreProvider initialShareToken={props.initialShareToken ?? null}>
      <CanvasEditorInner {...props} />
    </AutoSaveStoreProvider>
  );
}

function CanvasEditorInner({
  initialConfigId,
  formatId,
  initialProps,
  onExport,
  onCancel,
  onDownload,
  callbacks = {},
  maxPages = 10,
  initialPages,
  collaborative,
  chromeLeft,
  chromeCenter,
  chromeRight,
  onInvitePeople,
  onSaveAsTemplate,
  onCollabSnapshot,
  onAutoSaveShareToken,
  initialTab = null,
  onActiveTabChange,
}: CanvasEditorProps) {
  // Note: onAutoSaveShareToken is threaded down to useCanvasAutoSave (via
  // PageWrapper → GenericCanvas) instead of a store subscription here — a
  // subscription dies with the unmount, losing tokens that resolve after the
  // editor closes (flush save, in-flight save) and re-creating duplicates.
  const isMobileWeb = useIsCanvasMobile();
  const {
    pages,
    addPage,
    duplicateCurrentPage,
    duplicatePage,
    movePage,
    removePage,
    setPageConfig,
    currentPageIndex,
    setCurrentPageIndex,
    canAddMore,
    pageCount,
    getConfigForPage,
    getPageYMap,
    updatePageState,
    pagesDoc,
    undoPageOp,
    redoPageOp,
    replaceDeck,
    canUndoPageOp,
    canRedoPageOp,
    isPreview,
  } = usePageManager({
    initialConfigId,
    formatId,
    initialProps,
    maxPages,
    initialPages,
    collaborative,
  });

  // Store loaded configs for rendering
  const loadedConfigs = useLoadedConfigs({ pages, getConfigForPage });

  // Template-field callbacks dual-write into the page's `state` map so other
  // clients (useYjsPageStateSync), page duplication and reloads see the
  // edits. Wrappers are identity-stable per page id and resolve the host
  // callbacks + writer at call time — the host rebuilds its callbacks object
  // every render, and memoizing on it would re-render every PageWrapper per
  // keystroke.
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const updatePageStateRef = useRef(updatePageState);
  updatePageStateRef.current = updatePageState;
  // The host declares text-field callbacks for its own canvas type only; a
  // page of another template (added, converted, or inserted by the creator)
  // gets its own fields' writers minted from its configId.
  const pageCallbacksCacheRef = useRef(
    new Map<string, { configId: CanvasConfigId; wrapped: Record<string, (val: unknown) => void> }>()
  );
  const getCallbacksForPage = useCallback((pageId: string, configId: CanvasConfigId) => {
    const cache = pageCallbacksCacheRef.current;
    const cached = cache.get(pageId);
    if (cached?.configId === configId) return cached.wrapped;
    const wrapped = createPageSyncedCallbacks(
      () => callbacksRef.current,
      (partial) => updatePageStateRef.current(pageId, partial),
      [...HOST_CALLBACK_KEYS[configId], ...PAGE_PERSISTED_STATE_KEYS]
    );
    cache.set(pageId, { configId, wrapped });
    return wrapped;
  }, []);
  useEffect(() => {
    const ids = new Set(pages.map((p) => p.id));
    for (const id of pageCallbacksCacheRef.current.keys()) {
      if (!ids.has(id)) pageCallbacksCacheRef.current.delete(id);
    }
  }, [pages]);

  // Sidebar state - ONE shared sidebar for all pages
  // Desktop only: on mobile an open tab is a bottom sheet over the canvas, so
  // a remembered tab is neither restored nor reported (which would also
  // overwrite the desktop's remembered tab).
  const [activeTab, setActiveTab] = useState<SidebarTabId | null>(isMobileWeb ? null : initialTab);
  const prevTabRef = useRef<SidebarTabId | null>(null);
  useEffect(() => {
    if (!isMobileWeb) onActiveTabChange?.(activeTab);
  }, [activeTab, onActiveTabChange, isMobileWeb]);

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
  const { canvasRefsRef, pageDomRefsRef, pagesContainerRef, canvasRefs } = usePageRefs(
    pages.length
  );

  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    pagesContainerRef.current?.style.setProperty('--canvas-zoom', String(zoom));
  }, [zoom, pagesContainerRef]);

  // Pinch and ctrl/cmd+wheel drive the same zoom as the CanvasMetaBar buttons.
  // The container mounts after the loading state, so the hook gets it as state.
  const [pagesContainer, setPagesContainer] = useState<HTMLDivElement | null>(null);
  const pagesContainerCallbackRef = useCallback(
    (el: HTMLDivElement | null) => {
      pagesContainerRef.current = el;
      setPagesContainer(el);
    },
    [pagesContainerRef]
  );
  useZoomGestures(pagesContainer, setZoom);

  // Every page binds its config to its page Y.Map — in collab mode
  // that syncs to peers, in local mode it makes duplicate/move/undo carry
  // the full page content (the Y.Doc is the single source of truth).
  // Bindings are identity-cached per page: a fresh object per render would
  // defeat PageWrapper's memo for the whole deck on every parent render.
  const pageBindingCacheRef = useRef(
    new Map<string, NonNullable<PageWrapperProps['pageBinding']>>()
  );
  const pageBindingAt = useCallback(
    (index: number, pageId: string, isActivePage: boolean) => {
      const pageYMap = getPageYMap(index);
      if (!pageYMap) return undefined;
      const publishSelection = collaborative ? isActivePage : false;
      const isSynced = collaborative ? collaborative.isSynced : true;
      const provider = collaborative?.provider ?? null;
      const cache = pageBindingCacheRef.current;
      const cached = cache.get(pageId);
      if (
        cached &&
        cached.pageYMap === pageYMap &&
        cached.isSynced === isSynced &&
        cached.provider === provider &&
        cached.publishSelection === publishSelection
      ) {
        return cached;
      }
      const next = { pageYMap, isSynced, provider, pageId, publishSelection };
      cache.set(pageId, next);
      return next;
    },
    [collaborative, getPageYMap]
  );

  // Multi-page export hook
  const {
    exportAllPages,
    downloadAllAsZip,
    isExporting: isMultiExporting,
    exportProgress,
    error: multiExportError,
  } = useMultiPageExport({
    canvasRefs,
    canvasType: 'sharepic',
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
    async (configId: CanvasConfigId, stateOverrides?: Record<string, unknown>) => {
      await addPage(configId, true, stateOverrides);
    },
    [addPage]
  );

  // Add a slider variant page (cover, content, or last) in the deck's own brand
  const sliderConfigId = pages[0]?.configId;
  const handleAddSliderVariant = useCallback(
    async (variant: 'cover' | 'content' | 'last') => {
      const overrides: Record<string, unknown> = { slideVariant: variant };
      if (variant === 'last') {
        overrides.headline = '';
        overrides.subtext = '';
        overrides.label = '';
      }
      await addPage(sliderConfigId === 'slider-at' ? 'slider-at' : 'slider', true, overrides);
    },
    [addPage, sliderConfigId]
  );

  // "Vorlage ändern" — convert an existing page to another template.
  const [templateChangePageId, setTemplateChangePageId] = useState<string | null>(null);
  const handleOpenTemplateChange = useCallback((pageId: string) => {
    setTemplateChangePageId(pageId);
  }, []);
  const handleCloseTemplateChange = useCallback(() => {
    setTemplateChangePageId(null);
  }, []);
  const handleSelectTemplateChange = useCallback(
    (configId: CanvasConfigId) => {
      if (templateChangePageId) void setPageConfig(templateChangePageId, configId);
      setTemplateChangePageId(null);
    },
    [templateChangePageId, setPageConfig]
  );
  const templateChangePage = useMemo(() => {
    if (templateChangePageId === null) return null;
    const index = pages.findIndex((p) => p.id === templateChangePageId);
    return index >= 0 ? { index, configId: pages[index].configId } : null;
  }, [templateChangePageId, pages]);

  // Sidebar handlers - functional setState (Rule 5.5)
  const handleTabClick = useCallback(
    (tabId: SidebarTabId) => {
      setActiveTab((current) => (current === tabId ? null : tabId));
    },
    [setActiveTab]
  );

  // Mobile: closing the sheet keeps the selection — its controls live in the
  // bottom selection bar, which comes back once the sheet is gone.
  const handlePanelClose = useCallback(() => {
    prevTabRef.current = null;
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
  const handleThumbnailSelect = useCallback(
    (index: number) => {
      setCurrentPageIndex(index);
      pageDomRefsRef.current[index]?.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    },
    [setCurrentPageIndex, pageDomRefsRef]
  );

  useScrollToAddedPage({
    pagesLength: pages.length,
    currentPageIndex,
    pageDomRefsRef,
  });

  // Capture per-page PNG snapshots for the thumbnail strip
  const pageThumbnails = usePageThumbnails({
    pages,
    canvasRefs: canvasRefsRef.current,
  });

  // Page-level undo/redo via capture-phase keydown.
  const activePageCanUndo = toolbarState?.canUndo ?? false;
  const activePageCanRedo = toolbarState?.canRedo ?? false;
  usePageUndoRedoShortcuts({
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
      // Transitions: the canvas paints the selection/edit first; the editor
      // shell (sidebar, context bar) follows without blocking that frame.
      startTransition(() =>
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
        })
      );
    },
    []
  );

  const handleToolbarStateChange = useCallback((report: ToolbarStateReport) => {
    startTransition(() =>
      setToolbarState((prev) => {
        if (
          prev &&
          prev.selectedElement === report.selectedElement &&
          prev.activeFloatingModule === report.activeFloatingModule &&
          prev.canUndo === report.canUndo &&
          prev.canRedo === report.canRedo &&
          prev.canMoveUp === report.canMoveUp &&
          prev.canMoveDown === report.canMoveDown &&
          prev.canDuplicate === report.canDuplicate &&
          prev.canDelete === report.canDelete
        ) {
          return prev;
        }
        return report;
      })
    );
  }, []);

  // Live reads for the chat's spec path; stable identity so the section's
  // memoized adapter is not rebuilt on every page change. Latest-ref pattern
  // like callbacksRef: the bridge reads it at call time, never during render.
  const specEditRef = useRef({
    pages,
    activePageId: pages[currentPageIndex]?.id ?? null,
    replaceDeck,
  });
  // eslint-disable-next-line react-hooks/refs -- latest-ref write, read only by the bridge's handlers
  specEditRef.current = { pages, activePageId: pages[currentPageIndex]?.id ?? null, replaceDeck };
  const hasReplaceDeck = replaceDeck !== null;
  const specEdit = useMemo<CanvasSpecEditBridge | null>(
    () =>
      hasReplaceDeck
        ? {
            getPages: () => specEditRef.current.pages,
            getActivePageId: () => specEditRef.current.activePageId,
            replaceDeck: (ops) => specEditRef.current.replaceDeck?.(ops) ?? [],
          }
        : null,
    [hasReplaceDeck]
  );

  const toolbarHandlers = useToolbarHandlers({
    canvasRefsRef,
    currentPageIndex,
    toolbarState,
    canUndoPageOp,
    canRedoPageOp,
    undoPageOp,
    redoPageOp,
  });

  const handleCaptureCanvas = useCallback(
    async (options?: Partial<ExportOptions>) => {
      const ref = canvasRefsRef.current[currentPageIndex];
      if (!ref?.current) return null;
      return await ref.current.captureCanvas(options);
    },
    [currentPageIndex, canvasRefsRef]
  );

  const handleCaptureCanvasForAi = useCallback(async () => {
    const ref = canvasRefsRef.current[currentPageIndex];
    if (!ref?.current) return null;
    return await ref.current.captureCanvasForAi();
  }, [currentPageIndex, canvasRefsRef]);

  // Every page, not just the active one: a selection left behind on page 2
  // keeps its context bar alive after the user scrolls away.
  const handleDeselectAll = useCallback(() => {
    canvasRefsRef.current.forEach((ref) => ref.current?.deselect());
  }, [canvasRefsRef]);

  // Mobile selection pill: reads the active page's selection geometry.
  const getSelectionBox = useCallback(
    () => canvasRefsRef.current[currentPageIndex]?.current?.getSelectionBox?.() ?? null,
    [canvasRefsRef, currentPageIndex]
  );
  const subscribeManipulation = useCallback(
    (listener: (active: boolean) => void) =>
      canvasRefsRef.current[currentPageIndex]?.current?.subscribeManipulation?.(listener) ??
      (() => {}),
    [canvasRefsRef, currentPageIndex]
  );

  // The grey work area around the artboard is the natural "click out" target,
  // and until now nothing happened there: the Konva stage is sized exactly to
  // the artboard, and templates cover it with a full-bleed, listening
  // background image, so the stage's own deselect (useCanvasInteractions) never
  // fires. The guard keeps clicks that bubble up from a page from deselecting.
  const handleWorkAreaPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) handleDeselectAll();
    },
    [handleDeselectAll]
  );

  // The ONLY gallery autosave in this editor, for any page count — a
  // single-page doc is a one-page deck. Per-page useCanvasAutoSave is
  // disabled below (autoSave={false}); its legacy per-type metadata shape
  // stays read-only for old drafts.
  const captureFirstPage = useCallback(async () => {
    const ref = canvasRefsRef.current[0];
    return ref?.current ? await ref.current.captureCanvas() : null;
  }, [canvasRefsRef]);
  useDeckAutoSave({
    ydoc: pagesDoc,
    enabled: !collaborative,
    deckType: pages[0]?.configId ?? initialConfigId,
    captureImage: captureFirstPage,
    onShareToken: onAutoSaveShareToken,
  });

  // Collab mode has no shared_media autosave, so the host's document thumbnail
  // only refreshed on download — edits persisted via Yjs but the gallery card
  // kept showing the old state. Capture after local edits settle (and on tab
  // hide) and hand the render to the host. Refs keep the ydoc listener stable
  // across page switches.
  const snapshotFnsRef = useRef({ capture: handleCaptureCanvas, notify: onCollabSnapshot });
  snapshotFnsRef.current = { capture: handleCaptureCanvas, notify: onCollabSnapshot };
  const collabYdoc = collaborative?.ydoc;
  useEffect(() => {
    if (!collabYdoc || !snapshotFnsRef.current.notify) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSent: string | null = null;

    // The gallery card shows the snapshot at ≤180 px, so a 540 px render
    // (pixelRatio 0.5) is plenty even on retina — the default 2 rendered
    // sixteen times the pixels on the main thread.
    const snapshot = () => {
      timer = null;
      void snapshotFnsRef.current.capture({ pixelRatio: 0.5 }).then((dataUrl) => {
        if (dataUrl && dataUrl !== lastSent) {
          lastSent = dataUrl;
          snapshotFnsRef.current.notify?.(dataUrl);
        }
      });
    };

    const onUpdate = (
      _update: Uint8Array,
      _origin: unknown,
      _doc: unknown,
      transaction: { local: boolean }
    ) => {
      if (!transaction.local) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(snapshotWhenIdle, 4000);
    };

    // Never render the snapshot into a running gesture.
    const snapshotWhenIdle = () => {
      if (Konva.isDragging() || Konva.isTransforming()) {
        timer = setTimeout(snapshotWhenIdle, 1000);
        return;
      }
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(snapshot, { timeout: 2000 });
      } else {
        snapshot();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && timer) {
        clearTimeout(timer);
        snapshot();
      }
    };

    collabYdoc.on('update', onUpdate);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      collabYdoc.off('update', onUpdate);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timer) {
        clearTimeout(timer);
        // Best effort — captureStageImage no-ops when the stage is already gone.
        snapshot();
      }
    };
  }, [collabYdoc]);

  const handleDownload = useCallback(
    async (format: 'png' | 'jpeg' | 'webp' = 'png', pixelRatio = 1, transparent = false) => {
      const ref = canvasRefsRef.current[currentPageIndex];
      if (!ref?.current) return;
      // Fonts load via font-display:swap; capture before they settle bakes in
      // the fallback face (see ensureFontsReady). Gate the sync toDataURL path.
      await ensureFontsReady();
      const dataUrl = ref.current.toDataURL({
        format,
        pixelRatio,
        includeBackground: !transparent,
      });
      if (dataUrl) {
        const ext = format === 'jpeg' ? 'jpg' : format;
        await downloadDataUrl(dataUrl, `gruenerator-seite-${currentPageIndex + 1}.${ext}`);
        onDownload?.(dataUrl);
      }
    },
    [currentPageIndex, canvasRefsRef, onDownload]
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

  // Auto-switch tabs based on config (e.g., switch to 'settings' when a balken is selected).
  // Desktop only: on mobile a tap just selects — the canvas keeps its size, and
  // the selection's area opens from the bottom bar's "Mehr" button instead.
  const mobileSelectionArea = isMobileWeb
    ? getMobileSelectionArea(
        activeSelectedElement,
        toolbarState?.activeFloatingModule ?? null,
        visibleTabs.map((tab) => tab.id),
        activeConfig?.getAutoSwitchTab?.(activeSelectedElement ?? null) ?? null
      )
    : null;
  useEffect(() => {
    if (!activeConfig?.getAutoSwitchTab || isMobileWeb) return;
    const targetTab = activeConfig.getAutoSwitchTab(activeSelectedElement ?? null);
    setActiveTab((current) => {
      const next = autoSwitchTab(current, targetTab, prevTabRef.current);
      prevTabRef.current = next.prev;
      return next.tab;
    });
  }, [activeSelectedElement, activeConfig, setActiveTab, isMobileWeb]);

  const isPanelOpen = activeTab !== null;
  const isMobileSheetOpen = isMobileWeb && isPanelOpen;
  const panelTitle =
    (activeTab && activeConfig?.tabs.find((tab) => tab.id === activeTab)?.label) || 'Auswahl';
  useMobileSheetFit({
    enabled: isMobileSheetOpen,
    zoom,
    pagesContainerRef,
    activePageRef: pageDomRefsRef.current[currentPageIndex],
  });

  // Share all pages via native share (Web Share API with multiple files)
  const shareAllPages = useCallback(async () => {
    let dataUrls: string[];
    try {
      dataUrls = await exportAllPages();
    } catch (error) {
      console.error('[CanvasEditor] share-all export failed:', error);
      return;
    }
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
          await ensureFontsReady();
          const dataUrl = ref.current.toDataURL({ pixelRatio: 1 });
          if (dataUrl) {
            await downloadDataUrl(dataUrl, `gruenerator-slider-seite-${currentPageIndex + 1}.png`);
          }
        }
      },
      onNavigateToGallery: () => {},
      onSaveAsTemplate,
      pageCount,
      onDownloadAllZip: downloadAllAsZip,
      onShareAllPages: shareAllPages,
      isMultiExporting,
      exportProgress,
      exportError: multiExportError,
    }),
    [
      pageCount,
      downloadAllAsZip,
      shareAllPages,
      isMultiExporting,
      exportProgress,
      currentPageIndex,
      canvasRefsRef,
      multiExportError,
      handleCaptureCanvas,
      handleCaptureCanvasForAi,
      onSaveAsTemplate,
    ]
  );

  // After a page switch or a deck replace there is one render before the new
  // page reports its state. The chat would unmount there and lose its running
  // turn (#4273), so it keeps rendering against the last reported page.
  const sectionSource = useMemo(
    () =>
      activeConfig && activeState && activeActions
        ? {
            config: activeConfig,
            state: activeState,
            actions: activeActions,
            selectedElement: activeSelectedElement,
          }
        : null,
    [activeConfig, activeState, activeActions, activeSelectedElement]
  );
  const lastSectionSourceRef = useRef(sectionSource);
  if (sectionSource) lastSectionSourceRef.current = sectionSource;

  // Render the active section based on configuration
  const renderActiveSection = useCallback(() => {
    if (!activeTab) return null;
    const source = sectionSource ?? (activeTab === 'chat' ? lastSectionSourceRef.current : null);
    if (!source) return null;

    const sectionConfig = source.config.sections[activeTab];
    if (!sectionConfig) return null;

    const SectionComponent = sectionConfig.component;
    const sectionProps = sectionConfig.propsFactory(source.state, source.actions, {
      selectedElement: source.selectedElement,
      ...shareProps,
      ...(specEdit && { specEdit }),
    });

    return (
      <Suspense fallback={sidebarLoadingFallback}>
        <SectionComponent {...sectionProps} />
      </Suspense>
    );
  }, [activeTab, sectionSource, shareProps, specEdit]);

  // Collab vor dem ersten Sync (noch keine Seiten) und der eine Render, in dem
  // die Seiten-Configs nachladen: das Layout bleibt stehen, nur die Fläche
  // zeigt den Platzhalter. Ein Voll-Skeleton hier blendete die Chrome noch
  // einmal aus, nachdem sie schon sichtbar war.
  const noPageRenderable = !pages.some((p) => loadedConfigs.has(p.configId));

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
      onSaveAsTemplate,
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
      onSaveAsTemplate,
    ]
  );

  const format = getCanvasFormatOrDefault(formatId);
  const pageAspectRatio = format.width / format.height;

  // Build sidebar elements (static within the already-async editor chunk)
  const areaTabBar = (
    <Suspense fallback={<CanvasTabRailSkeleton />}>
      <SidebarTabBar
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabClick={handleTabClick}
        disabledTabs={disabledTabs}
      />
    </Suspense>
  );

  // Render the toolbar whenever there is something to put in it — either the
  // canvas has reported edit state (toolbarState) or the host has supplied
  // chrome slots (title, sync indicator, presence). This keeps host chrome
  // visible during the pre-sync "Synchronisiere..." phase in collab mode,
  // when toolbarState is still null.
  const showToolbar = toolbarState !== null || chromeLeft || chromeCenter || chromeRight;
  const toolbarElement = showToolbar ? (
    <Toolbar
      canUndo={(toolbarState?.canUndo ?? false) || canUndoPageOp}
      canRedo={(toolbarState?.canRedo ?? false) || canRedoPageOp}
      handlers={toolbarHandlers}
      shareProps={toolbarState ? toolbarShareProps : undefined}
      chromeLeft={chromeLeft}
      chromeCenter={chromeCenter}
      chromeRight={chromeRight}
    />
  ) : null;

  // Selection-driven formatting controls live outside the menu bar: a floating
  // card over the canvas (desktop); on mobile a bottom selection bar in the
  // area tab bar's slot plus a pill on the object, and — once the user opens
  // the selection's area — an "Auswahl" block at the top of the sheet.
  // Render only when the canvas has reported an actual element selection (not
  // merely because delete-page is available on a multi-page doc — page ops live
  // in the page toolbar / thumbnail strip). While an element is selected, the
  // delete-page action rides along in the desktop card and the mobile sheet's
  // "Auswahl" block, not in the mobile bottom bar (`hideObjectActions`). Only
  // one of the two bars is mounted per viewport to avoid a hidden duplicate
  // React tree.
  const contextControlsProps = toolbarState
    ? {
        selectedElement: toolbarState.selectedElement ?? null,
        activeFloatingModule: toolbarState.activeFloatingModule ?? null,
        canMoveUp: toolbarState.canMoveUp ?? false,
        canMoveDown: toolbarState.canMoveDown ?? false,
        canDuplicate: toolbarState.canDuplicate ?? false,
        handlers: {
          ...toolbarHandlers,
          onEditImage: () => setActiveTab('image-adjust'),
        },
        onDelete: toolbarOnDelete,
        onDeselect: handleDeselectAll,
      }
    : null;
  const hasContextControls =
    contextControlsProps !== null &&
    (contextControlsProps.selectedElement !== null ||
      contextControlsProps.activeFloatingModule !== null);
  const contextBarElement =
    contextControlsProps && hasContextControls && !isMobileWeb ? (
      <ContextToolbar {...contextControlsProps} />
    ) : null;
  const mobileSelectionElement =
    contextControlsProps && hasContextControls && isMobileWeb && isPanelOpen ? (
      <MobileSelectionControls {...contextControlsProps} />
    ) : null;
  const openSelectionArea = mobileSelectionArea
    ? () => setActiveTab(mobileSelectionArea)
    : undefined;
  const showMobileSelection =
    contextControlsProps !== null && hasContextControls && isMobileWeb && !isPanelOpen;
  const tabBar = showMobileSelection ? (
    <MobileSelectionBar
      {...contextControlsProps}
      onOpenArea={openSelectionArea}
      onDone={handleDeselectAll}
    />
  ) : (
    areaTabBar
  );
  const selectionPill =
    showMobileSelection && toolbarState?.selectedElement ? (
      <MobileSelectionPill
        measureKey={toolbarState.activeFloatingModule}
        zoom={zoom}
        getBox={getSelectionBox}
        subscribeManipulation={subscribeManipulation}
        canDuplicate={toolbarState.canDuplicate ?? false}
        canDelete={toolbarState.canDelete ?? false}
        onDuplicate={toolbarHandlers.handleDuplicate}
        onDelete={toolbarHandlers.handleDeleteElement}
        onMore={openSelectionArea}
      />
    ) : null;

  const panel = (
    <Suspense fallback={sidebarLoadingFallback}>
      <SidebarPanel isOpen={isPanelOpen} title={panelTitle} onClose={handlePanelClose}>
        {mobileSelectionElement}
        {renderActiveSection()}
      </SidebarPanel>
    </Suspense>
  );

  // Die untere Leiste trägt zwei Dinge, und nur eines davon hängt an der
  // Seitenzahl: der Miniaturen-Streifen ist erst im Deck sinnvoll, die
  // Meta-Leiste daneben (Zoom-Regler, Vollbild, Seitenanzeige) gilt immer.
  // Bis hierher hing beides an derselben Bedingung — bei einer einzelnen Seite
  // fiel damit auch der Zoom weg und war nur noch per Pinch bzw. Strg/Cmd+Rad
  // erreichbar.
  const showPageStrip = pages.length > 1;
  const currentTemplateId = pages[currentPageIndex]?.configId;
  const sliderVariantHandler =
    sliderConfigId === 'slider' || sliderConfigId === 'slider-at'
      ? handleAddSliderVariant
      : undefined;
  // Restrict the template picker to the same category as the current template
  // (sharepic, slider, presentation, plakat, profilbild) so e.g. a Zitat page
  // can't insert a presentation slide.
  const categoryFilter = currentTemplateId ? getCategoryForTemplate(currentTemplateId) : undefined;

  // Die Leiste selbst ist durchsichtig und rahmenlos — sie liegt über der
  // Fläche, statt eine eigene Kante zu bilden, und fängt außerhalb ihrer
  // Kapseln keine Klicks ab. Lesbar bleiben die Bedienteile durch je eine
  // eigene, leicht durchscheinende Kapsel.
  const bottomBarGroup =
    'flex items-center rounded-xl border border-[var(--editor-border)] bg-[var(--editor-surface)]/80 shadow-sm backdrop-blur-sm pointer-events-auto';
  const pageStrip = showPageStrip ? (
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
      formatId={formatId}
    />
  ) : null;
  const bottomBar = (
    <div className="canvas-bottom-bar pointer-events-none flex items-center gap-2 px-2 pb-2">
      {pageStrip ? (
        <div className="min-w-0 flex-1">
          <div className={cn('w-fit max-w-full', bottomBarGroup)}>{pageStrip}</div>
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          {canAddMore && (
            <div className={cn('w-fit px-1.5 py-1', bottomBarGroup)}>
              <AddPageButton
                onSelectTemplate={handleAddPage}
                onDuplicateCurrent={duplicateCurrentPage}
                currentTemplateId={currentTemplateId}
                onAddSliderVariant={sliderVariantHandler}
                templateFilter={categoryFilter}
                formatId={formatId}
                compact
              />
            </div>
          )}
        </div>
      )}
      <div className={cn('shrink-0', bottomBarGroup)}>
        <CanvasMetaBar
          pageCount={pageCount}
          currentPageIndex={currentPageIndex}
          zoom={zoom}
          onZoomChange={setZoom}
        />
      </div>
    </div>
  );

  return (
    <UserUploadsProvider>
      {/* Die Text-Bearbeitung sitzt an der Wurzel des Editors, nicht je Seite:
          nur so liegt sie über der Kontextleiste, die ihre Formatierungsknöpfe
          zeigt. Der Provider in `CanvasStage` merkt, dass er einen über sich
          hat, und reicht durch. Ob die Leiste die Knöpfe wirklich übernimmt,
          meldet sie selbst an — wo wir sie nicht rendern, zeigt das Overlay
          wieder seine eigene Karte. */}
      <CanvasTextEditorProvider>
        <CanvasEditorLayout
          // Vorschau vor dem Sync: zeigen, aber nichts anbieten, was schreibt —
          // die Seiten hängen noch an keinem Y.Map, jede Änderung ginge verloren.
          sidebar={isPreview ? null : panel}
          tabBar={isPreview ? null : tabBar}
          actions={null}
          toolbar={toolbarElement}
          contextBar={isPreview ? null : contextBarElement}
          // Die Desktop-Leiste ist auf dem Handy per CSS ausgeblendet; gar
          // nicht erst mitgeben, sonst hinge der Streifen zweimal im Baum.
          bottomBar={isMobileWeb || isPreview ? null : bottomBar}
          // Auf dem Handy scrollt ein Finger auf dem Sharepic nicht (wie in
          // Canva) — die Seiten wechselt dort dieser Streifen.
          mobilePageStrip={isMobileWeb && !isMobileSheetOpen && !isPreview ? pageStrip : null}
          mobileSheetOpen={isMobileSheetOpen}
          onCanvasBackdropPointerDown={isMobileSheetOpen ? handlePanelClose : undefined}
        >
          <div
            inert={isPreview}
            aria-busy={isPreview}
            ref={pagesContainerCallbackRef}
            onPointerDown={handleWorkAreaPointerDown}
            className="heterogeneous-multipage__pages-container has-bottom-bar flex flex-col items-center gap-md p-sm pb-lg w-full max-canvas-mobile:gap-sm max-canvas-mobile:p-xs"
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
                  formatId={formatId}
                  isActive={isActive}
                  canDelete={canDelete}
                  canvasRef={canvasRefsRef.current[index]}
                  pageRef={pageDomRefsRef.current[index]}
                  onSelect={handlePageSelect}
                  onDelete={removePage}
                  onMovePage={movePage}
                  onDuplicatePage={duplicatePage}
                  onChangeTemplate={handleOpenTemplateChange}
                  onExport={handleExport}
                  onCancel={onCancel}
                  callbacks={getCallbacksForPage(page.id, page.configId)}
                  multiPageExport={index === 0 ? multiPageExportProps : undefined}
                  onStateChange={handlePageStateChange}
                  onToolbarStateChange={
                    isActive && !isPreview ? handleToolbarStateChange : undefined
                  }
                  onAutoSaveShareToken={onAutoSaveShareToken}
                  autoSave={false}
                  pageBinding={pageBindingAt(index, page.id, isActive)}
                />
              );
            })}

            {noPageRenderable && <CanvasPageSkeleton aspectRatio={pageAspectRatio} />}

            {templateChangePage && (
              <TemplatePickerFlyout
                isOpen
                mode="replace"
                anchorRef={pageDomRefsRef.current[templateChangePage.index]}
                onSelectTemplate={handleSelectTemplateChange}
                onClose={handleCloseTemplateChange}
                currentTemplateId={templateChangePage.configId}
                templateFilter={categoryFilter}
                formatId={formatId}
              />
            )}

            {/* Seite hinzufügen unter der Fläche — für den Fall, in dem die
                untere Leiste den Knopf nicht trägt: unterhalb von 900 px, wo
                `CanvasEditorLayout` sie per `max-canvas-mobile:hidden`
                ausblendet. Die Breakpoint-Bedingung steht hier gespiegelt, weil
                nur CSS sie kennt. */}
            {canAddMore && !showPageStrip && (
              <div className="w-full max-w-[28rem] pt-sm max-canvas-mobile:pt-xs max-canvas-mobile:px-xs canvas-mobile:hidden">
                <AddPageButton
                  onSelectTemplate={handleAddPage}
                  onDuplicateCurrent={duplicateCurrentPage}
                  currentTemplateId={currentTemplateId}
                  disabled={!canAddMore}
                  onAddSliderVariant={sliderVariantHandler}
                  templateFilter={categoryFilter}
                  formatId={formatId}
                />
              </div>
            )}
          </div>
        </CanvasEditorLayout>
        {selectionPill}
      </CanvasTextEditorProvider>
    </UserUploadsProvider>
  );
}

export type { CanvasEditorProps, PageWrapperProps } from './types';

export default CanvasEditor;

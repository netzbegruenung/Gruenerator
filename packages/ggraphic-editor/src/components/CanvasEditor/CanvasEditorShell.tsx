// SPDX-License-Identifier: MPL-2.0
/**
 * CanvasEditorShell - Canvas editor with shared sidebar and page management
 *
 * Brand-free: what a host adds (document tabs, the menu bar, the page picker,
 * template callbacks) it registers through `registerEditorShell` (./editorShell).
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

import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { pagePersistedStateKeys } from '@ggraphic/editor/collab/pageElementStateKeys';
import { serializeDeck } from '@ggraphic/editor/collab/pagesDoc';
import { createPageSyncedCallbacks } from '@ggraphic/editor/collab/wrapCallbacksWithPageSync';
import { CanvasTextEditorProvider } from '@ggraphic/editor/components/CanvasTextOverlay';
import {
  DEFAULT_FORMAT_ID,
  getCanvasFormatOrDefault,
  isPrintFormat,
  isSlideFormat,
} from '@ggraphic/editor/formats/index';
import {
  usePageManager,
  useMultiPageExport,
  usePageThumbnails,
  type InitialPageDef,
} from '@ggraphic/editor/hooks/index';
import { AnnouncerContext, useLiveAnnouncer } from '@ggraphic/editor/hooks/useAnnounce';
import { useDeckAutoSave } from '@ggraphic/editor/hooks/useDeckAutoSave';
import { browserFileDelivery } from '@ggraphic/editor/hostServices';
import { UserUploadsProvider } from '@ggraphic/editor/sidebar/UserUploadsProvider';
import { useCanvasStoreSelector } from '@ggraphic/editor/stores/CanvasStoreProvider';
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/useAutoSaveStore';
import { Skeleton } from '@ggraphic/editor/ui/skeleton';
import { cn } from '@ggraphic/editor/utils/cn';
import { ensureFontsReady } from '@ggraphic/editor/utils/ensureFontsReady';
import { sameLayerEntries } from '@ggraphic/editor/utils/layerLabels';
import Konva from 'konva';
import React, {
  useCallback,
  useImperativeHandle,
  useRef,
  useMemo,
  useEffect,
  useState,
  Suspense,
  startTransition,
} from 'react';

import { shareImageText } from '../../configs/shareSection.js';
import { exportPptxDeck } from '@ggraphic/editor/export/pptx/exportPptxDeck';
import {
  exportPrintPdf,
  lowResolutionWarnings,
  PRINT_JPEG_QUALITY,
  printPdfFilename,
  type PrintExportPage,
} from '../../export/printExport.js';
import { exportSlidesPdf } from '@ggraphic/editor/export/slidesPdf';
import { useIsCanvasMobile } from '@ggraphic/editor/hooks/useIsCanvasMobile';
import { useZoomGestures } from '@ggraphic/editor/hooks/useZoomGestures';
import { CanvasEditorLayout } from '@ggraphic/editor/layouts/index';
import { SidebarPanel } from '@ggraphic/editor/sidebar/SidebarPanel';
import { SidebarTabBar } from '@ggraphic/editor/sidebar/SidebarTabBar';
import { LayersSection } from '@ggraphic/editor/sidebar/sections/LayersSection';
import { collectAltTextPages as collectCapturedAltTextPages } from '@ggraphic/editor/utils/collectAltTextPages';
import { photoCreditLine } from '@ggraphic/editor/utils/photoCredit';
import { pagePhotoCredits } from '@ggraphic/editor/utils/photoCredits';
import { scrollBehavior } from '@ggraphic/editor/utils/scrollBehavior';
import { CanvasAnnouncer } from '@ggraphic/editor/components/CanvasAnnouncer';
import { CanvasContextMenu } from '@ggraphic/editor/components/CanvasContextMenu/CanvasContextMenu';
import {
  CanvasPageSkeleton,
  CanvasTabRailSkeleton,
} from '@ggraphic/editor/components/CanvasEditorSkeleton';
import { CanvasMetaBar, CanvasZoomIndicator } from '@ggraphic/editor/components/CanvasMetaBar';
import { MobileSelectionPill } from '@ggraphic/editor/components/MobileSelectionPill';
import { PageThumbnailStrip, type PagePickerSlot } from '../PageThumbnailStrip.js';
import { SlideNotesPanel } from '@ggraphic/editor/components/SlideNotesPanel';
import { AddPageButton } from '../AddPageButton.js';
import { Toolbar } from '../Toolbar.js';
import { ContextToolbar } from '@ggraphic/editor/components/TopBar/ContextToolbar';
import { MobileSelectionBar } from '@ggraphic/editor/components/TopBar/MobileSelectionBar';
import { MobileSelectionControls } from '@ggraphic/editor/components/TopBar/MobileSelectionControls';
import { FloatingAiSuggestionBanner } from '@ggraphic/editor/components/TopBar/modules/FloatingAiSuggestionBanner';
import { MultiSelectionToolbar } from '@ggraphic/editor/components/TopBar/MultiSelectionToolbar';

import { autoSwitchTab } from '@ggraphic/editor/components/CanvasEditor/autoSwitchTab';
import {
  registeredEditorShell,
  withEditorTabs,
  type EditorShellProviderProps,
  type EditorTabDefinition,
  type EditorTabDropHandle,
} from '@ggraphic/editor/components/CanvasEditor/editorShell';
import { useCanvasContextMenu } from '@ggraphic/editor/components/CanvasEditor/hooks/useCanvasContextMenu';
import { useLoadedConfigs } from '@ggraphic/editor/components/CanvasEditor/hooks/useLoadedConfigs';
import { useMobileSheetFit } from '@ggraphic/editor/components/CanvasEditor/hooks/useMobileSheetFit';
import { usePageRefs } from '@ggraphic/editor/components/CanvasEditor/hooks/usePageRefs';
import { usePageUndoRedoShortcuts } from '@ggraphic/editor/components/CanvasEditor/hooks/usePageUndoRedoShortcuts';
import {
  needsImpressum,
  usePrintImpressumGate,
  type ObservedPages,
} from '@ggraphic/editor/components/CanvasEditor/hooks/usePrintImpressumGate';
import { useScrollToAddedPage } from '@ggraphic/editor/components/CanvasEditor/hooks/useScrollToAddedPage';
import { useToolbarHandlers } from '@ggraphic/editor/components/CanvasEditor/hooks/useToolbarHandlers';
import { useWorkAreaDeselect } from '@ggraphic/editor/components/CanvasEditor/hooks/useWorkAreaDeselect';
import { layersTab, withLayersTab } from '@ggraphic/editor/components/CanvasEditor/layersTab';
import { getMobileSelectionArea } from '@ggraphic/editor/components/CanvasEditor/mobileSelectionArea';
import { PageWrapper } from '@ggraphic/editor/components/CanvasEditor/PageWrapper';

import type {
  CanvasEditorProps,
  PageWrapperProps,
} from '@ggraphic/editor/components/CanvasEditor/types';
import type { SidebarTabId } from '@ggraphic/editor/sidebar/types';
import type {
  AltTextPage,
  AltTextScope,
  CanvasSpecEditBridge,
} from '@ggraphic/editor/CanvasEditorProvider';
import type { ToolbarStateReport } from '@ggraphic/editor/components/GenericCanvas';
import type { ExportOptions } from '@ggraphic/editor/types/editorTypes';
import type { LayerSelectionChange } from '@ggraphic/editor/utils/layerSelection';

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

const NO_EDITOR_TABS: readonly EditorTabDefinition[] = [];
const NoShellProvider = ({ children }: EditorShellProviderProps) => <>{children}</>;
const NO_CALLBACK_KEYS = (): readonly string[] => [];
const DEFAULT_DECK_LOCALE = (): 'de-DE' | 'de-AT' => 'de-DE';

/** Folien-PDF: 2× der 1920 × 1080-Folie, scharf auch im Vollbild. */
const SLIDES_PDF_PIXEL_RATIO = 2;

export function CanvasEditorShell(props: CanvasEditorProps) {
  return (
    <AutoSaveStoreProvider initialShareToken={props.initialShareToken ?? null}>
      <CanvasEditorInner {...props} />
    </AutoSaveStoreProvider>
  );
}

function CanvasEditorInner({
  initialConfigId,
  formatId,
  documentTitle,
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
  galleryAutoSave = true,
  showShare = true,
  exportApiRef,
  hostChrome,
  readOnly = false,
}: CanvasEditorProps) {
  const t = useMessages();
  // Note: onAutoSaveShareToken is threaded down to useCanvasAutoSave (via
  // PageWrapper → GenericCanvas) instead of a store subscription here — a
  // subscription dies with the unmount, losing tokens that resolve after the
  // editor closes (flush save, in-flight save) and re-creating duplicates.
  const isMobileWeb = useIsCanvasMobile();
  const { announcer, message: liveMessage } = useLiveAnnouncer();
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
    discardReplaceDeck,
    replaceDeck,
    canUndoPageOp,
    canRedoPageOp,
    isPreview,
  } = usePageManager<string>({
    initialConfigId,
    formatId,
    initialProps,
    maxPages,
    // Persisted page JSON: `parseInitialPages` only checks that `configId` is
    // a string; an unknown id fails when its config loads.
    initialPages: initialPages as InitialPageDef<string>[] | undefined,
    collaborative,
    announce: announcer.announce,
  });

  // Store loaded configs for rendering
  const loadedConfigs = useLoadedConfigs({ pages, getConfigForPage });

  const {
    tabs: editorTabs = NO_EDITOR_TABS,
    Provider: ShellProvider = NoShellProvider,
    pagePicker,
    pageCallbackKeys = NO_CALLBACK_KEYS,
    deckLocale: deckLocaleOf = DEFAULT_DECK_LOCALE,
  } = registeredEditorShell();

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
    new Map<string, { configId: string; wrapped: Record<string, (val: unknown) => void> }>()
  );
  const getCallbacksForPage = useCallback(
    (pageId: string, configId: string) => {
      const cache = pageCallbacksCacheRef.current;
      const cached = cache.get(pageId);
      if (cached?.configId === configId) return cached.wrapped;
      const wrapped = createPageSyncedCallbacks(
        () => callbacksRef.current,
        (partial) => updatePageStateRef.current(pageId, partial),
        [...pageCallbackKeys(configId), ...pagePersistedStateKeys()]
      );
      cache.set(pageId, { configId, wrapped });
      return wrapped;
    },
    [pageCallbackKeys]
  );
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
  useZoomGestures(pagesContainer, setZoom, { leftOrigin: isMobileWeb });

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
    notice: multiExportNotice,
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
    async (configId: string, stateOverrides?: Record<string, unknown>) => {
      await addPage(configId, true, stateOverrides);
    },
    [addPage]
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
    (configId: string) => {
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
        behavior: scrollBehavior(),
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
          prev.canDelete === report.canDelete &&
          prev.isCropping === report.isCropping &&
          prev.cropAspect === report.cropAspect &&
          prev.cropRotation === report.cropRotation &&
          prev.isExpanding === report.isExpanding &&
          prev.selectionCount === report.selectionCount &&
          prev.canCopy === report.canCopy &&
          prev.lockState === report.lockState &&
          prev.canLock === report.canLock &&
          prev.selectedLayerIds === report.selectedLayerIds &&
          sameLayerEntries(prev.layers, report.layers)
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
  // A page the Vorlagen tab just added: shown as soon as the deck has it.
  const pageToShowRef = useRef<string | null>(null);
  const showPage = useCallback(
    (pageId: string) => {
      const index = specEditRef.current.pages.findIndex((p) => p.id === pageId);
      if (index >= 0) handleThumbnailSelect(index);
      else pageToShowRef.current = pageId;
    },
    [handleThumbnailSelect]
  );
  useEffect(() => {
    const pageId = pageToShowRef.current;
    if (!pageId) return;
    const index = pages.findIndex((p) => p.id === pageId);
    if (index < 0) return;
    pageToShowRef.current = null;
    handleThumbnailSelect(index);
  }, [pages, handleThumbnailSelect]);
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

  const services = useCanvasEditorServices();
  const { fileDelivery = browserFileDelivery, print: printService } = services;
  const filenamePrefix = fileDelivery.filenamePrefix ?? 'ggraphic';
  const shareTitle = fileDelivery.shareTitle ?? 'ggraphic';
  // The host's document tabs (the Vorlagen) change the deck, so they need the
  // synced pages doc.
  const availableEditorTabs = useMemo(
    () =>
      hasReplaceDeck ? editorTabs.filter((def) => def.isAvailable({ services, formatId })) : [],
    [editorTabs, hasReplaceDeck, services, formatId]
  );
  const takesPageDrops = availableEditorTabs.some((def) => def.takesPageDrops);
  // A tile dropped on a page goes to the open document tab: a Seite lands
  // after that page, a print Vorlage asks first on a design with content.
  const pageDropRef = useRef<EditorTabDropHandle>(null);
  const handleDropVorlage = useCallback(
    (id: string, pageId: string) => pageDropRef.current?.drop(id, pageId),
    []
  );

  const toolbarHandlers = useToolbarHandlers({
    canvasRefsRef,
    currentPageIndex,
    toolbarState,
    canUndoPageOp,
    canRedoPageOp,
    undoPageOp,
    redoPageOp,
    discardReplaceDeck,
  });

  const handleCaptureCanvas = useCallback(
    async (options?: Partial<ExportOptions>) => {
      const ref = canvasRefsRef.current[currentPageIndex];
      if (!ref?.current) return null;
      return await ref.current.captureCanvas(options);
    },
    [currentPageIndex, canvasRefsRef]
  );

  // Wie capturePages: jede Seite braucht ihr gemountetes Stage, sonst bricht der Export ab.
  const buildPptx = useCallback(
    async (onProgress?: (done: number, total: number) => void) => {
      await ensureFontsReady();
      const deck = serializeDeck(pagesDoc);
      const refs = canvasRefsRef.current;
      if (deck.some((_, i) => !refs[i]?.current)) {
        throw new Error('Nicht alle Folien konnten exportiert werden');
      }
      return exportPptxDeck({
        pages: deck.map((page) => page.state),
        format: getCanvasFormatOrDefault(formatId),
        rasterizeElement: async (slideIndex, elementId) =>
          (await refs[slideIndex]?.current?.rasterizeElement(elementId)) ?? null,
        ...(documentTitle ? { title: documentTitle } : {}),
        ...(onProgress ? { onProgress } : {}),
      });
    },
    [pagesDoc, canvasRefsRef, formatId, documentTitle]
  );
  useImperativeHandle(
    exportApiRef,
    () => ({
      captureActivePage: async ({ pixelRatio = 1, transparent = false } = {}) => {
        await ensureFontsReady();
        return handleCaptureCanvas({ format: 'png', pixelRatio, includeBackground: !transparent });
      },
      capturePages: async ({ pixelRatio = 1 } = {}) => {
        await ensureFontsReady();
        return exportAllPages({ pixelRatio });
      },
      exportPptx: () => buildPptx(),
      getPages: () => serializeDeck(pagesDoc).map(({ configId, state }) => ({ configId, state })),
      undo: toolbarHandlers.undo,
      redo: toolbarHandlers.redo,
    }),
    [handleCaptureCanvas, exportAllPages, buildPptx, pagesDoc, toolbarHandlers]
  );

  const handleCaptureCanvasForAi = useCallback(async () => {
    const ref = canvasRefsRef.current[currentPageIndex];
    if (!ref?.current) return null;
    return await ref.current.captureCanvasForAi();
  }, [currentPageIndex, canvasRefsRef]);

  const collectAltTextPages = useCallback(
    async (scope: AltTextScope): Promise<AltTextPage[]> => {
      await ensureFontsReady();
      const refs = canvasRefsRef.current;
      const indices = scope === 'active' ? [currentPageIndex] : refs.map((_, i) => i);
      return collectCapturedAltTextPages(refs, indices);
    },
    [currentPageIndex, canvasRefsRef]
  );

  // Every page, not just the active one: a selection left behind on page 2
  // keeps its context bar alive after the user scrolls away.
  const handleDeselectAll = useCallback(() => {
    canvasRefsRef.current.forEach((ref) => ref.current?.deselect());
  }, [canvasRefsRef]);

  // Ebenen: die Liste zeigt die aktive Seite und wählt über deren Store aus.
  const handleLayerSelect = useCallback(
    (change: LayerSelectionChange) =>
      canvasRefsRef.current[currentPageIndex]?.current?.selectLayers?.(change),
    [canvasRefsRef, currentPageIndex]
  );
  // Enter/F2 auf einem Eintrag: was das Kontextmenü für das Element anbietet —
  // Text bearbeiten, wenn die Auswahl es erlaubt, sonst ein Bild in den Rahmen.
  const handleLayerActivate = useCallback(
    (id: string) => {
      const page = canvasRefsRef.current[currentPageIndex]?.current;
      if (!page) return;
      page.selectLayers?.({ kind: 'only', id });
      const snapshot = page.getMenuSnapshot?.();
      if (snapshot?.caps.canEditText) page.runCommand?.('editText', null);
      else if (snapshot?.module?.type === 'frame') page.runCommand?.('insertFrameImage', null);
    },
    [canvasRefsRef, currentPageIndex]
  );
  // „Zu den Ebenen": öffnet den Bereich; die Liste holt sich den Fokus, sobald sie steht.
  const [layersFocusRequested, setLayersFocusRequested] = useState(false);
  const handleLayersFocusHandled = useCallback(() => setLayersFocusRequested(false), []);
  const handleSkipToLayers = useCallback(() => {
    setActiveTab('layers');
    setLayersFocusRequested(true);
  }, []);

  // While a suggestion is open the pages are locked: keep or discard it first.
  // A selection from before would still answer Delete and arrow keys.
  const hasPendingSuggestion = useCanvasStoreSelector((s) => s.pendingAiSuggestion !== null);

  const canUndo = (toolbarState?.canUndo ?? false) || canUndoPageOp;
  const canRedo = (toolbarState?.canRedo ?? false) || canRedoPageOp;
  // A waiting suggestion is kept or discarded, not undone: the bar hides the
  // buttons then, and a host-drawn bar must do the same.
  const onHistoryChange = hostChrome?.onHistoryChange;
  useEffect(() => {
    onHistoryChange?.({
      canUndo: canUndo && !hasPendingSuggestion,
      canRedo: canRedo && !hasPendingSuggestion,
    });
  }, [onHistoryChange, canUndo, canRedo, hasPendingSuggestion]);
  useEffect(() => {
    if (hasPendingSuggestion) handleDeselectAll();
  }, [hasPendingSuggestion, handleDeselectAll]);

  // Desktop right-click menu; "Bild ersetzen …" opens the bar's picker.
  const [backgroundPickerRequest, setBackgroundPickerRequest] = useState(0);
  const requestBackgroundPicker = useCallback(() => setBackgroundPickerRequest((n) => n + 1), []);
  const openImageAdjust = useCallback(() => setActiveTab('image-adjust'), []);
  const pageIds = useMemo(() => pages.map((page) => page.id), [pages]);
  const contextMenuRef = useCanvasContextMenu({
    containerRef: pagesContainerRef,
    canvasRefsRef,
    pageDomRefsRef,
    pageIds,
    currentPageIndex,
    canAddPage: canAddMore,
    enabled: !isMobileWeb && !isPreview && !readOnly && !hasPendingSuggestion,
    duplicatePage,
    removePage,
    openImageAdjust,
    deselectAll: handleDeselectAll,
    requestBackgroundPicker,
  });

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
  // Touch deselects only on a tap: the gutters are the scroll surfaces on mobile.
  // A mouse press there also starts a marquee on the active page, so a
  // selection can be drawn from outside the artboard.
  const handleWorkAreaMousePress = useCallback(
    (evt: PointerEvent) => canvasRefsRef.current[currentPageIndex]?.current?.beginMarquee(evt),
    [canvasRefsRef, currentPageIndex]
  );
  const handleWorkAreaPointerDown = useWorkAreaDeselect(
    handleDeselectAll,
    handleWorkAreaMousePress
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
    enabled: !collaborative && galleryAutoSave,
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
    let idleHandle: number | null = null;
    let lastSent: string | null = null;

    // The gallery card shows the snapshot at ≤180 px, so a 540 px render
    // (pixelRatio 0.5) is plenty even on retina — the default 2 rendered
    // sixteen times the pixels on the main thread.
    const snapshot = () => {
      timer = null;
      idleHandle = null;
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
      if (idleHandle !== null) window.cancelIdleCallback(idleHandle);
      idleHandle = null;
      timer = setTimeout(snapshotWhenIdle, 4000);
    };

    // Never render the snapshot into a running gesture.
    const snapshotWhenIdle = () => {
      if (Konva.isDragging() || Konva.isTransforming()) {
        timer = setTimeout(snapshotWhenIdle, 1000);
        return;
      }
      timer = null;
      if (typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(snapshot, { timeout: 2000 });
      } else {
        snapshot();
      }
    };

    // Takes a pending snapshot now — once, whether it waits on the timer or
    // on the idle callback.
    const flushPending = () => {
      if (timer === null && idleHandle === null) return;
      if (timer !== null) clearTimeout(timer);
      if (idleHandle !== null) window.cancelIdleCallback(idleHandle);
      snapshot();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPending();
    };

    collabYdoc.on('update', onUpdate);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      collabYdoc.off('update', onUpdate);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // Best effort — captureStageImage no-ops when the stage is already gone.
      flushPending();
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
        await fileDelivery.downloadDataUrl(
          dataUrl,
          `${filenamePrefix}-seite-${currentPageIndex + 1}.${ext}`
        );
        onDownload?.(dataUrl);
      }
    },
    [currentPageIndex, canvasRefsRef, onDownload, fileDelivery, filenamePrefix]
  );

  // Each poster page's live state for the impressum warning. The ref dedupes
  // reports without a stale closure, the state re-renders the gate.
  const [observedPages, setObservedPages] = useState<ObservedPages>({});
  const observedPagesRef = useRef<ObservedPages>({});
  const handleObservedState = useCallback(
    (pageId: string, state: Record<string, unknown>, actions: Record<string, unknown>) => {
      const prev = observedPagesRef.current[pageId];
      if (prev?.state === state && prev.actions === actions) return;
      const next = { ...observedPagesRef.current, [pageId]: { pageId, state, actions } };
      observedPagesRef.current = next;
      startTransition(() => setObservedPages(next));
    },
    []
  );

  // Print: one PDF page per editor page, in page order.
  const printPages = useCallback((): PrintExportPage[] => {
    const refs = canvasRefsRef.current;
    return refs.map((ref) => ({
      captureTile: async (tile, pixelRatio) =>
        (await ref.current?.capturePrintTile(tile, pixelRatio, PRINT_JPEG_QUALITY)) ?? null,
      getImages: () => ref.current?.getPrintImages() ?? [],
    }));
  }, [canvasRefsRef]);

  const printFormat = useMemo(() => {
    const f = getCanvasFormatOrDefault(formatId);
    return isPrintFormat(f) ? f : null;
  }, [formatId]);

  const handleDownloadPdf = useCallback(async () => {
    if (!printFormat) return;
    const pages = printPages();
    if (pages.some((_, i) => !canvasRefsRef.current[i]?.current)) {
      throw new Error('Nicht alle Seiten konnten exportiert werden');
    }
    const pdf = await exportPrintPdf({ format: printFormat, pages });
    const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
    await fileDelivery.downloadBlob(blob, printPdfFilename(documentTitle ?? null, filenamePrefix));
  }, [printFormat, printPages, canvasRefsRef, documentTitle, fileDelivery, filenamePrefix]);

  const isSlideDeck = useMemo(() => isSlideFormat(getCanvasFormatOrDefault(formatId)), [formatId]);
  const handleDownloadPptx = useCallback(
    async (onProgress: (done: number, total: number) => void) => {
      const blob = await buildPptx(onProgress);
      const filename = printPdfFilename(documentTitle ?? 'Präsentation', filenamePrefix).replace(
        /\.pdf$/,
        '.pptx'
      );
      await fileDelivery.downloadBlob(blob, filename);
    },
    [buildPptx, documentTitle, fileDelivery, filenamePrefix]
  );

  const handleDownloadSlidesPdf = useCallback(async () => {
    await ensureFontsReady();
    const images = await exportAllPages({ pixelRatio: SLIDES_PDF_PIXEL_RATIO });
    const pdf = await exportSlidesPdf(images);
    const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
    await fileDelivery.downloadBlob(
      blob,
      printPdfFilename(documentTitle ?? 'Präsentation', filenamePrefix)
    );
  }, [exportAllPages, documentTitle, fileDelivery, filenamePrefix]);

  // Every poster page should carry a filled-in V.i.S.d.P. / Impressum, whichever
  // page is active; the download warns (never blocks) once every page has reported.
  const impressumGate = usePrintImpressumGate(printFormat, pages, observedPages);

  const getPrintWarnings = useCallback(
    () => (printFormat ? lowResolutionWarnings(printFormat, printPages()) : []),
    [printFormat, printPages]
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
    let tabs = activeConfig.tabs;
    if (activeConfig.getVisibleTabs) {
      const visibleIds = activeConfig.getVisibleTabs(activeState, {
        selectedElement: activeSelectedElement,
      });
      tabs = activeConfig.tabs.filter((tab) => visibleIds.includes(tab.id));
    }
    // Mobile has room for six areas; the chat gives way to the Vorlagen there for now.
    if (isMobileWeb) tabs = tabs.filter((tab) => tab.id !== 'chat');
    return withEditorTabs(withLayersTab(tabs), availableEditorTabs);
  }, [activeConfig, activeState, activeSelectedElement, availableEditorTabs, isMobileWeb]);
  const configTabIds = useMemo(() => activeConfig?.tabs.map((tab) => tab.id) ?? [], [activeConfig]);

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
  const activeEditorTab = editorTabs.find((def) => def.tab.id === activeTab) ?? null;
  const panelTitle = activeEditorTab
    ? activeEditorTab.tab.label
    : activeTab === 'layers'
      ? layersTab.label
      : (activeTab && activeConfig?.tabs.find((tab) => tab.id === activeTab)?.label) || 'Auswahl';
  useMobileSheetFit({
    enabled: isMobileSheetOpen,
    zoom,
    pagesContainerRef,
    activePageRef: pageDomRefsRef.current[currentPageIndex],
  });

  // Share all pages via native share (Web Share API with multiple files)
  const shareAllPages = useCallback(async () => {
    const route = fileDelivery.pickShareRoute();
    if (route === null) return;
    let dataUrls: string[];
    try {
      dataUrls = await exportAllPages();
    } catch (error) {
      console.error('[CanvasEditor] share-all export failed:', error);
      return;
    }
    if (dataUrls.length === 0) return;

    if (route === 'native-host') {
      dataUrls.forEach((dataUrl, i) =>
        fileDelivery.shareDataUrlViaNativeHost(dataUrl, `${filenamePrefix}-seite-${i + 1}.png`, {
          title: shareTitle,
        })
      );
      return;
    }

    const files = await Promise.all(
      dataUrls.map(async (dataUrl, i) => {
        const blob = await (await fetch(dataUrl)).blob();
        return new File([blob], `${filenamePrefix}-seite-${i + 1}.png`, { type: 'image/png' });
      })
    );

    if (navigator.canShare?.({ files })) {
      await navigator.share({ files, title: shareTitle });
    } else {
      await navigator.share({ title: shareTitle });
    }
  }, [exportAllPages, fileDelivery, filenamePrefix, shareTitle]);

  // Share props for sidebar (used by share section)
  const shareProps = useMemo(
    () => ({
      exportedImage: null,
      autoSaveStatus: 'idle' as const,
      shareToken: null,
      onCaptureCanvas: () => {},
      captureCanvasImage: handleCaptureCanvas,
      captureCanvasImageForAi: handleCaptureCanvasForAi,
      rotateElement: (id: string, deg: number) =>
        canvasRefsRef.current[currentPageIndex]?.current?.rotateElement?.(id, deg) ?? false,
      collectAltTextPages,
      onDownload: async () => {
        const ref = canvasRefsRef.current[currentPageIndex];
        if (ref?.current) {
          await ensureFontsReady();
          const dataUrl = ref.current.toDataURL({ pixelRatio: 1 });
          if (dataUrl) {
            await fileDelivery.downloadDataUrl(
              dataUrl,
              `${filenamePrefix}-slider-seite-${currentPageIndex + 1}.png`
            );
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
      exportNotice: multiExportNotice,
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
      multiExportNotice,
      handleCaptureCanvas,
      handleCaptureCanvasForAi,
      collectAltTextPages,
      onSaveAsTemplate,
      fileDelivery,
      filenamePrefix,
    ]
  );

  // After a page switch or a deck replace there is one render before the new
  // page reports its state. The chat would unmount there and lose its running
  // turn (#4273), so it keeps rendering against the last reported page. So does
  // any tab while the new page shares the last one's config: a tile dropped on
  // another page would otherwise lose its panel (open category, its dragend).
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
    if (activeTab === 'layers') {
      return (
        <LayersSection
          layers={toolbarState?.layers ?? []}
          selectedIds={toolbarState?.selectedLayerIds ?? []}
          onSelect={handleLayerSelect}
          onActivate={handleLayerActivate}
          focusRequested={layersFocusRequested}
          onFocusHandled={handleLayersFocusHandled}
        />
      );
    }
    if (activeEditorTab) {
      const EditorTabSection = activeEditorTab.Section;
      return availableEditorTabs.includes(activeEditorTab) && specEdit ? (
        <EditorTabSection
          ref={activeEditorTab.takesPageDrops ? pageDropRef : undefined}
          formatId={formatId ?? DEFAULT_FORMAT_ID}
          pages={pages}
          deck={specEdit}
          onShowPage={showPage}
          canAddPage={canAddMore}
        />
      ) : null;
    }
    const last = lastSectionSourceRef.current;
    const source =
      sectionSource ?? (activeTab === 'chat' || last?.config === activeConfig ? last : null);
    if (!source) return null;

    const sectionConfig = source.config.sections[activeTab];
    if (!sectionConfig) return null;

    const SectionComponent = sectionConfig.component;
    const sectionProps = sectionConfig.propsFactory(source.state, source.actions, {
      selectedElement: source.selectedElement,
      ...shareProps,
      ...(specEdit && { specEdit }),
      background: source.config.background?.(source.state, source.actions) ?? null,
      chartColors: source.config.chartColors,
    });

    return (
      <Suspense fallback={sidebarLoadingFallback}>
        <SectionComponent {...sectionProps} />
      </Suspense>
    );
  }, [
    activeTab,
    sectionSource,
    activeConfig,
    shareProps,
    specEdit,
    activeEditorTab,
    availableEditorTabs,
    formatId,
    pages,
    showPage,
    canAddMore,
    toolbarState?.layers,
    toolbarState?.selectedLayerIds,
    handleLayerSelect,
    handleLayerActivate,
    layersFocusRequested,
    handleLayersFocusHandled,
  ]);

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

  // Derselbe Bildtext wie im Teilen-Abschnitt der Seitenleiste; Vorlagen ohne
  // ihn fallen auf die Überschrift zurück.
  const canvasText =
    shareImageText(activeConfig?.sections.share ?? null, activeState) ??
    ((activeState as Record<string, unknown> | null)?.headline as string) ??
    '';
  const canvasConfigId = pages[currentPageIndex]?.configId ?? '';
  const canvasWidth = activeConfig?.canvas.width ?? 1080;
  const canvasHeight = activeConfig?.canvas.height ?? 1080;

  const noop = useCallback(() => {}, []);
  const getPhotoCredit = useCallback(
    () => photoCreditLine(serializeDeck(pagesDoc).flatMap((page) => pagePhotoCredits(page.state))),
    [pagesDoc]
  );
  // Als String, damit Notiz-Tippen (neues `pages`) die Leiste nicht neu baut
  const deckLocale = deckLocaleOf(pages);
  const toolbarShareProps = useMemo(
    () => ({
      getPhotoCredit,
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
      exportError: multiExportError,
      exportNotice: multiExportNotice,
      onInvitePeople,
      onSaveAsTemplate,
      printExport: printFormat
        ? {
            onDownloadPdf: handleDownloadPdf,
            getWarnings: getPrintWarnings,
            impressum: impressumGate,
          }
        : null,
      slideDeck: isSlideDeck
        ? {
            onDownloadPdf: handleDownloadSlidesPdf,
            onDownloadPptx: handleDownloadPptx,
            locale: deckLocale,
          }
        : null,
    }),
    [
      getPhotoCredit,
      isSlideDeck,
      handleDownloadSlidesPdf,
      handleDownloadPptx,
      deckLocale,
      printFormat,
      impressumGate,
      handleDownloadPdf,
      getPrintWarnings,
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
      multiExportError,
      multiExportNotice,
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
      canUndo={canUndo}
      canRedo={canRedo}
      handlers={toolbarHandlers}
      shareProps={toolbarState && showShare ? toolbarShareProps : undefined}
      chromeLeft={chromeLeft}
      chromeCenter={chromeCenter}
      chromeRight={chromeRight}
      suggestionInBar={isMobileWeb}
      hostShare={
        hostChrome
          ? { open: hostChrome.shareOpen, onOpenChange: hostChrome.onShareOpenChange }
          : undefined
      }
    />
  ) : null;

  // Selection-driven formatting controls live outside the menu bar: a floating
  // card over the canvas (desktop); on mobile a bottom selection bar in the
  // area tab bar's slot plus a pill on the object, and — once the user opens
  // the selection's area — an "Auswahl" block at the top of the sheet.
  // Render only when the canvas has reported an actual element selection (not
  // merely because delete-page is available on a multi-page doc — page ops live
  // in the page toolbar / thumbnail strip). While an element is selected, the
  // delete-page action rides along only in the mobile sheet's "Auswahl" block;
  // in the desktop card it sat next to the element actions and deleted the
  // page instead of the element. Only one of the two bars is mounted per
  // viewport to avoid a hidden duplicate React tree.
  const backgroundControls =
    activeConfig?.background && activeState && activeActions
      ? activeConfig.background(activeState, activeActions)
      : null;
  const contextControlsProps = toolbarState
    ? {
        selectedElement: toolbarState.selectedElement ?? null,
        activeFloatingModule: toolbarState.activeFloatingModule ?? null,
        canMoveUp: toolbarState.canMoveUp ?? false,
        canMoveDown: toolbarState.canMoveDown ?? false,
        canDuplicate: toolbarState.canDuplicate ?? false,
        isCropping: toolbarState.isCropping ?? false,
        cropAspect: toolbarState.cropAspect,
        cropRotation: toolbarState.cropRotation,
        isExpanding: toolbarState.isExpanding,
        lockState: toolbarState.lockState,
        canLock: toolbarState.canLock,
        canAlign: toolbarState.canAlign,
        backgroundPickerRequest,
        handlers: {
          ...toolbarHandlers,
          onEditImage: () => setActiveTab('image-adjust'),
        },
        background: backgroundControls,
        // Boundary: page actions arrive as Record<string, unknown>.
        onRemoveUserImage:
          typeof activeActions?.removeUserImage === 'function'
            ? (activeActions.removeUserImage as (id: string) => void)
            : undefined,
        onDeselect: handleDeselectAll,
      }
    : null;
  const hasContextControls =
    contextControlsProps !== null &&
    (contextControlsProps.selectedElement !== null ||
      contextControlsProps.activeFloatingModule !== null);
  // An open suggestion locks the pages (see the container below); the card
  // takes the selection bar's place so the lock never looks like a dead click.
  const contextBarElement = isMobileWeb ? null : hasPendingSuggestion ? (
    <FloatingAiSuggestionBanner
      variant="card"
      onUndo={toolbarHandlers.undo}
      onUndoPages={toolbarHandlers.undoPages}
    />
  ) : contextControlsProps && hasContextControls ? (
    <ContextToolbar
      {...contextControlsProps}
      canDelete={toolbarState?.canDelete ?? false}
      onDeleteElement={toolbarHandlers.handleDeleteElement}
    />
  ) : toolbarState && toolbarState.selectionCount > 1 ? (
    // Not part of `hasContextControls`: mobile would show its selection bar.
    <MultiSelectionToolbar
      count={toolbarState.selectionCount}
      canCopy={toolbarState.canCopy}
      canDelete={toolbarState.canDelete}
      lockState={toolbarState.lockState}
      canLock={toolbarState.canLock}
      canAlign={toolbarState.canAlign}
      canDistribute={toolbarState.canDistribute}
      onCommand={toolbarHandlers.runCommand}
      canFlip={toolbarState.canFlip}
      onFlip={toolbarHandlers.handleFlip}
      onCopy={toolbarHandlers.handleCopy}
      onDuplicate={toolbarHandlers.handleDuplicate}
      onToggleLock={toolbarHandlers.handleToggleLock}
      onDelete={toolbarHandlers.handleDeleteElement}
      onDeselect={handleDeselectAll}
    />
  ) : null;
  const mobileSelectionElement =
    contextControlsProps && hasContextControls && isMobileWeb && isPanelOpen ? (
      <MobileSelectionControls {...contextControlsProps} onDeletePage={toolbarOnDelete} />
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
  // A multi-selection has no selection bar on phones; the pill is its only
  // door to the selection's commands.
  const isMultiSelection = (toolbarState?.selectionCount ?? 0) > 1;
  // Im Zuschneide-Modus gelten nur Abbrechen und Fertig; die Pille würde das Restbild verdecken.
  const selectionPill =
    toolbarState &&
    !toolbarState.isCropping &&
    ((showMobileSelection && toolbarState.selectedElement) ||
      (isMultiSelection && isMobileWeb && !isPanelOpen)) ? (
      <MobileSelectionPill
        measureKey={isMultiSelection ? toolbarState : toolbarState.activeFloatingModule}
        zoom={zoom}
        getBox={getSelectionBox}
        subscribeManipulation={subscribeManipulation}
        canDuplicate={toolbarState.canDuplicate ?? false}
        canDelete={toolbarState.canDelete ?? false}
        onDuplicate={toolbarHandlers.handleDuplicate}
        onDelete={toolbarHandlers.handleDeleteElement}
        onMore={isMultiSelection ? undefined : openSelectionArea}
        isLocked={toolbarState.lockState === 'all'}
        onUnlock={toolbarHandlers.handleToggleLock}
        onFlip={isMultiSelection && toolbarState.canFlip ? toolbarHandlers.handleFlip : undefined}
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
  // Ein Viewer blättert, fügt aber nichts an: ohne Knöpfe bleibt der Streifen Navigation.
  const canAddPages = canAddMore && !readOnly;
  const currentTemplateId = pages[currentPageIndex]?.configId;
  const PagePicker = pagePicker?.Picker;
  const renderAddPicker = useMemo<PagePickerSlot | null>(
    () =>
      PagePicker
        ? (open) => (
            <PagePicker
              {...open}
              mode="add"
              currentTemplateId={currentTemplateId}
              activeTemplateId={currentTemplateId}
              pages={pages}
              formatId={formatId}
              onSelectTemplate={handleAddPage}
              addPage={addPage}
              onDuplicateCurrent={duplicateCurrentPage}
            />
          )
        : null,
    [PagePicker, currentTemplateId, pages, formatId, handleAddPage, addPage, duplicateCurrentPage]
  );
  const handleAddPageLikeCurrent = useCallback(() => {
    if (currentTemplateId) void handleAddPage(currentTemplateId);
  }, [currentTemplateId, handleAddPage]);

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
      canAddMore={canAddPages}
      onSelect={handleThumbnailSelect}
      onAddPage={handleAddPage}
      quickAddOpensPicker={pagePicker?.quickAddOpensPicker?.(pages) ?? false}
      renderPicker={renderAddPicker}
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
          {canAddPages && (
            <div className={cn('w-fit px-1.5 py-1', bottomBarGroup)}>
              <AddPageButton
                onAddPage={handleAddPageLikeCurrent}
                renderPicker={renderAddPicker}
                disabled={!renderAddPicker && !currentTemplateId}
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
    <AnnouncerContext.Provider value={announcer}>
      <CanvasAnnouncer message={liveMessage} />
      <ShellProvider
        pages={pages}
        currentPageIndex={currentPageIndex}
        formatId={formatId}
        canvasRefsRef={canvasRefsRef}
        configTabIds={configTabIds}
      >
        <UserUploadsProvider>
          {/* Die Text-Bearbeitung sitzt an der Wurzel des Editors, nicht je Seite:
            nur so liegt sie über der Kontextleiste, die ihre Formatierungsknöpfe
            zeigt. Der Provider in `CanvasStage` merkt, dass er einen über sich
            hat, und reicht durch. Ob die Leiste die Knöpfe wirklich übernimmt,
            meldet sie selbst an — wo wir sie nicht rendern, zeigt das Overlay
            wieder seine eigene Karte. */}
          <CanvasTextEditorProvider>
            {!isPreview && !readOnly && !hasPendingSuggestion && (
              // Der erste Tab-Halt des Editors: unsichtbar, bis er den Fokus hat.
              // Solange ein KI-Vorschlag offen ist, ist die Seitenleiste inert —
              // der Sprung ginge ins Leere, also gibt es ihn dann nicht.
              <button
                type="button"
                onClick={handleSkipToLayers}
                className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[400] focus:flex focus:min-h-8 focus:items-center focus:rounded-md focus:border focus:border-[var(--editor-border-strong)] focus:bg-[var(--editor-surface)] focus:px-3 focus:text-[length:var(--font-size-small)] focus:font-semibold focus:text-[var(--editor-text)] focus:shadow-md outline-none kbd:focus-visible:outline-2 kbd:focus-visible:outline-solid kbd:focus-visible:outline-offset-2 kbd:focus-visible:outline-[var(--editor-accent)]"
              >
                {t.shell.skipToLayers}
              </button>
            )}
            <CanvasEditorLayout
              // Vorschau vor dem Sync: zeigen, aber nichts anbieten, was schreibt —
              // die Seiten hängen noch an keinem Y.Map, jede Änderung ginge verloren.
              // Ein Viewer ebenso: der Server verwirft seine Schreibzugriffe.
              sidebar={
                isPreview || readOnly ? null : hasPendingSuggestion ? (
                  <div inert className="contents">
                    {panel}
                  </div>
                ) : (
                  panel
                )
              }
              tabBar={isPreview || readOnly ? null : tabBar}
              actions={null}
              toolbar={toolbarElement}
              contextBar={isPreview || readOnly ? null : contextBarElement}
              // Die Desktop-Leiste ist auf dem Handy per CSS ausgeblendet; gar
              // nicht erst mitgeben, sonst hinge der Streifen zweimal im Baum.
              bottomBar={isMobileWeb || isPreview ? null : bottomBar}
              // Auf dem Handy scrollt ein Finger auf dem Sharepic nicht (wie in
              // Canva) — die Seiten wechselt dort dieser Streifen.
              mobilePageStrip={isMobileWeb && !isMobileSheetOpen && !isPreview ? pageStrip : null}
              mobileZoomControl={
                isMobileWeb && !isMobileSheetOpen && !isPreview ? (
                  <CanvasZoomIndicator zoom={zoom} onZoomChange={setZoom} />
                ) : null
              }
              mobileSheetOpen={isMobileSheetOpen}
              onCanvasBackdropPointerDown={isMobileSheetOpen ? handlePanelClose : undefined}
            >
              <div
                inert={isPreview || hasPendingSuggestion}
                aria-busy={isPreview}
                ref={pagesContainerCallbackRef}
                onPointerDown={handleWorkAreaPointerDown}
                className={cn(
                  'heterogeneous-multipage__pages-container has-bottom-bar flex flex-col items-center gap-md p-sm pb-lg w-full max-canvas-mobile:gap-sm max-canvas-mobile:p-xs',
                  hasPendingSuggestion && 'opacity-60 transition-opacity duration-200'
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
                      formatId={formatId}
                      isActive={isActive}
                      canDelete={canDelete}
                      canvasRef={canvasRefsRef.current[index]}
                      pageRef={pageDomRefsRef.current[index]}
                      onSelect={handlePageSelect}
                      onDelete={removePage}
                      onMovePage={movePage}
                      onDuplicatePage={duplicatePage}
                      onChangeTemplate={PagePicker ? handleOpenTemplateChange : undefined}
                      onDropVorlage={takesPageDrops && !readOnly ? handleDropVorlage : undefined}
                      onExport={handleExport}
                      onCancel={onCancel}
                      callbacks={getCallbacksForPage(page.id, page.configId)}
                      multiPageExport={index === 0 ? multiPageExportProps : undefined}
                      onStateChange={handlePageStateChange}
                      onObservedState={
                        printService && needsImpressum(printFormat)
                          ? handleObservedState
                          : undefined
                      }
                      onToolbarStateChange={
                        isActive && !isPreview ? handleToolbarStateChange : undefined
                      }
                      onAutoSaveShareToken={onAutoSaveShareToken}
                      autoSave={false}
                      pageBinding={pageBindingAt(index, page.id, isActive)}
                      readOnly={readOnly}
                    />
                  );
                })}

                {noPageRenderable && <CanvasPageSkeleton aspectRatio={pageAspectRatio} />}

                {templateChangePage && PagePicker && (
                  <PagePicker
                    isOpen
                    mode="replace"
                    anchorRef={pageDomRefsRef.current[templateChangePage.index]}
                    onSelectTemplate={handleSelectTemplateChange}
                    onClose={handleCloseTemplateChange}
                    currentTemplateId={templateChangePage.configId}
                    activeTemplateId={currentTemplateId}
                    pages={pages}
                    formatId={formatId}
                  />
                )}

                {isSlideFormat(format) && !isPreview && pages[currentPageIndex] && (
                  <SlideNotesPanel
                    value={
                      typeof pages[currentPageIndex].state.notes === 'string'
                        ? pages[currentPageIndex].state.notes
                        : ''
                    }
                    onChange={(notes) => updatePageState(pages[currentPageIndex].id, { notes })}
                    readOnly={readOnly}
                  />
                )}
                {/* Seite hinzufügen unter der Fläche — für den Fall, in dem die
                  untere Leiste den Knopf nicht trägt: unterhalb von 900 px, wo
                  `CanvasEditorLayout` sie per `max-canvas-mobile:hidden`
                  ausblendet. Die Breakpoint-Bedingung steht hier gespiegelt, weil
                  nur CSS sie kennt. Er liegt im skalierten Seiten-Container und
                  skaliert sich mobil zurück, sonst schrumpfte er mit Fit und Zoom
                  unter 44 pt. */}
                {canAddPages && !showPageStrip && (
                  <div className="w-full max-w-[28rem] pt-sm max-canvas-mobile:pt-xs max-canvas-mobile:px-xs max-canvas-mobile:origin-top max-canvas-mobile:[scale:calc(1/var(--canvas-total-scale,1))] canvas-mobile:hidden">
                    <AddPageButton
                      onAddPage={handleAddPageLikeCurrent}
                      renderPicker={renderAddPicker}
                      disabled={!canAddMore || (!renderAddPicker && !currentTemplateId)}
                    />
                  </div>
                )}
              </div>
            </CanvasEditorLayout>
            {selectionPill}
            {!isMobileWeb && !isPreview && !readOnly && (
              <CanvasContextMenu handleRef={contextMenuRef} closeKey={zoom} />
            )}
          </CanvasTextEditorProvider>
        </UserUploadsProvider>
      </ShellProvider>
    </AnnouncerContext.Provider>
  );
}

export type {
  CanvasEditorProps,
  PageWrapperProps,
} from '@ggraphic/editor/components/CanvasEditor/types';

export default CanvasEditorShell;

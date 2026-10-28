// SPDX-License-Identifier: MPL-2.0
import type { SidebarTabId } from '@ggraphic/editor/sidebar/types';
import type {
  GenericCanvasRef,
  ToolbarStateReport,
} from '@ggraphic/editor/components/GenericCanvas';
import type { FullCanvasConfig } from '@ggraphic/editor/configs/types';
import type { InitialPageDef } from '@ggraphic/editor/hooks/usePageManager';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type React from 'react';
import type * as Y from 'yjs';

/** `TConfigId`: the host's template ids (`registerTemplates`). */
export interface CanvasEditorProps<TConfigId extends string = string> {
  initialConfigId: TConfigId;
  /** The canvas document's format id. Absent: the default format. */
  formatId?: string;
  /** Document title; names the print PDF (`<title>.pdf`). */
  documentTitle?: string;
  initialProps: Record<string, unknown>;
  onExport: (base64: string) => void;
  onCancel: () => void;
  /**
   * Fired with the rendered image whenever the user downloads the current
   * page. Unlike onExport (a flow-level "done" callback with host side
   * effects), this is a pure observation hook — e.g. collab hosts reuse the
   * download image as a fresh document thumbnail.
   */
  onDownload?: (base64: string) => void;
  callbacks?: Record<string, (val: unknown) => void>;
  maxPages?: number;
  /** Pre-populated pages — overrides single-page initialization when provided */
  initialPages?: InitialPageDef[];
  /**
   * Collaborative mode — fed into usePageManager to back the pages list with
   * a Yjs doc, and used to derive each page's Y.Map for config sync.
   */
  collaborative?: {
    ydoc: Y.Doc;
    isSynced: boolean;
    /** Hocuspocus provider — enables awareness features (remote selections). */
    provider?: HocuspocusProvider | null;
    /** Show the initial pages, read-only, until the doc has synced (fresh canvas only). */
    previewBeforeSync?: boolean;
    /** The doc holds the local cache: show its pages, read-only, until the sync. */
    isLocalLoaded?: boolean;
  };
  /** Host-supplied content rendered at the very left of the toolbar (in-flow). */
  chromeLeft?: React.ReactNode;
  /** Host-supplied content rendered absolute-centered in the toolbar (e.g. doc title, sync badge). */
  chromeCenter?: React.ReactNode;
  /** Host-supplied content rendered in the toolbar's right cluster (e.g. presence avatars). */
  chromeRight?: React.ReactNode;
  /**
   * When provided, the share popover shows a "Personen" entry that triggers
   * this callback. Used by collab hosts to open their invite/permissions dialog.
   */
  onInvitePeople?: () => void;
  /**
   * When provided, the share surfaces show a "Vorlage" entry that triggers
   * this callback. The host owns the template flow — it knows the document
   * identity (canvas id, collab doc) this package deliberately doesn't.
   * Without it the entry is hidden.
   */
  onSaveAsTemplate?: () => void;
  /**
   * Collab mode only: fired with a fresh stage render after local edits
   * settle (debounced) and when the tab is hidden. Hosts use it to keep the
   * document thumbnail current — without it the gallery/recents preview only
   * refreshes on download.
   */
  onCollabSnapshot?: (base64: string) => void;
  /**
   * Seeds the per-instance AutoSaveStore with a known share token, e.g. when
   * the editor is opened against an existing share via URL. Without this seed,
   * the first save after a page reload creates a new draft instead of updating.
   */
  initialShareToken?: string | null;
  /**
   * Called when the auto-save creates or adopts a share token. Hosts use this
   * to remember the token across editor remounts (and to keep their own save
   * paths updating the same share instead of creating duplicate drafts).
   */
  onAutoSaveShareToken?: (token: string) => void;
  /**
   * Sidebar tab open on the first render. Hosts that remember the tab per
   * document (e.g. the chat after a reload) seed it here; read once.
   * Ignored on mobile, where an open tab covers the canvas as a sheet.
   */
  initialTab?: SidebarTabId | null;
  /** Fired whenever the open sidebar tab changes, including on mount. Desktop only. */
  onActiveTabChange?: (tab: SidebarTabId | null) => void;
  /**
   * Local mode only: false keeps the editor out of the gallery — a host that
   * saves the result itself (the sticker creator) would otherwise leave a
   * draft behind for every attempt. Default true.
   */
  galleryAutoSave?: boolean;
  /** False hides the toolbar's share/download menu, for a host with its own way out. Default true. */
  showShare?: boolean;
  /** Lets the host render the active page itself, e.g. to save it somewhere else. */
  exportApiRef?: React.Ref<CanvasEditorExportApi>;
  /**
   * The host draws the menu bar itself (the mobile app's native header). The
   * editor then renders no bar of its own: undo/redo run through
   * `exportApiRef`, and the share menu opens on the host's request.
   */
  hostChrome?: CanvasEditorHostChrome;
  /** A viewer's session: view, page, download and present, but nothing offers a write the server would drop. */
  readOnly?: boolean;
}

/** See `CanvasEditorProps.hostChrome`. */
export interface CanvasEditorHostChrome {
  /** Fired whenever undo or redo becomes (un)available; both false while an AI suggestion waits. */
  onHistoryChange: (history: { canUndo: boolean; canRedo: boolean }) => void;
  /** The share menu, opened from the host's bar and anchored at the top right. */
  shareOpen: boolean;
  onShareOpenChange: (open: boolean) => void;
}

/** What `exportApiRef` exposes to the host. */
export interface CanvasEditorExportApi {
  /** The active page as a PNG data URL; null when it is not mounted. */
  captureActivePage: (options?: {
    pixelRatio?: number;
    transparent?: boolean;
  }) => Promise<string | null>;
  /** Every page as a PNG data URL, in page order; throws when a page cannot be rendered. */
  capturePages: (options?: { pixelRatio?: number }) => Promise<string[]>;
  /** The deck as an editable .pptx; throws when a page cannot be rendered. */
  exportPptx: () => Promise<Blob>;
  /** The deck as a Vorlage stores it: config and state per page. */
  getPages: () => { configId: string; state: Record<string, unknown> }[];
  /** The menu bar's undo/redo, for a host that draws the bar itself. */
  undo: () => void;
  redo: () => void;
}

export interface PageWrapperProps {
  page: { id: string; configId: string; state: Record<string, unknown> };
  index: number;
  pageCount: number;
  config: FullCanvasConfig;
  formatId?: string;
  isActive: boolean;
  canDelete: boolean;
  canvasRef: React.RefObject<GenericCanvasRef | null>;
  onSelect: (index: number) => void;
  onDelete: (id: string) => void;
  onMovePage: (id: string, direction: 'up' | 'down') => void;
  onDuplicatePage: (id: string) => void;
  /** Opens the template picker in replace mode for this page ("Vorlage ändern"). */
  onChangeTemplate?: (id: string) => void;
  /** A Vorlagen tile dropped on this page; unset where the design has no Vorlagen tab. */
  onDropVorlage?: (id: string, pageId: string) => void;
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
  /** Reports this page's live state even while it is not the active page (print impressum gate). */
  onObservedState?: (
    pageId: string,
    state: Record<string, unknown>,
    actions: Record<string, unknown>
  ) => void;
  onToolbarStateChange?: (state: ToolbarStateReport) => void;
  /** See CanvasEditorProps.onAutoSaveShareToken. */
  onAutoSaveShareToken?: (token: string) => void;
  /**
   * Per-page (single-page) gallery autosave. Explicit because the page always
   * has a Y.Map binding now — presence of the binding no longer implies collab.
   */
  autoSave?: boolean;
  /**
   * Per-page Y.Map binding for config/state. Set on every page in both
   * modes; `provider` is only present in collab mode.
   */
  pageBinding?: {
    pageYMap: Y.Map<unknown>;
    isSynced: boolean;
    /** Hocuspocus provider — enables awareness features (remote selections). */
    provider?: HocuspocusProvider | null;
    /** Id of this page, published to awareness so peers can filter selections per page. */
    pageId?: string | null;
    /** Only the active page publishes its selection to awareness. */
    publishSelection?: boolean;
  };
  /** Forwarded ref to the wrapper div — used for scroll-into-view */
  pageRef?: React.Ref<HTMLDivElement>;
  /** See CanvasEditorProps.readOnly. */
  readOnly?: boolean;
}

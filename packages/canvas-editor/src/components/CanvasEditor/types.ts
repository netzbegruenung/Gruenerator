import type React from 'react';

import type { GenericCanvasRef, ToolbarStateReport } from '../GenericCanvas';
import type { CanvasConfigId, FullCanvasConfig } from '../../configs/types';
import type { MobileBridgeProps } from '../../hooks/useMobileBridge';
import type { InitialPageDef } from '../../hooks/usePageManager';

export interface CanvasEditorProps {
  initialConfigId: CanvasConfigId;
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
    /** Hocuspocus provider — enables awareness features (remote selections). */
    provider?: import('@hocuspocus/provider').HocuspocusProvider | null;
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
}

export interface PageWrapperProps {
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
  /** Opens the template picker in replace mode for this page ("Vorlage ändern"). */
  onChangeTemplate?: (id: string) => void;
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
  /** See CanvasEditorProps.onAutoSaveShareToken. */
  onAutoSaveShareToken?: (token: string) => void;
  /**
   * Per-page (single-page) gallery autosave. Explicit because the page always
   * has a Y.Map binding now — presence of the binding no longer implies collab.
   */
  autoSave?: boolean;
  /**
   * Per-page Y.Map binding for layers/config/state. Set on every page in both
   * modes; `provider` is only present in collab mode.
   */
  pageBinding?: {
    pageYMap: import('yjs').Map<unknown>;
    isSynced: boolean;
    /** Hocuspocus provider — enables awareness features (remote selections). */
    provider?: import('@hocuspocus/provider').HocuspocusProvider | null;
    /** Id of this page, published to awareness so peers can filter selections per page. */
    pageId?: string | null;
    /** Only the active page publishes its selection to awareness. */
    publishSelection?: boolean;
  };
  /** Forwarded ref to the wrapper div — used for IntersectionObserver tracking */
  pageRef?: React.Ref<HTMLDivElement>;
}

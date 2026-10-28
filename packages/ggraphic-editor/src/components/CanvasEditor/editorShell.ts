// SPDX-License-Identifier: MPL-2.0
import type {
  CanvasEditorServices,
  CanvasSpecEditBridge,
} from '@ggraphic/editor/CanvasEditorProvider';
import type { GenericCanvasRef } from '@ggraphic/editor/components/GenericCanvas';
import type { HeterogeneousPage } from '@ggraphic/editor/configs/types';
import type { PrintCanvasFormat } from '@ggraphic/editor/formats/index';
import type { SidebarTab, SidebarTabId } from '@ggraphic/editor/sidebar/types';
import type React from 'react';

/** Lets the editor hand a tile dropped on a page (`isVorlageDrag`) to the open tab. */
export interface EditorTabDropHandle {
  drop: (id: string, pageId: string) => void;
}

/** What a document tab's section gets: the whole deck, not the active page's state. */
export interface EditorTabSectionProps {
  ref?: React.Ref<EditorTabDropHandle>;
  formatId: string;
  pages: readonly HeterogeneousPage[];
  /** Live page reads and the one-step deck change. */
  deck: CanvasSpecEditBridge;
  /** Brings a page into view, also one the deck does not hold yet. */
  onShowPage: (pageId: string) => void;
  /** False once the design holds as many pages as it may. */
  canAddPage: boolean;
}

/**
 * A tab that acts on the whole document, so the editor adds it itself instead
 * of every template config listing it (like the core's „Ebenen"). It needs
 * the deck bridge: without `replaceDeck` the editor shows none of them.
 */
export interface EditorTabDefinition {
  tab: SidebarTab;
  /** Where the tab goes among the active page's tabs, „Ebenen" already appended. */
  insertAt: (tabs: readonly SidebarTab[]) => number;
  /** Whether this document shows the tab. */
  isAvailable: (ctx: { services: CanvasEditorServices; formatId: string | undefined }) => boolean;
  /** The section takes tiles dropped onto a page, through its `ref`. */
  takesPageDrops?: boolean;
  Section: React.ComponentType<EditorTabSectionProps>;
}

/** What the host's provider around the editor sees of it. */
export interface EditorShellProviderProps {
  pages: readonly { configId: string }[];
  currentPageIndex: number;
  formatId: string | undefined;
  canvasRefsRef: React.MutableRefObject<React.RefObject<GenericCanvasRef | null>[]>;
  /** Every tab the active page's config lists, hidden ones included; empty while it loads. */
  configTabIds: readonly SidebarTabId[];
  children: React.ReactNode;
}

/** Appends a page; `inheritBackground` carries the active page's background over. */
export type EditorAddPage = (
  configId: string,
  inheritBackground: boolean,
  state?: Record<string, unknown>
) => Promise<void>;

/** What the host's page picker gets: the „Seite hinzufügen" menu and „Vorlage ändern". */
export interface EditorPagePickerProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** `add` appends a page of the picked template, `replace` converts the page. */
  mode: 'add' | 'replace';
  /** The template of the page the picker acts on. */
  currentTemplateId: string | undefined;
  /** The template of the active page. */
  activeTemplateId: string | undefined;
  pages: readonly HeterogeneousPage[];
  formatId: string | undefined;
  onSelectTemplate: (configId: string) => void;
  /** `add` only: for pages the picker builds itself (variants, layouts). */
  addPage?: EditorAddPage;
  onDuplicateCurrent?: () => void;
}

export interface EditorPagePicker {
  Picker: React.ComponentType<EditorPagePickerProps>;
  /** „+" opens the picker instead of adding a page like the active one. */
  quickAddOpensPicker?: (pages: readonly HeterogeneousPage[]) => boolean;
}

/** What a page last reported, for the host's print checks (the Impressum gate). */
export interface ObservedPageState {
  pageId: string;
  state: Record<string, unknown>;
  actions: Record<string, unknown>;
}

/** The latest report per page id; reports from removed pages are ignored. */
export type ObservedPages = Readonly<Record<string, ObservedPageState>>;

export type EditorDownloadChoice = 'png' | 'jpeg' | 'webp';

/** The share menu's inputs as the editor has them: exports, page count, the image text. */
export interface EditorToolbarShare {
  onCaptureCanvas: () => Promise<string | null>;
  onDownload: (
    format: EditorDownloadChoice,
    pixelRatio: number,
    transparent: boolean
  ) => void | Promise<void>;
  onNavigateToGallery: () => void;
  canvasText: string;
  canvasType: string;
  canvasWidth: number;
  canvasHeight: number;
  shareToken: string | null;
  pageCount: number;
  onDownloadAllZip: (format?: EditorDownloadChoice) => Promise<void>;
  onShareAllPages: () => Promise<void>;
  isMultiExporting: boolean;
  exportProgress: { current: number; total: number };
  exportError: string | null;
  exportNotice: string | null;
  onInvitePeople?: () => void;
  onSaveAsTemplate?: () => void;
  getPhotoCredit: () => string;
  /** Print formats: the print PDF. `format` and the observed pages feed the host's Impressum gate. */
  printExport: {
    onDownloadPdf: () => Promise<void>;
    getWarnings: () => string[];
    format: PrintCanvasFormat;
  } | null;
  /** Slide formats: PowerPoint and a PDF of all pages. */
  slideDeck: {
    onDownloadPdf: () => Promise<void>;
    onDownloadPptx: (onProgress: (done: number, total: number) => void) => Promise<void>;
  } | null;
}

/** What the host's menu bar gets. */
export interface EditorToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  handlers: {
    undo: () => void;
    /** Page-level undo, for a suggestion that replaced the deck. */
    undoPages: () => void;
    redo: () => void;
  };
  /** Null: no share menu. */
  share: EditorToolbarShare | null;
  pages: HeterogeneousPage[];
  /** Each page's last report; collected only for formats that carry an Impressum. */
  observedPages: ObservedPages;
  chromeLeft?: React.ReactNode;
  chromeCenter?: React.ReactNode;
  chromeRight?: React.ReactNode;
  /** Mobile: the pending-suggestion banner lives in the bar. */
  suggestionInBar: boolean;
  /** The host draws the bar; the share menu opens on its request. */
  hostShare?: { open: boolean; onOpenChange: (open: boolean) => void };
}

export interface EditorShellExtensions {
  /** Document tabs, inserted in this order. */
  tabs?: readonly EditorTabDefinition[];
  /** Wraps the editor: contexts for the host's sections and pages, idle warm-ups. */
  Provider?: React.ComponentType<EditorShellProviderProps>;
  /** The menu bar (undo/redo, share). Without one the editor shows none. */
  Toolbar?: React.ComponentType<EditorToolbarProps>;
  /** The page picker. Without one, „Seite hinzufügen" adds a page like the active one. */
  pagePicker?: EditorPagePicker;
  /**
   * The state keys a template's host callbacks (`on<Key>Change`) are declared
   * for; each page writes them into its state too. Default: none.
   */
  pageCallbackKeys?: (configId: string) => readonly string[];
}

/**
 * A module-level registry like the kind renderers: the host installs it once
 * at startup, before the editor renders. Without a host the editor has only
 * the tabs its configs list, plus „Ebenen".
 */
let registered: EditorShellExtensions = {};

/** The host's document tabs and provider; replaces the ones before. */
export function registerEditorShell(extensions: EditorShellExtensions): void {
  registered = extensions;
}

export function registeredEditorShell(): EditorShellExtensions {
  return registered;
}

/** `tabs` with each available document tab inserted where it wants to go. */
export function withEditorTabs(
  tabs: readonly SidebarTab[],
  available: readonly EditorTabDefinition[]
): SidebarTab[] {
  return available.reduce<SidebarTab[]>(
    (acc, def) => {
      const at = def.insertAt(acc);
      return [...acc.slice(0, at), def.tab, ...acc.slice(at)];
    },
    [...tabs]
  );
}

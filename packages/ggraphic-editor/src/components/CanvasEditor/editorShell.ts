// SPDX-License-Identifier: MPL-2.0
import type {
  CanvasEditorServices,
  CanvasSpecEditBridge,
} from '@ggraphic/editor/CanvasEditorProvider';
import type { GenericCanvasRef } from '@ggraphic/editor/components/GenericCanvas';
import type { HeterogeneousPage } from '@ggraphic/editor/configs/types';
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

export interface EditorShellExtensions {
  /** Document tabs, inserted in this order. */
  tabs?: readonly EditorTabDefinition[];
  /** Wraps the editor: contexts for the host's sections and pages, idle warm-ups. */
  Provider?: React.ComponentType<EditorShellProviderProps>;
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

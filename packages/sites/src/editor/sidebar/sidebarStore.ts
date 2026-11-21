import { create } from 'zustand';

/** The rail's tabs, in rail order. */
export const SIDEBAR_TAB_IDS = [
  'bausteine',
  'seite',
  'design',
  'einstellungen',
  'impressum',
] as const;
export type SidebarTabId = (typeof SIDEBAR_TAB_IDS)[number];

/** What the panel shows: a rail tab, or the form of the block selected on the page. */
export type SidebarPanelId = SidebarTabId | 'block';

interface SidebarState {
  panel: SidebarPanelId | null;
  open: (panel: SidebarPanelId) => void;
  /** A rail tab: opens it, or closes the panel when it is already open. */
  toggleTab: (tab: SidebarTabId) => void;
  close: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  panel: null,
  open: (panel) => set({ panel }),
  toggleTab: (tab) => set((s) => ({ panel: s.panel === tab ? null : tab })),
  close: () => set({ panel: null }),
}));

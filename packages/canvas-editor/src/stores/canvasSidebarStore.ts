import { create } from 'zustand';

import type { ReactNode } from 'react';
import type { SidebarTab, SidebarTabId } from '../sidebar/types';

export interface CanvasSidebarState {
  isActive: boolean;
  tabs: SidebarTab[];
  activeTab: SidebarTabId | null;
  disabledTabs: SidebarTabId[];
  onTabClick: ((tabId: SidebarTabId) => void) | null;
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error' | null;
  panelContent: ReactNode | null;
  mobileSubsections: Array<{ id: string; label: string }>;
  activeMobileSubsection: string | null;
  onMobileSubsectionClick: ((id: string) => void) | null;

  activate: (data: {
    tabs: SidebarTab[];
    activeTab: SidebarTabId | null;
    disabledTabs: SidebarTabId[];
    onTabClick: (tabId: SidebarTabId) => void;
  }) => void;
  update: (
    data: Partial<
      Pick<
        CanvasSidebarState,
        | 'tabs'
        | 'activeTab'
        | 'disabledTabs'
        | 'autoSaveStatus'
        | 'panelContent'
        | 'mobileSubsections'
        | 'activeMobileSubsection'
        | 'onMobileSubsectionClick'
      >
    >
  ) => void;
  deactivate: () => void;
}

export const useCanvasSidebarStore = create<CanvasSidebarState>((set) => ({
  isActive: false,
  tabs: [],
  activeTab: null,
  disabledTabs: [],
  onTabClick: null,
  autoSaveStatus: null,
  panelContent: null,
  mobileSubsections: [],
  activeMobileSubsection: null,
  onMobileSubsectionClick: null,

  activate: (data) =>
    set({
      isActive: true,
      tabs: data.tabs,
      activeTab: data.activeTab,
      disabledTabs: data.disabledTabs,
      onTabClick: data.onTabClick,
    }),

  update: (data) => set((state) => ({ ...state, ...data })),

  deactivate: () =>
    set({
      isActive: false,
      tabs: [],
      activeTab: null,
      disabledTabs: [],
      onTabClick: null,
      autoSaveStatus: null,
      panelContent: null,
      mobileSubsections: [],
      activeMobileSubsection: null,
      onMobileSubsectionClick: null,
    }),
}));

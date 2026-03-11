import { create } from 'zustand';

import type {
  HistoryState,
  SelectedElementInfo,
  SidebarTabId,
  SubsectionInfo,
  TabInfo,
  ToolbarAction,
} from '../components/canvas-editor/types';

interface CanvasEditorBridgeState {
  // State flowing from DOM → Native
  selectedElement: SelectedElementInfo | null;
  history: HistoryState;
  tabs: TabInfo[];
  activeTab: SidebarTabId | null;
  subsections: SubsectionInfo[];
  activeSubsection: string | null;

  // State flowing from Native → DOM (action dispatch)
  pendingAction: ToolbarAction | null;
  actionCounter: number;

  // Actions
  setSelectedElement: (info: SelectedElementInfo | null) => void;
  setHistory: (state: HistoryState) => void;
  setTabs: (tabs: TabInfo[]) => void;
  setActiveTab: (tabId: SidebarTabId | null) => void;
  setSubsections: (subs: SubsectionInfo[]) => void;
  setActiveSubsection: (id: string | null) => void;
  dispatchAction: (action: ToolbarAction) => void;
  clearPendingAction: () => void;
}

export const useCanvasEditorBridgeStore = create<CanvasEditorBridgeState>((set) => ({
  selectedElement: null,
  history: { canUndo: false, canRedo: false },
  tabs: [],
  activeTab: null,
  subsections: [],
  activeSubsection: null,
  pendingAction: null,
  actionCounter: 0,

  setSelectedElement: (info) => set({ selectedElement: info }),
  setHistory: (state) => set({ history: state }),
  setTabs: (tabs) => set({ tabs }),
  setActiveTab: (tabId) => set({ activeTab: tabId }),
  setSubsections: (subs) => set({ subsections: subs, activeSubsection: subs[0]?.id ?? null }),
  setActiveSubsection: (id) =>
    set((s) => ({ activeSubsection: s.activeSubsection === id ? null : id })),
  dispatchAction: (action) =>
    set((s) => ({ pendingAction: action, actionCounter: s.actionCounter + 1 })),
  clearPendingAction: () => set({ pendingAction: null }),
}));

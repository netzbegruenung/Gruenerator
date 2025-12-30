import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';

export interface Tab {
  id: string;
  title: string;
  route: string;
  isDirty: boolean;
  isLoading: boolean;
  createdAt: number;
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
  draggedTabId: string | null;
  maxTabs: number;
}

interface TabsActions {
  createTab: (route?: string, title?: string) => string;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeTabsToRight: (tabId: string) => void;
  duplicateTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  navigateTab: (tabId: string, route: string, title?: string) => void;
  switchToNextTab: () => void;
  switchToPreviousTab: () => void;
  switchToTab: (index: number) => void;
  setTabDirty: (tabId: string, isDirty: boolean) => void;
  setTabLoading: (tabId: string, isLoading: boolean) => void;
  setTabTitle: (tabId: string, title: string) => void;
  setDraggedTab: (tabId: string | null) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  restoreTabs: (tabs: Tab[], activeTabId: string | null) => void;
  getSerializableState: () => { tabs: Tab[]; activeTabId: string | null };
}

const DEFAULT_TAB_ROUTE = '/';
const DEFAULT_TAB_TITLE = 'Start';
const MAX_TABS = 20;

const createDefaultTab = (): Tab => ({
  id: crypto.randomUUID(),
  title: DEFAULT_TAB_TITLE,
  route: DEFAULT_TAB_ROUTE,
  isDirty: false,
  isLoading: false,
  createdAt: Date.now(),
});

const initialTab = createDefaultTab();

export const useDesktopTabsStore = create<TabsState & TabsActions>()(
  subscribeWithSelector(
    immer((set, get) => ({
      tabs: [initialTab],
      activeTabId: initialTab.id,
      draggedTabId: null,
      maxTabs: MAX_TABS,

      createTab: (route = DEFAULT_TAB_ROUTE, title = DEFAULT_TAB_TITLE) => {
        const state = get();
        if (state.tabs.length >= state.maxTabs) {
          console.warn('[TabsStore] Maximum tabs reached');
          return state.activeTabId!;
        }

        const newTab: Tab = {
          id: crypto.randomUUID(),
          title,
          route,
          isDirty: false,
          isLoading: false,
          createdAt: Date.now(),
        };

        set((draft) => {
          const activeIndex = draft.tabs.findIndex(t => t.id === draft.activeTabId);
          draft.tabs.splice(activeIndex + 1, 0, newTab);
          draft.activeTabId = newTab.id;
        });

        return newTab.id;
      },

      closeTab: (tabId) => {
        set((draft) => {
          const index = draft.tabs.findIndex(t => t.id === tabId);
          if (index === -1 || draft.tabs.length === 1) return;

          if (draft.activeTabId === tabId) {
            const newActiveIndex = index === draft.tabs.length - 1 ? index - 1 : index + 1;
            draft.activeTabId = draft.tabs[newActiveIndex].id;
          }

          draft.tabs.splice(index, 1);
        });
      },

      closeOtherTabs: (tabId) => {
        set((draft) => {
          draft.tabs = draft.tabs.filter(t => t.id === tabId);
          draft.activeTabId = tabId;
        });
      },

      closeTabsToRight: (tabId) => {
        set((draft) => {
          const index = draft.tabs.findIndex(t => t.id === tabId);
          if (index === -1) return;

          draft.tabs = draft.tabs.slice(0, index + 1);
          if (!draft.tabs.find(t => t.id === draft.activeTabId)) {
            draft.activeTabId = tabId;
          }
        });
      },

      duplicateTab: (tabId) => {
        const state = get();
        const tab = state.tabs.find(t => t.id === tabId);
        if (!tab) return;

        state.createTab(tab.route, tab.title);
      },

      setActiveTab: (tabId) => {
        set((draft) => {
          const tab = draft.tabs.find(t => t.id === tabId);
          if (tab) {
            draft.activeTabId = tabId;
          }
        });
      },

      navigateTab: (tabId, route, title) => {
        set((draft) => {
          const tab = draft.tabs.find(t => t.id === tabId);
          if (tab) {
            tab.route = route;
            if (title) tab.title = title;
          }
        });
      },

      switchToNextTab: () => {
        const { tabs, activeTabId, setActiveTab } = get();
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const nextIndex = (currentIndex + 1) % tabs.length;
        setActiveTab(tabs[nextIndex].id);
      },

      switchToPreviousTab: () => {
        const { tabs, activeTabId, setActiveTab } = get();
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
        setActiveTab(tabs[prevIndex].id);
      },

      switchToTab: (index) => {
        const { tabs, setActiveTab } = get();
        if (index >= 0 && index < tabs.length) {
          setActiveTab(tabs[index].id);
        }
      },

      setTabDirty: (tabId, isDirty) => {
        set((draft) => {
          const tab = draft.tabs.find(t => t.id === tabId);
          if (tab) tab.isDirty = isDirty;
        });
      },

      setTabLoading: (tabId, isLoading) => {
        set((draft) => {
          const tab = draft.tabs.find(t => t.id === tabId);
          if (tab) tab.isLoading = isLoading;
        });
      },

      setTabTitle: (tabId, title) => {
        set((draft) => {
          const tab = draft.tabs.find(t => t.id === tabId);
          if (tab) tab.title = title;
        });
      },

      setDraggedTab: (tabId) => {
        set((draft) => {
          draft.draggedTabId = tabId;
        });
      },

      reorderTabs: (fromIndex, toIndex) => {
        set((draft) => {
          const [removed] = draft.tabs.splice(fromIndex, 1);
          draft.tabs.splice(toIndex, 0, removed);
          draft.draggedTabId = null;
        });
      },

      restoreTabs: (tabs, activeTabId) => {
        set((draft) => {
          draft.tabs = tabs.length > 0 ? tabs : [createDefaultTab()];
          draft.activeTabId = activeTabId || draft.tabs[0].id;
        });
      },

      getSerializableState: () => {
        const { tabs, activeTabId } = get();
        return { tabs, activeTabId };
      },
    }))
  )
);

export const useActiveTab = () => {
  return useDesktopTabsStore((state) => {
    return state.tabs.find(t => t.id === state.activeTabId) || null;
  });
};

export const useTabs = () => {
  return useDesktopTabsStore((state) => state.tabs);
};

export const useActiveTabId = () => {
  return useDesktopTabsStore((state) => state.activeTabId);
};

import { create } from 'zustand';

interface SidebarState {
  isOpen: boolean;
  hideRequesters: Set<string>;
  hideAppSidebar: boolean;
  forceExpandedRequesters: Set<string>;
  forceExpanded: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  requestHideSidebar: (requesterId: string) => void;
  releaseHideSidebar: (requesterId: string) => void;
  requestForceExpanded: (requesterId: string) => void;
  releaseForceExpanded: (requesterId: string) => void;
}

const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: false,
  hideRequesters: new Set(),
  hideAppSidebar: false,
  forceExpandedRequesters: new Set(),
  forceExpanded: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  requestHideSidebar: (requesterId: string) =>
    set((state) => {
      const newSet = new Set(state.hideRequesters);
      newSet.add(requesterId);
      return {
        hideRequesters: newSet,
        hideAppSidebar: newSet.size > 0,
      };
    }),
  releaseHideSidebar: (requesterId: string) =>
    set((state) => {
      const newSet = new Set(state.hideRequesters);
      newSet.delete(requesterId);
      return {
        hideRequesters: newSet,
        hideAppSidebar: newSet.size > 0,
      };
    }),
  requestForceExpanded: (requesterId: string) =>
    set((state) => {
      const newSet = new Set(state.forceExpandedRequesters);
      newSet.add(requesterId);
      return {
        forceExpandedRequesters: newSet,
        forceExpanded: true,
        isOpen: true,
      };
    }),
  releaseForceExpanded: (requesterId: string) =>
    set((state) => {
      const newSet = new Set(state.forceExpandedRequesters);
      newSet.delete(requesterId);
      const stillForced = newSet.size > 0;
      return {
        forceExpandedRequesters: newSet,
        forceExpanded: stillForced,
        isOpen: stillForced ? state.isOpen : false,
      };
    }),
}));

export { useSidebarStore };
export default useSidebarStore;

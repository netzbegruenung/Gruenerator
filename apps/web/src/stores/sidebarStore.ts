import { create } from 'zustand';

interface SidebarState {
  isOpen: boolean;
  hideRequesters: Set<string>;
  hideAppSidebar: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  requestHideSidebar: (requesterId: string) => void;
  releaseHideSidebar: (requesterId: string) => void;
}

const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: false,
  hideRequesters: new Set(),
  hideAppSidebar: false,
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
}));

export { useSidebarStore };
export default useSidebarStore;

import { create } from 'zustand';

interface SidebarState {
  isOpen: boolean;
  hideAppSidebar: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setHideAppSidebar: (hide: boolean) => void;
}

const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: false,
  hideAppSidebar: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setHideAppSidebar: (hide: boolean) => set({ hideAppSidebar: hide }),
}));

export default useSidebarStore;

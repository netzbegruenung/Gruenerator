import { create } from 'zustand';

interface DrawerStore {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  setOpen: (open: boolean) => void;
}

export const useDrawerStore = create<DrawerStore>((set) => ({
  open: false,
  openDrawer: () => set({ open: true }),
  closeDrawer: () => set({ open: false }),
  setOpen: (open) => set({ open }),
}));

import { create } from 'zustand';

interface DrawerStore {
  open: boolean;
  /** Bumped each time the drawer opens; the thread list reloads on it. */
  listRevision: number;
  openDrawer: () => void;
  closeDrawer: () => void;
  setOpen: (open: boolean) => void;
}

export const useDrawerStore = create<DrawerStore>((set) => ({
  open: false,
  listRevision: 0,
  openDrawer: () => set((s) => (s.open ? s : { open: true, listRevision: s.listRevision + 1 })),
  closeDrawer: () => set({ open: false }),
  setOpen: (open) => set({ open }),
}));

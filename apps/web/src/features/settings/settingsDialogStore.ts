import { type SettingsTab } from '@gruenerator/shared/settings';
import { create } from 'zustand';

// Defined alongside the catalog so a new tab cannot be added on one side only.
// Re-exported here because every consumer already imports it from this module.
export type { SettingsTab };

interface SettingsDialogState {
  isOpen: boolean;
  // Latch for the lazy host: once true, the dialog stays mounted so the
  // close animation can play.
  hasOpened: boolean;
  tab: SettingsTab;
  openSettings: (tab?: SettingsTab) => void;
  setTab: (tab: SettingsTab) => void;
  close: () => void;
}

export const useSettingsDialogStore = create<SettingsDialogState>((set) => ({
  isOpen: false,
  hasOpened: false,
  tab: 'allgemein',
  openSettings: (tab) => set((state) => ({ isOpen: true, hasOpened: true, tab: tab ?? state.tab })),
  setTab: (tab) => set({ tab }),
  close: () => set({ isOpen: false }),
}));

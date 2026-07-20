import { create } from 'zustand';

export type SettingsTab =
  | 'allgemein'
  | 'konto'
  | 'personalisierung'
  | 'erinnerungen'
  | 'benachrichtigungen'
  | 'wolke'
  | 'konnektoren';

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

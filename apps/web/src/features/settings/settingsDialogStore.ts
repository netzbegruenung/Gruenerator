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
  /**
   * Ob jemand diesen Bereich ausdrücklich verlangt hat — ein Deep-Link, ein
   * Menüeintrag mit Ziel, ein Klick in der Seitenleiste des Dialogs.
   *
   * Der Unterschied zählt nur für die offene Einrichtung: „Einstellungen
   * öffnen" ohne Ziel landet dann im Onboarding, „Konnektoren öffnen" aber bei
   * den Konnektoren. Ohne diese Unterscheidung müsste die Einrichtung entweder
   * jeden Deep-Link kapern oder wäre nur über die Seitenleiste erreichbar.
   */
  tabWasNamed: boolean;
  openSettings: (tab?: SettingsTab) => void;
  setTab: (tab: SettingsTab) => void;
  close: () => void;
}

export const useSettingsDialogStore = create<SettingsDialogState>((set) => ({
  isOpen: false,
  hasOpened: false,
  tab: 'allgemein',
  tabWasNamed: false,
  openSettings: (tab) =>
    set((state) => ({
      isOpen: true,
      hasOpened: true,
      tab: tab ?? state.tab,
      tabWasNamed: tab !== undefined,
    })),
  setTab: (tab) => set({ tab, tabWasNamed: true }),
  close: () => set({ isOpen: false }),
}));

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
  /**
   * Schmale Breite: zeigt der Dialog den Bereich (true) oder die Liste der
   * Bereiche (false)? Wer mit Ziel öffnet, landet direkt im Bereich, wer ohne
   * Ziel öffnet, in der Liste. Auf breitem Schirm stehen beide nebeneinander,
   * dort spielt der Wert keine Rolle.
   */
  paneOpen: boolean;
  openSettings: (tab?: SettingsTab) => void;
  setTab: (tab: SettingsTab) => void;
  /** Schmale Breite: zurück vom Bereich zur Liste. */
  showNav: () => void;
  close: () => void;
}

export const useSettingsDialogStore = create<SettingsDialogState>((set) => ({
  isOpen: false,
  hasOpened: false,
  tab: 'allgemein',
  tabWasNamed: false,
  paneOpen: false,
  openSettings: (tab) =>
    set((state) => ({
      isOpen: true,
      hasOpened: true,
      tab: tab ?? state.tab,
      tabWasNamed: tab !== undefined,
      paneOpen: tab !== undefined,
    })),
  setTab: (tab) => set({ tab, tabWasNamed: true, paneOpen: true }),
  // tabWasNamed mit setzen: sonst holt die offene Einrichtung den Dialog
  // gleich wieder in ihren Bereich (resolveSettingsTab), und „Zurück" führte
  // nirgendwohin.
  showNav: () => set({ paneOpen: false, tabWasNamed: true }),
  close: () => set({ isOpen: false }),
}));

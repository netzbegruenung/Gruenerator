import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { HUB_TABS, isHubTab, type HubTab } from './hubSources';

interface HubSourcePrefsState {
  /** Leere Quellarten, die die Person im Hub sehen will. Arten mit Inhalt zeigt der Hub immer. */
  enabled: HubTab[];
  setEnabled: (tab: HubTab, on: boolean) => void;
}

export const useHubSourcePrefs = create<HubSourcePrefsState>()(
  persist(
    (set) => ({
      enabled: ['upload'],
      setEnabled: (tab, on) =>
        set((s) => ({
          enabled: HUB_TABS.filter((t) => (t === tab ? on : s.enabled.includes(t))),
        })),
    }),
    {
      name: 'notebook-hub-sources',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persisted) => {
        const raw = (persisted as { enabled?: unknown } | null)?.enabled;
        return {
          enabled: Array.isArray(raw) ? raw.filter((t): t is HubTab => isHubTab(String(t))) : [],
        } as HubSourcePrefsState;
      },
    }
  )
);

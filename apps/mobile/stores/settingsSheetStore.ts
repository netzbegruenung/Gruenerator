import { create } from 'zustand';

/**
 * Which pane of the settings sheet is showing. `null` is the root list.
 *
 * Everything the settings surface can do is one of these — there is no pushed
 * screen and no second modal, so a detail never animates over its own parent.
 */
export type SettingsDetail =
  'friend' | 'roles' | 'theme' | 'chatBackground' | 'locale' | 'accessibility' | 'privacy';

interface SettingsSheetState {
  isOpen: boolean;
  detail: SettingsDetail | null;
  /** Opens the sheet, optionally straight onto a detail pane. */
  open: (detail?: SettingsDetail) => void;
  setDetail: (detail: SettingsDetail | null) => void;
  close: () => void;
}

/**
 * Settings live in a bottom sheet mounted once at the root, not on a route.
 *
 * The surface is a handful of rows and short lists; a tab in the navigator meant
 * a full screen push on the way in and a second, differently-animated modal on
 * the way into every picker. One sheet that swaps its own content keeps every
 * transition the same — the composer's "+" menu already works this way.
 *
 * Not persisted: an open sheet should not survive a restart.
 */
export const useSettingsSheetStore = create<SettingsSheetState>((set) => ({
  isOpen: false,
  detail: null,
  open: (detail) => set({ isOpen: true, detail: detail ?? null }),
  setDetail: (detail) => set({ detail }),
  // Reset to the root so reopening never lands in the pane the user left behind.
  close: () => set({ isOpen: false, detail: null }),
}));

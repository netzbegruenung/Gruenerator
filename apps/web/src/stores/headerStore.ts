import { create } from 'zustand';

interface HeaderState {
  forceShrunk: boolean;
  setForceShrunk: (value: boolean) => void;
}

/**
 * Header UI state store
 * Allows components to control header behavior (e.g., force shrunk state)
 */
const useHeaderStore = create<HeaderState>((set) => ({
  forceShrunk: false,
  setForceShrunk: (value: boolean) => set({ forceShrunk: value }),
}));

export default useHeaderStore;

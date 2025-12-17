import { create } from 'zustand';

/**
 * Header UI state store
 * Allows components to control header behavior (e.g., force shrunk state)
 */
const useHeaderStore = create((set) => ({
  forceShrunk: false,
  setForceShrunk: (value) => set({ forceShrunk: value }),
}));

export default useHeaderStore;

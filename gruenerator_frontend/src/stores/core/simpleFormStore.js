import { create } from 'zustand';

// Simple store to keep uncontrolled form field values
// Provides get, set and reset helpers
export const useSimpleFormStore = create((set, get) => ({
  fields: {},
  setField: (name, value) =>
    set((state) => ({ fields: { ...state.fields, [name]: value } })),
  getField: (name) => get().fields[name],
  reset: () => set({ fields: {} }),
})); 
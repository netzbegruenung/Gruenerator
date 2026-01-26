import { create } from 'zustand';

interface SimpleFormState {
  fields: Record<string, unknown>;
  setField: (name: string, value: unknown) => void;
  getField: (name: string) => unknown;
  reset: () => void;
}

// Simple store to keep uncontrolled form field values
// Provides get, set and reset helpers
export const useSimpleFormStore = create<SimpleFormState>((set, get) => ({
  fields: {},
  setField: (name: string, value: unknown) =>
    set((state) => ({ fields: { ...state.fields, [name]: value } })),
  getField: (name: string) => get().fields[name],
  reset: () => set({ fields: {} }),
}));

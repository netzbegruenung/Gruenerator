import { create } from 'zustand';

import {
  fetchAnweisungenWissen as apiFetchAnweisungenWissen,
  saveAnweisungenWissen as apiSaveAnweisungenWissen,
} from '../services/content';
import { getErrorMessage } from '../utils/errors';

export const INSTRUCTION_TYPES = [] as const;

interface InstructionsState {
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  lastSaved: number | null;
}

interface InstructionsActions {
  fetchInstructions: () => Promise<void>;
  saveInstructions: () => Promise<void>;
  reset: () => void;
}

type InstructionsStore = InstructionsState & InstructionsActions;

const initialState: InstructionsState = {
  isLoading: false,
  isSaving: false,
  error: null,
  lastSaved: null,
};

export const useInstructionsStore = create<InstructionsStore>()((set, get) => ({
  ...initialState,

  fetchInstructions: async () => {
    set({ isLoading: true, error: null });
    try {
      await apiFetchAnweisungenWissen();
      set({ isLoading: false });
    } catch (error: unknown) {
      set({ error: getErrorMessage(error), isLoading: false });
    }
  },

  saveInstructions: async () => {
    set({ isSaving: true, error: null });
    try {
      await apiSaveAnweisungenWissen({});
      set({ isSaving: false, lastSaved: Date.now() });
    } catch (error: unknown) {
      set({ error: getErrorMessage(error), isSaving: false });
      throw error;
    }
  },

  reset: () => {
    set(initialState);
  },
}));

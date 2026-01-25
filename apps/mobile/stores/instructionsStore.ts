import { create } from 'zustand';
import {
  fetchAnweisungenWissen as apiFetchAnweisungenWissen,
  saveAnweisungenWissen as apiSaveAnweisungenWissen,
  type AnweisungenWissen,
} from '../services/content';
import { getErrorMessage } from '../utils/errors';

// Only antrag and social instruction types remain active
export const INSTRUCTION_TYPES = [
  { key: 'antragPrompt', title: 'Anträge' },
  { key: 'socialPrompt', title: 'Presse & Social Media' },
] as const;

export type InstructionKey = (typeof INSTRUCTION_TYPES)[number]['key'];

interface InstructionsState {
  instructions: Record<InstructionKey, string>;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  lastSaved: number | null;
}

interface InstructionsActions {
  fetchInstructions: () => Promise<void>;
  updateInstruction: (key: InstructionKey, value: string) => void;
  saveInstructions: () => Promise<void>;
  clearInstruction: (key: InstructionKey) => void;
  reset: () => void;
}

type InstructionsStore = InstructionsState & InstructionsActions;

const initialInstructions: Record<InstructionKey, string> = {
  antragPrompt: '',
  socialPrompt: '',
};

const initialState: InstructionsState = {
  instructions: { ...initialInstructions },
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
      const data = await apiFetchAnweisungenWissen();
      const instructions: Record<InstructionKey, string> = {
        antragPrompt: data.antragPrompt || '',
        socialPrompt: data.socialPrompt || '',
      };
      set({ instructions, isLoading: false });
    } catch (error: unknown) {
      set({ error: getErrorMessage(error), isLoading: false });
    }
  },

  updateInstruction: (key: InstructionKey, value: string) => {
    set((state) => ({
      instructions: {
        ...state.instructions,
        [key]: value,
      },
    }));
  },

  saveInstructions: async () => {
    const { instructions } = get();
    set({ isSaving: true, error: null });
    try {
      await apiSaveAnweisungenWissen(instructions);
      set({ isSaving: false, lastSaved: Date.now() });
    } catch (error: unknown) {
      set({ error: getErrorMessage(error), isSaving: false });
      throw error;
    }
  },

  clearInstruction: (key: InstructionKey) => {
    set((state) => ({
      instructions: {
        ...state.instructions,
        [key]: '',
      },
    }));
  },

  reset: () => {
    set(initialState);
  },
}));

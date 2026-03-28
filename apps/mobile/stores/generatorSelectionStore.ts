import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type AIMode = 'kreativ' | 'privacy' | 'pro';

export interface AttachedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  uri: string;
  base64?: string;
}

interface GeneratorSelectionState {
  useWebSearch: boolean;
  usePrivacyMode: boolean;
  useProMode: boolean;
  selectedDocumentIds: string[];
  selectedTextIds: string[];
  attachedFiles: AttachedFile[];
  isInstructionsActive: boolean;
  instructionType: string | null;
}

interface GeneratorSelectionActions {
  toggleWebSearch: () => void;
  togglePrivacyMode: () => void;
  toggleProMode: () => void;
  setAIMode: (mode: AIMode) => void;
  getCurrentAIMode: () => AIMode;
  toggleDocumentSelection: (documentId: string) => void;
  toggleTextSelection: (textId: string) => void;
  addAttachedFile: (file: AttachedFile) => void;
  removeAttachedFile: (fileId: string) => void;
  clearAttachedFiles: () => void;
  setInstructionsActive: (active: boolean) => void;
  setInstructionType: (type: string | null) => void;
  getFeatureState: () => FeatureState;
  getTotalContentCount: () => number;
  reset: () => void;
}

interface FeatureState {
  useWebSearchTool: boolean;
  usePrivacyMode: boolean;
  useProMode: boolean;
  selectedDocumentIds: string[];
  selectedTextIds: string[];
  attachedFiles: AttachedFile[];
}

type GeneratorSelectionStore = GeneratorSelectionState & GeneratorSelectionActions;

const initialState: GeneratorSelectionState = {
  useWebSearch: false,
  usePrivacyMode: false,
  useProMode: false,
  selectedDocumentIds: [],
  selectedTextIds: [],
  attachedFiles: [],
  isInstructionsActive: false,
  instructionType: null,
};

export const useGeneratorSelectionStore = create<GeneratorSelectionStore>()(
  immer((set, get) => ({
    ...initialState,

    toggleWebSearch: () =>
      set((state) => {
        state.useWebSearch = !state.useWebSearch;
      }),

    togglePrivacyMode: () =>
      set((state) => {
        state.usePrivacyMode = !state.usePrivacyMode;
        if (state.usePrivacyMode) {
          state.useProMode = false;
        }
      }),

    toggleProMode: () =>
      set((state) => {
        state.useProMode = !state.useProMode;
        if (state.useProMode) {
          state.usePrivacyMode = false;
        }
      }),

    setAIMode: (mode: AIMode) =>
      set((state) => {
        state.usePrivacyMode = mode === 'privacy';
        state.useProMode = mode === 'pro';
      }),

    getCurrentAIMode: (): AIMode => {
      const state = get();
      if (state.useProMode) return 'pro';
      if (state.usePrivacyMode) return 'privacy';
      return 'kreativ';
    },

    toggleDocumentSelection: (documentId: string) =>
      set((state) => {
        const index = state.selectedDocumentIds.indexOf(documentId);
        if (index > -1) {
          state.selectedDocumentIds.splice(index, 1);
        } else {
          state.selectedDocumentIds.push(documentId);
        }
      }),

    toggleTextSelection: (textId: string) =>
      set((state) => {
        const index = state.selectedTextIds.indexOf(textId);
        if (index > -1) {
          state.selectedTextIds.splice(index, 1);
        } else {
          state.selectedTextIds.push(textId);
        }
      }),

    addAttachedFile: (file: AttachedFile) =>
      set((state) => {
        state.attachedFiles.push(file);
      }),

    removeAttachedFile: (fileId: string) =>
      set((state) => {
        state.attachedFiles = state.attachedFiles.filter((f) => f.id !== fileId);
      }),

    clearAttachedFiles: () =>
      set((state) => {
        state.attachedFiles = [];
      }),

    setInstructionsActive: (active: boolean) =>
      set((state) => {
        state.isInstructionsActive = active;
      }),

    setInstructionType: (type: string | null) =>
      set((state) => {
        state.instructionType = type;
      }),

    getFeatureState: (): FeatureState => {
      const state = get();
      return {
        useWebSearchTool: state.useWebSearch,
        usePrivacyMode: state.usePrivacyMode,
        useProMode: state.useProMode,
        selectedDocumentIds: state.selectedDocumentIds,
        selectedTextIds: state.selectedTextIds,
        attachedFiles: state.attachedFiles,
      };
    },

    getTotalContentCount: (): number => {
      const state = get();
      return (
        state.selectedDocumentIds.length + state.selectedTextIds.length + state.attachedFiles.length
      );
    },

    reset: () => set(() => initialState),
  }))
);

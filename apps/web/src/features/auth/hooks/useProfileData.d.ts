import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';

export interface UseProfileOptions {
  isActive?: boolean;
  enabled?: boolean;
}

export interface UseUserTextsOptions {
  isActive?: boolean;
  enabled?: boolean;
}

export interface UseUserTextsReturn {
  query: UseQueryResult<unknown[], Error>;
  updateTextTitle: (textId: string, newTitle: string) => Promise<void>;
  deleteText: (textId: string) => Promise<void>;
  isUpdatingTitle: boolean;
  isDeleting: boolean;
}

export interface UseUserTemplatesOptions {
  isActive?: boolean;
  enabled?: boolean;
}

export interface UseUserTemplatesReturn {
  query: UseQueryResult<unknown[], Error>;
  deleteTemplate: (templateId: string) => Promise<void>;
  updateTemplateVisibility: (templateId: string, isPrivate: boolean) => Promise<void>;
  updateTemplate: (templateId: string, data: unknown) => Promise<void>;
  updateTemplateTitle?: (templateId: string, newTitle: string) => Promise<void>;
  isUpdatingTitle?: boolean;
  isDeleting?: boolean;
}

export interface UseNotebookCollectionsOptions {
  isActive?: boolean;
  enabled?: boolean;
}

export interface UseNotebookCollectionsReturn {
  query: UseQueryResult<unknown[], Error>;
  createQACollection: (data: unknown) => Promise<{ id: string; name: string }>;
  updateQACollection: (collectionId: string, data: unknown) => Promise<unknown>;
  deleteQACollection: (collectionId: string) => Promise<void>;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
}

export interface UseAnweisungenWissenOptions {
  isActive?: boolean;
  enabled?: boolean;
  context?: 'user' | 'group';
  groupId?: string | null;
}

export interface UseCustomGeneratorsDataOptions {
  isActive?: boolean;
  enabled?: boolean;
}

export interface UseCustomGeneratorsDataReturn {
  query: UseQueryResult<unknown[], Error>;
}

export interface UseCustomGeneratorsMutationsReturn {
  updateGenerator: (generatorId: string, updateData: unknown) => Promise<unknown>;
  deleteGenerator: (generatorId: string) => Promise<void>;
  isUpdating: boolean;
  isDeleting: boolean;
  updateError: Error | null;
  deleteError: Error | null;
}

export interface UseSavedGeneratorsReturn {
  query: UseQueryResult<unknown[], Error>;
  unsaveGenerator: (generatorId: string) => Promise<void>;
  isUnsaving: boolean;
  unsaveError: Error | null;
}

export interface UseAvailableDocumentsReturn {
  data: unknown[];
  isLoading: boolean;
  error: Error | null;
}

export function useProfile(userId?: string): UseQueryResult<unknown, Error>;
export function useUserTexts(options?: UseUserTextsOptions): UseUserTextsReturn;
export function useUserTemplates(options?: UseUserTemplatesOptions): UseUserTemplatesReturn;
export function useNotebookCollections(
  options?: UseNotebookCollectionsOptions
): UseNotebookCollectionsReturn & {
  syncQACollection?: (id: string) => Promise<void>;
  isSyncing?: boolean;
};
export function useAnweisungenWissen(options?: UseAnweisungenWissenOptions): {
  query: UseQueryResult<unknown, Error>;
  saveChanges: (data: unknown) => Promise<unknown>;
  isSaving: boolean;
  saveError: Error | null;
  [key: string]: unknown;
};
export function useCustomGeneratorsData(
  options?: UseCustomGeneratorsDataOptions
): UseCustomGeneratorsDataReturn;
export function useCustomGeneratorsMutations(): UseCustomGeneratorsMutationsReturn;
export function useAvailableDocuments(options?: { enabled?: boolean }): UseAvailableDocumentsReturn;
export function useSavedGenerators(options?: { isActive?: boolean }): UseSavedGeneratorsReturn;
export const QUERY_KEYS: {
  profile: (userId: string | undefined) => (string | undefined)[];
  bundledProfile: (
    userId: string | undefined,
    options: unknown
  ) => (string | undefined | unknown)[];
  anweisungenWissen: (userId: string | undefined) => (string | undefined)[];
  notebookCollections: (userId: string | undefined) => (string | undefined)[];
  customGenerators: (userId: string | undefined) => (string | undefined)[];
  savedGenerators: (userId: string | undefined) => (string | undefined)[];
  generatorDocuments: (generatorId: string | undefined) => (string | undefined)[];
  userTexts: (userId: string | undefined) => (string | undefined)[];
  userTemplates: (userId: string | undefined) => (string | undefined)[];
  availableDocuments: (userId: string | undefined) => (string | undefined)[];
  memories: (userId: string | undefined) => (string | undefined)[];
};

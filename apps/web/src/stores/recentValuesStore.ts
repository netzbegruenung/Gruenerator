import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import apiClient from '../components/utils/apiClient';

interface AxiosErrorResponse {
  data?: {
    error?: string;
  };
}

interface AxiosError extends Error {
  response?: AxiosErrorResponse;
}

function isAxiosError(error: unknown): error is AxiosError {
  return error instanceof Error && 'response' in error;
}

interface FieldState {
  values: string[];
  lastFetch: number | null;
  isLoading: boolean;
  error: string | null;
}

// Settings interface
interface Settings {
  defaultLimit: number;
  cacheTimeout: number;
  autoSave: boolean;
  showDropdown: boolean;
}

// Field statistics
interface FieldStats {
  fieldType: string;
  valueCount: number;
  lastFetch: number | null;
  isLoading: boolean;
  hasError: boolean;
}

// Store state interface
interface RecentValuesState {
  recentValuesByField: Record<string, FieldState>;
  settings: Settings;
  activeField: string | null;
  isGlobalLoading: boolean;
  globalError: string | null;
}

// Store actions interface
interface RecentValuesActions {
  getFieldState: (fieldType: string) => FieldState;
  setFieldState: (fieldType: string, updates: Partial<FieldState>) => void;
  fetchRecentValues: (fieldType: string, limit?: number | null) => Promise<string[]>;
  saveRecentValue: (fieldType: string, value: string, formName?: string | null) => Promise<unknown>;
  clearRecentValues: (fieldType: string) => Promise<number | undefined>;
  isCacheValid: (fieldType: string) => boolean;
  getRecentValuesWithFetch: (fieldType: string, limit?: number | null) => Promise<string[]>;
  setActiveField: (fieldType: string | null) => void;
  clearActiveField: () => void;
  updateSettings: (newSettings: Partial<Settings>) => void;
  reset: () => void;
  getFieldStats: () => FieldStats[];
}

// Combined store type
type RecentValuesStore = RecentValuesState & RecentValuesActions;

const initialState: RecentValuesState = {
  recentValuesByField: {},
  settings: {
    defaultLimit: 5,
    cacheTimeout: 5 * 60 * 1000, // 5 minutes
    autoSave: true,
    showDropdown: true
  },
  activeField: null,
  isGlobalLoading: false,
  globalError: null
};

/**
 * Zustand store for managing recent form values across the application
 * Provides centralized state management for recent values with caching
 */
export const useRecentValuesStore = create<RecentValuesStore>()(
  immer((set, get) => ({
    ...initialState,

    getFieldState: (fieldType) => {
      const state = get();
      if (!state.recentValuesByField[fieldType]) {
        return {
          values: [],
          lastFetch: null,
          isLoading: false,
          error: null
        };
      }
      return state.recentValuesByField[fieldType];
    },

    setFieldState: (fieldType, updates) => {
      set(state => {
        if (!state.recentValuesByField[fieldType]) {
          state.recentValuesByField[fieldType] = {
            values: [],
            lastFetch: null,
            isLoading: false,
            error: null
          };
        }
        Object.assign(state.recentValuesByField[fieldType], updates);
      });
    },

    fetchRecentValues: async (fieldType, limit = null) => {
      const { settings } = get();
      const actualLimit = limit || settings.defaultLimit;

      set(state => {
        if (!state.recentValuesByField[fieldType]) {
          state.recentValuesByField[fieldType] = {
            values: [],
            lastFetch: null,
            isLoading: false,
            error: null
          };
        }
        state.recentValuesByField[fieldType].isLoading = true;
        state.recentValuesByField[fieldType].error = null;
      });

      try {
        const response = await apiClient.get(`/recent-values/${fieldType}?limit=${actualLimit}`);

        if (response.data?.success && response.data?.data) {
          const values = response.data.data.map((item: { field_value: string }) => item.field_value);

          set(state => {
            state.recentValuesByField[fieldType].values = values;
            state.recentValuesByField[fieldType].lastFetch = Date.now();
            state.recentValuesByField[fieldType].isLoading = false;
          });

          return values;
        } else {
          set(state => {
            state.recentValuesByField[fieldType].values = [];
            state.recentValuesByField[fieldType].lastFetch = Date.now();
            state.recentValuesByField[fieldType].isLoading = false;
          });
          return [];
        }
      } catch (error: unknown) {
        let errorMessage = 'Failed to fetch recent values';
        if (isAxiosError(error)) {
          errorMessage = error.response?.data?.error || error.message;
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }
        console.error(`[RecentValuesStore] Error fetching recent values for ${fieldType}:`, error);

        set(state => {
          state.recentValuesByField[fieldType].error = errorMessage;
          state.recentValuesByField[fieldType].isLoading = false;
        });

        throw error;
      }
    },

    saveRecentValue: async (fieldType, value, formName = null) => {
      if (!fieldType || !value || typeof value !== 'string' || value.trim() === '') {
        return;
      }

      const trimmedValue = value.trim();
      const { settings } = get();
      const fieldState = get().getFieldState(fieldType);

      if (fieldState.values.length > 0 && fieldState.values[0] === trimmedValue) {
        return;
      }

      try {
        const response = await apiClient.post('/recent-values', {
          fieldType,
          fieldValue: trimmedValue,
          formName
        });

        if (response.data?.success) {
          set(state => {
            if (!state.recentValuesByField[fieldType]) {
              state.recentValuesByField[fieldType] = {
                values: [],
                lastFetch: null,
                isLoading: false,
                error: null
              };
            }

            const currentValues = state.recentValuesByField[fieldType].values;
            const filtered = currentValues.filter(v => v !== trimmedValue);
            state.recentValuesByField[fieldType].values = [trimmedValue, ...filtered].slice(0, settings.defaultLimit);
          });

          console.log(`[RecentValuesStore] Saved recent value for ${fieldType}:`, trimmedValue.substring(0, 50) + '...');
          return response.data.data;
        }
      } catch (error) {
        console.error(`[RecentValuesStore] Error saving recent value for ${fieldType}:`, error);
      }
    },

    clearRecentValues: async (fieldType) => {
      try {
        const response = await apiClient.delete(`/recent-values/${fieldType}`);

        if (response.data?.success) {
          set(state => {
            if (state.recentValuesByField[fieldType]) {
              state.recentValuesByField[fieldType].values = [];
              state.recentValuesByField[fieldType].lastFetch = Date.now();
            }
          });

          console.log(`[RecentValuesStore] Cleared recent values for ${fieldType}`);
          return response.data.deletedCount;
        }
      } catch (error) {
        console.error(`[RecentValuesStore] Error clearing recent values for ${fieldType}:`, error);
        throw error;
      }
    },

    isCacheValid: (fieldType) => {
      const { settings } = get();
      const fieldState = get().getFieldState(fieldType);

      if (!fieldState.lastFetch) return false;

      const age = Date.now() - fieldState.lastFetch;
      return age < settings.cacheTimeout;
    },

    getRecentValuesWithFetch: async (fieldType, limit = null) => {
      const fieldState = get().getFieldState(fieldType);

      if (get().isCacheValid(fieldType) && fieldState.values.length > 0) {
        return fieldState.values;
      }

      return await get().fetchRecentValues(fieldType, limit);
    },

    setActiveField: (fieldType) => {
      set(state => {
        state.activeField = fieldType;
      });
    },

    clearActiveField: () => {
      set(state => {
        state.activeField = null;
      });
    },

    updateSettings: (newSettings) => {
      set(state => {
        Object.assign(state.settings, newSettings);
      });
    },

    reset: () => {
      set(() => initialState);
    },

    getFieldStats: () => {
      const { recentValuesByField } = get();

      const stats: FieldStats[] = Object.entries(recentValuesByField).map(([fieldType, fieldState]) => ({
        fieldType,
        valueCount: fieldState.values.length,
        lastFetch: fieldState.lastFetch,
        isLoading: fieldState.isLoading,
        hasError: !!fieldState.error
      }));

      return stats.sort((a, b) => (b.lastFetch || 0) - (a.lastFetch || 0));
    }
  }))
);

export default useRecentValuesStore;

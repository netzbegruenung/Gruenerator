import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import apiClient from '../components/utils/apiClient';

const initialState = {
  // Recent values cache by field type
  recentValuesByField: {}, // { fieldType: { values: [], lastFetch: timestamp, isLoading: false } }

  // Global settings
  settings: {
    defaultLimit: 5,
    cacheTimeout: 5 * 60 * 1000, // 5 minutes
    autoSave: true,
    showDropdown: true
  },

  // UI state
  activeField: null, // Currently focused field
  isGlobalLoading: false,
  globalError: null
};

/**
 * Zustand store for managing recent form values across the application
 * Provides centralized state management for recent values with caching
 */
export const useRecentValuesStore = create(immer((set, get) => ({
  ...initialState,

  /**
   * Initialize or get field state
   */
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

  /**
   * Set field state
   */
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

  /**
   * Fetch recent values for a field type
   */
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
        const values = response.data.data.map(item => item.field_value);

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
    } catch (error) {
      console.error(`[RecentValuesStore] Error fetching recent values for ${fieldType}:`, error);

      set(state => {
        state.recentValuesByField[fieldType].error = error.response?.data?.error || 'Failed to fetch recent values';
        state.recentValuesByField[fieldType].isLoading = false;
      });

      throw error;
    }
  },

  /**
   * Save a recent value
   */
  saveRecentValue: async (fieldType, value, formName = null) => {
    if (!fieldType || !value || typeof value !== 'string' || value.trim() === '') {
      return;
    }

    const trimmedValue = value.trim();
    const { settings } = get();
    const fieldState = get().getFieldState(fieldType);

    // Don't save if it's already the most recent value
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
        // Update local state optimistically
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
      // Don't throw error to avoid disrupting form submission
    }
  },

  /**
   * Clear recent values for a field type
   */
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

  /**
   * Check if cache is valid for a field
   */
  isCacheValid: (fieldType) => {
    const { settings } = get();
    const fieldState = get().getFieldState(fieldType);

    if (!fieldState.lastFetch) return false;

    const age = Date.now() - fieldState.lastFetch;
    return age < settings.cacheTimeout;
  },

  /**
   * Get recent values with automatic fetching if cache is invalid
   */
  getRecentValuesWithFetch: async (fieldType, limit = null) => {
    const fieldState = get().getFieldState(fieldType);

    // If cache is valid, return cached values
    if (get().isCacheValid(fieldType) && fieldState.values.length > 0) {
      return fieldState.values;
    }

    // Otherwise fetch fresh data
    return await get().fetchRecentValues(fieldType, limit);
  },

  /**
   * Set active field (for UI highlighting)
   */
  setActiveField: (fieldType) => {
    set(state => {
      state.activeField = fieldType;
    });
  },

  /**
   * Clear active field
   */
  clearActiveField: () => {
    set(state => {
      state.activeField = null;
    });
  },

  /**
   * Update global settings
   */
  updateSettings: (newSettings) => {
    set(state => {
      Object.assign(state.settings, newSettings);
    });
  },

  /**
   * Reset entire store
   */
  reset: () => {
    set(initialState);
  },

  /**
   * Get field statistics
   */
  getFieldStats: () => {
    const { recentValuesByField } = get();

    const stats = Object.entries(recentValuesByField).map(([fieldType, fieldState]) => ({
      fieldType,
      valueCount: fieldState.values.length,
      lastFetch: fieldState.lastFetch,
      isLoading: fieldState.isLoading,
      hasError: !!fieldState.error
    }));

    return stats.sort((a, b) => (b.lastFetch || 0) - (a.lastFetch || 0));
  }
})));

export default useRecentValuesStore;
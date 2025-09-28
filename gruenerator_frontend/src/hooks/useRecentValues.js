import { useState, useCallback, useEffect } from 'react';
import apiClient from '../components/utils/apiClient';

/**
 * Custom hook for managing recent form values
 * Provides functionality to save, retrieve, and manage recent form inputs
 */
export const useRecentValues = (fieldType, options = {}) => {
  const {
    limit = 5,
    autoSave = true,
    debounceMs = 1000,
    cacheTimeout = 5 * 60 * 1000 // 5 minutes
  } = options;

  const [recentValues, setRecentValues] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  // Cache key for local storage
  const cacheKey = `recentValues_${fieldType}`;

  // Load from cache if available and not expired
  useEffect(() => {
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        const age = Date.now() - parsed.timestamp;
        if (age < cacheTimeout) {
          setRecentValues(parsed.values);
          setLastFetch(parsed.timestamp);
          return;
        }
      } catch (err) {
        console.warn('[useRecentValues] Invalid cache data, clearing:', err);
        localStorage.removeItem(cacheKey);
      }
    }

    // If no valid cache, fetch from server
    fetchRecentValues();
  }, [fieldType, cacheTimeout]);

  /**
   * Fetch recent values from the server
   */
  const fetchRecentValues = useCallback(async () => {
    if (!fieldType) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/recent-values/${fieldType}?limit=${limit}`, {
        skipAuthRedirect: true
      });

      if (response.data?.success && response.data?.data) {
        const values = response.data.data.map(item => item.field_value);
        setRecentValues(values);

        // Cache the results
        localStorage.setItem(cacheKey, JSON.stringify({
          values,
          timestamp: Date.now()
        }));
        setLastFetch(Date.now());
      } else {
        setRecentValues([]);
      }
    } catch (err) {
      console.error('[useRecentValues] Error fetching recent values:', err);
      setError(err.response?.data?.error || 'Failed to fetch recent values');
      // Don't clear existing values on error
    } finally {
      setIsLoading(false);
    }
  }, [fieldType, limit, cacheKey]);

  /**
   * Save a new recent value
   */
  const saveRecentValue = useCallback(async (value, formName = null) => {
    if (!fieldType || !value || typeof value !== 'string' || value.trim() === '') {
      return;
    }

    const trimmedValue = value.trim();

    // Don't save if it's already the most recent value
    if (recentValues.length > 0 && recentValues[0] === trimmedValue) {
      return;
    }

    try {
      const response = await apiClient.post('/recent-values', {
        fieldType,
        fieldValue: trimmedValue,
        formName
      }, {
        skipAuthRedirect: true
      });

      if (response.data?.success) {
        // Update local state optimistically
        setRecentValues(prev => {
          const filtered = prev.filter(v => v !== trimmedValue);
          return [trimmedValue, ...filtered].slice(0, limit);
        });

        // Update cache
        const newValues = [trimmedValue, ...recentValues.filter(v => v !== trimmedValue)].slice(0, limit);
        localStorage.setItem(cacheKey, JSON.stringify({
          values: newValues,
          timestamp: Date.now()
        }));

        console.log(`[useRecentValues] Saved recent value for ${fieldType}:`, trimmedValue.substring(0, 50) + '...');
      }
    } catch (err) {
      console.error('[useRecentValues] Error saving recent value:', err);
      // Don't throw error to avoid disrupting form submission
    }
  }, [fieldType, recentValues, limit, cacheKey]);

  /**
   * Clear all recent values for the current field type
   */
  const clearRecentValues = useCallback(async () => {
    if (!fieldType) return;

    try {
      const response = await apiClient.delete(`/recent-values/${fieldType}`, {
        skipAuthRedirect: true
      });

      if (response.data?.success) {
        setRecentValues([]);
        localStorage.removeItem(cacheKey);
        console.log(`[useRecentValues] Cleared recent values for ${fieldType}`);
      }
    } catch (err) {
      console.error('[useRecentValues] Error clearing recent values:', err);
      setError(err.response?.data?.error || 'Failed to clear recent values');
    }
  }, [fieldType, cacheKey]);

  /**
   * Refresh recent values from server
   */
  const refresh = useCallback(() => {
    localStorage.removeItem(cacheKey);
    fetchRecentValues();
  }, [fetchRecentValues, cacheKey]);

  /**
   * Check if a value exists in recent values
   */
  const hasRecentValue = useCallback((value) => {
    if (!value || typeof value !== 'string') return false;
    return recentValues.includes(value.trim());
  }, [recentValues]);

  return {
    recentValues,
    isLoading,
    error,
    saveRecentValue,
    clearRecentValues,
    refresh,
    hasRecentValue,
    isEmpty: recentValues.length === 0,
    lastFetch
  };
};

export default useRecentValues;
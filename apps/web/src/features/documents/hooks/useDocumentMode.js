import { useState, useEffect, useCallback } from 'react';

import apiClient from '../../../components/utils/apiClient';

/**
 * Custom hook for managing document mode (manual/wolke)
 */
export const useDocumentMode = () => {
  const [currentMode, setCurrentMode] = useState('wolke');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);

  // Fetch current mode from backend
  const fetchCurrentMode = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.get('/documents/mode');

      if (response.data && response.data.mode) {
        setCurrentMode(response.data.mode);
      }
    } catch (error) {
      console.error('[useDocumentMode] Failed to fetch current mode:', error);
      setError('Fehler beim Laden des aktuellen Modus');

      // Fallback to wolke mode if fetch fails
      setCurrentMode('wolke');
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, []);

  // Change document mode
  const changeMode = useCallback(
    async (newMode) => {
      if (newMode === currentMode || loading) {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await apiClient.post('/documents/mode', {
          mode: newMode,
        });

        if (response.data && response.data.success) {
          setCurrentMode(newMode);
          console.log(`[useDocumentMode] Successfully switched to ${newMode} mode`);
        } else {
          throw new Error('Backend returned unsuccessful response');
        }
      } catch (error) {
        console.error(`[useDocumentMode] Failed to switch to ${newMode} mode:`, error);
        setError(
          `Fehler beim Wechsel zu ${newMode === 'wolke' ? 'Wolke-Modus' : 'Manueller Modus'}`
        );

        // Don't change local state if API call failed
      } finally {
        setLoading(false);
      }
    },
    [currentMode, loading]
  );

  // Initialize mode on mount
  useEffect(() => {
    if (!initialized) {
      fetchCurrentMode();
    }
  }, [initialized, fetchCurrentMode]);

  // Clear error after some time
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [error]);

  return {
    currentMode: 'unified', // Always return unified mode
    loading: false, // No need to load anything
    error: null,
    initialized: true, // Always initialized
    changeMode: async () => {}, // No-op function
    refresh: async () => {}, // No-op function
    isWolkeMode: false, // Deprecated - no longer used
    isManualMode: false, // Deprecated - no longer used
  };
};

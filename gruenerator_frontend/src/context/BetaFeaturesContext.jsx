import React, { createContext, useState, useEffect, useCallback } from 'react';
import { templatesSupabase } from '../components/utils/templatesSupabaseClient';

export const BetaFeaturesContext = createContext();

const getInitialState = (key, defaultValue) => {
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.warn(`Error reading localStorage key "${key}":`, error);
    return defaultValue;
  }
};

export const BetaFeaturesProvider = ({ children }) => {
  const [sharepicBetaEnabled, setSharepicBetaEnabledState] = useState(() => getInitialState('sharepicBetaEnabled', false));
  const [databaseBetaEnabled, setDatabaseBetaEnabledState] = useState(() => getInitialState('databaseBetaEnabled', false));
  // Add more beta features here as needed

  const setSharepicBetaEnabled = useCallback((value) => {
    setSharepicBetaEnabledState(value);
    try {
      window.localStorage.setItem('sharepicBetaEnabled', JSON.stringify(value));
    } catch (error) {
      console.warn('Error writing sharepicBetaEnabled to localStorage:', error);
    }
  }, []);

  const setDatabaseBetaEnabled = useCallback((value) => {
    setDatabaseBetaEnabledState(value);
    try {
      window.localStorage.setItem('databaseBetaEnabled', JSON.stringify(value));
    } catch (error) {
      console.warn('Error writing databaseBetaEnabled to localStorage:', error);
    }
  }, []);

  // Check admin access and auto-disable features user can't access
  useEffect(() => {
    const checkAndUpdateFeatureAccess = async () => {
      try {
        // Check database feature access
        const { data: canAccessDatabase, error: dbError } = await templatesSupabase
          .rpc('can_access_beta_feature', { feature_name: 'database' });
        
        if (dbError) {
          console.warn('Error checking database access:', dbError);
        } else if (!canAccessDatabase && databaseBetaEnabled) {
          console.log('Auto-disabling database feature due to lack of access');
          setDatabaseBetaEnabled(false);
        }

        // Sharepic is public, so no check needed - always allowed
        
      } catch (error) {
        console.warn('Error in feature access check:', error);
      }
    };

    // Run check on mount and when features change
    if (templatesSupabase) {
      checkAndUpdateFeatureAccess();
    }
  }, [databaseBetaEnabled, setDatabaseBetaEnabled]);

  // Effect to listen for storage changes from other tabs (optional but good for UX)
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === 'sharepicBetaEnabled') {
        setSharepicBetaEnabledState(event.newValue ? JSON.parse(event.newValue) : false);
      }
      if (event.key === 'databaseBetaEnabled') {
        setDatabaseBetaEnabledState(event.newValue ? JSON.parse(event.newValue) : false);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);


  return (
    <BetaFeaturesContext.Provider value={{ 
      sharepicBetaEnabled, 
      setSharepicBetaEnabled,
      databaseBetaEnabled,
      setDatabaseBetaEnabled
      // Add more features here
    }}>
      {children}
    </BetaFeaturesContext.Provider>
  );
}; 
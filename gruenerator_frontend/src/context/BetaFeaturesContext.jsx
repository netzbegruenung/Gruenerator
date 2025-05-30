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
  const [youBetaEnabled, setYouBetaEnabledState] = useState(() => getInitialState('youBetaEnabled', false));
  const [collabBetaEnabled, setCollabBetaEnabledState] = useState(() => getInitialState('collabBetaEnabled', false));
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

  const setYouBetaEnabled = useCallback((value) => {
    setYouBetaEnabledState(value);
    try {
      window.localStorage.setItem('youBetaEnabled', JSON.stringify(value));
    } catch (error) {
      console.warn('Error writing youBetaEnabled to localStorage:', error);
    }
  }, []);

  const setCollabBetaEnabled = useCallback((value) => {
    setCollabBetaEnabledState(value);
    try {
      window.localStorage.setItem('collabBetaEnabled', JSON.stringify(value));
    } catch (error) {
      console.warn('Error writing collabBetaEnabled to localStorage:', error);
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

        // Check you feature access
        const { data: canAccessYou, error: youError } = await templatesSupabase
          .rpc('can_access_beta_feature', { feature_name: 'you' });
        
        if (youError) {
          console.warn('Error checking you access:', youError);
        } else if (!canAccessYou && youBetaEnabled) {
          console.log('Auto-disabling you feature due to lack of access');
          setYouBetaEnabled(false);
        }

        // Check collab feature access
        const { data: canAccessCollab, error: collabError } = await templatesSupabase
          .rpc('can_access_beta_feature', { feature_name: 'collab' });
        
        if (collabError) {
          console.warn('Error checking collab access:', collabError);
        } else if (!canAccessCollab && collabBetaEnabled) {
          console.log('Auto-disabling collab feature due to lack of access');
          setCollabBetaEnabled(false);
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
  }, [databaseBetaEnabled, setDatabaseBetaEnabled, youBetaEnabled, setYouBetaEnabled, collabBetaEnabled, setCollabBetaEnabled]);

  // Effect to listen for storage changes from other tabs (optional but good for UX)
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === 'sharepicBetaEnabled') {
        setSharepicBetaEnabledState(event.newValue ? JSON.parse(event.newValue) : false);
      }
      if (event.key === 'databaseBetaEnabled') {
        setDatabaseBetaEnabledState(event.newValue ? JSON.parse(event.newValue) : false);
      }
      if (event.key === 'youBetaEnabled') {
        setYouBetaEnabledState(event.newValue ? JSON.parse(event.newValue) : false);
      }
      if (event.key === 'collabBetaEnabled') {
        setCollabBetaEnabledState(event.newValue ? JSON.parse(event.newValue) : false);
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
      setDatabaseBetaEnabled,
      youBetaEnabled,
      setYouBetaEnabled,
      collabBetaEnabled,
      setCollabBetaEnabled
      // Add more features here
    }}>
      {children}
    </BetaFeaturesContext.Provider>
  );
}; 
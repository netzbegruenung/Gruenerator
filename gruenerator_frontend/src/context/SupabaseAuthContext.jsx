import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { templatesSupabase } from '../components/utils/templatesSupabaseClient';

// Context erstellen
export const SupabaseAuthContext = createContext(null);

// Custom Hook für einfachen Zugriff auf den Context
export const useSupabaseAuth = () => {
  const context = useContext(SupabaseAuthContext);
  if (!context) {
    throw new Error('useSupabaseAuth muss innerhalb eines SupabaseAuthProviders verwendet werden');
  }
  return context;
};

export const SupabaseAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deutschlandmodus, setDeutschlandmodusState] = useState(null);
  const [betaFeatures, setBetaFeatures] = useState({});
  const [selectedMessageColor, setSelectedMessageColor] = useState('#008939'); // Default Klee

  useEffect(() => {
    // Initialen Sitzungszustand abrufen
    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession }, error: sessionError } = await templatesSupabase.auth.getSession();
        
        if (sessionError) {
          throw sessionError;
        }

        setSession(initialSession);
        const currentUser = initialSession?.user ?? null;
        setUser(currentUser);
        if (currentUser && currentUser.user_metadata) {
          setSelectedMessageColor(currentUser.user_metadata.chat_color || '#008939');
          setBetaFeatures(currentUser.user_metadata.beta_features || {});
        }

      } catch (err) {
        console.error('Fehler beim Abrufen der Session:', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Auth state change listener einrichten
    const { data: { subscription } } = templatesSupabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      const newUser = newSession?.user ?? null;
      setUser(newUser);
      if (newUser && newUser.user_metadata) {
        setSelectedMessageColor(newUser.user_metadata.chat_color || '#008939');
        setBetaFeatures(newUser.user_metadata.beta_features || {});
      } else if (!newUser) {
        // Reset to default if user logs out
        setSelectedMessageColor('#008939');
        setBetaFeatures({}); // Reset beta features on logout
      }
      if (!newSession) {
        setDeutschlandmodusState(null); // Keep for now, or decide if deutschlandmodus becomes a key in betaFeatures
        setBetaFeatures({}); // Reset beta features if session is lost
      }
      setLoading(false);
    });

    // Cleanup-Funktion für den Event-Listener
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Add stable setter function for deutschlandmodus
  const setDeutschlandmodusInContext = useCallback((value) => {
    console.log('[AuthContext] Setting deutschlandmodus to:', value); // Log zur Überprüfung
    // This function will now update the specific key in betaFeatures
    // For direct deutschlandmodus, it's kept for compatibility or specific direct use if needed
    // but primary beta settings go through updateUserBetaFeatures
    setDeutschlandmodusState(value); // Keep if deutschlandmodus has a special direct status
    // If deutschlandmodus is just another beta feature, this direct setter might be redundant
    // or could be a specific alias to updateUserBetaFeatures for that key.
  }, []);

  const updateUserBetaFeatures = async (featureKey,isEnabled) => {
    if (!user) {
      console.error("User not logged in, cannot update beta features.");
      return;
    }
    try {
      const currentBetaFeatures = { ...(user.user_metadata.beta_features || {}), [featureKey]: isEnabled };
      
      // Optimistic update to the local state
      setBetaFeatures(currentBetaFeatures);

      const { error: updateError } = await templatesSupabase.auth.updateUser({
        data: { beta_features: currentBetaFeatures } 
      });

      if (updateError) {
        console.error("Error updating user beta features in Supabase:", updateError);
        // Revert optimistic update if needed
        setBetaFeatures(user.user_metadata.beta_features || {}); // Revert to original from metadata
        throw updateError;
      }
      // User object will eventually update via onAuthStateChange
    } catch (err) {
      console.error("Failed to update beta features:", err);
      // Handle error (e.g., display a notification to the user)
    }
  };

  const updateUserMessageColor = async (newColor) => {
    if (!user) {
      console.error("User not logged in, cannot update message color.");
      return;
    }
    try {
      setSelectedMessageColor(newColor); // Optimistic update
      const { error: updateError } = await templatesSupabase.auth.updateUser({
        data: { chat_color: newColor } 
      });
      if (updateError) {
        console.error("Error updating user message color in Supabase:", updateError);
        // Revert optimistic update if needed, or handle error display
        // For now, just log it. A more robust solution might involve reverting.
        // setSelectedMessageColor(user.user_metadata.chat_color || '#008939'); 
        throw updateError;
      }
      // Successfully updated in Supabase, user object will eventually update via onAuthStateChange
      // or we might need to manually merge it if onAuthStateChange doesn't fire for metadata updates.
      // For now, we rely on the state change listener to reflect the persisted change.
    } catch (err) {
      console.error("Failed to update message color:", err);
      // Handle error (e.g., display a notification to the user)
    }
  };

  // Auth-Funktionen
  const login = async (email, password) => {
    try {
      setError(null);
      const { data, error } = await templatesSupabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const signup = async (email, password) => {
    try {
      setError(null);
      const { data, error } = await templatesSupabase.auth.signUp({
        email,
        password
      });
      
      if (error) throw error;
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      setError(null);
      const { error } = await templatesSupabase.auth.signOut();
      
      if (error) throw error;
      setDeutschlandmodusState(null);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const sendPasswordResetEmail = async (email) => {
    try {
      setError(null);
      const { error } = await templatesSupabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      
      if (error) throw error;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updatePassword = async (newPassword) => {
    try {
      setError(null);
      const { error } = await templatesSupabase.auth.updateUser({
        password: newPassword
      });
      
      if (error) throw error;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const value = {
    user,
    session,
    loading,
    error,
    login,
    signup,
    logout,
    sendPasswordResetEmail,
    updatePassword,
    supabase: templatesSupabase,
    deutschlandmodus,
    setDeutschlandmodusInContext,
    betaFeatures,
    updateUserBetaFeatures,
    selectedMessageColor,
    updateUserMessageColor
  };

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
};

export default SupabaseAuthProvider; 
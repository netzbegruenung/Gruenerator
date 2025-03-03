import React, { createContext, useContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const AuthContext = createContext();
const VERIFY_PASSWORD = process.env.REACT_APP_VERIFY_PASSWORD;
const STORAGE_KEY = 'verifiedFeatures';
const EXPIRY_TIME = 7 * 24 * 60 * 60 * 1000; // 7 Tage in Millisekunden

export function AuthProvider({ children }) {
  const [isVerified, setIsVerified] = useState(false);
  const [verifiedFeatures, setVerifiedFeatures] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const { features, expiry } = JSON.parse(stored);
        if (expiry > Date.now()) {
          return features;
        }
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error('Fehler beim Laden der verifizierten Features:', error);
    }
    return [];
  });

  useEffect(() => {
    if (verifiedFeatures.length > 0) {
      const data = {
        features: verifiedFeatures,
        expiry: Date.now() + EXPIRY_TIME
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [verifiedFeatures]);

  const verifyPassword = async (password, feature) => {
    if (!VERIFY_PASSWORD) return false;

    const isValid = password === VERIFY_PASSWORD;
    
    if (isValid) {
      setVerifiedFeatures(prev => [...new Set([...prev, feature])]);
      setIsVerified(true);
      return true;
    }
    return false;
  };

  const isFeatureVerified = (feature) => {
    return verifiedFeatures.includes(feature);
  };

  const value = {
    isVerified,
    verifyPassword,
    isFeatureVerified,
    verifiedFeatures
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth muss innerhalb eines AuthProviders verwendet werden');
  }
  return context;
} 
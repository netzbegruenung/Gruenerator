import React, { createContext, useContext, useState } from 'react';
import PropTypes from 'prop-types';

const AuthContext = createContext();
const VERIFY_PASSWORD = process.env.REACT_APP_VERIFY_PASSWORD;

export function AuthProvider({ children }) {
  const [isVerified, setIsVerified] = useState(false);
  const [verifiedFeatures, setVerifiedFeatures] = useState([]);

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
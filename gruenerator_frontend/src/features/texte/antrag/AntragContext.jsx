import React, { createContext, useContext, useState } from 'react';
import PropTypes from 'prop-types';

const AntragContext = createContext();

export const AntragProvider = ({ children }) => {
  const [formData, setFormData] = useState({
    idee: '',
    details: '',
    gliederung: '',
  });
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [generatedAntrag, setGeneratedAntrag] = useState('');
  const [displayedSearchResults, setDisplayedSearchResults] = useState('');
  const [displayedSources, setDisplayedSources] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Wrapper-Funktionen mit Logging
  const setDisplayedSourcesWithLogging = (content) => {
    console.log('[AntragContext] Setze displayedSources:', content ? content.substring(0, 100) + '...' : 'leer');
    setDisplayedSources(content);
  };

  const setDisplayedSearchResultsWithLogging = (content) => {
    console.log('[AntragContext] Setze displayedSearchResults:', content ? content.substring(0, 100) + '...' : 'leer');
    setDisplayedSearchResults(content);
  };

  const value = {
    formData,
    setFormData,
    useWebSearch,
    setUseWebSearch,
    searchResults,
    setSearchResults,
    generatedAntrag,
    setGeneratedAntrag,
    displayedSearchResults,
    setDisplayedSearchResults: setDisplayedSearchResultsWithLogging,
    displayedSources,
    setDisplayedSources: setDisplayedSourcesWithLogging,
    loading,
    setLoading,
    error,
    setError,
  };

  return (
    <AntragContext.Provider value={value}>
      {children}
    </AntragContext.Provider>
  );
};

AntragProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export const useAntragContext = () => {
  const context = useContext(AntragContext);
  if (!context) {
    throw new Error('useAntragContext must be used within an AntragProvider');
  }
  return context;
}; 
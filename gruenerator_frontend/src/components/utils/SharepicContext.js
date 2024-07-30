import React, { createContext, useContext, useReducer } from 'react';
import PropTypes from 'prop-types'; // Importieren Sie PropTypes

const SharepicContext = createContext();

const initialState = {
  formData: {
    type: 'Zitat',
    thema: '',
    details: '',
    quote: '',
    name: '',
    line1: '',
    line2: '',
    line3: '',
    uploadedImage: null
  },
  currentStep: 0,
  generatedImageSrc: '',
  error: null,
  loading: false
};

function sharepicReducer(state, action) {
  switch (action.type) {
    case 'UPDATE_FORM_DATA':
      return { ...state, formData: { ...state.formData, ...action.payload } };
    case 'SET_CURRENT_STEP':
      return { ...state, currentStep: action.payload };
    case 'SET_GENERATED_IMAGE':
      return { ...state, generatedImageSrc: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

export function SharepicProvider({ children }) {
  const [state, dispatch] = useReducer(sharepicReducer, initialState);

  return (
    <SharepicContext.Provider value={{ state, dispatch }}>
      {children}
    </SharepicContext.Provider>
  );
}

// Fügen Sie die PropTypes-Validierung hinzu
SharepicProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useSharepicContext() {
  const context = useContext(SharepicContext);
  if (!context) {
    throw new Error('useSharepicContext must be used within a SharepicProvider');
  }
  return context;
}
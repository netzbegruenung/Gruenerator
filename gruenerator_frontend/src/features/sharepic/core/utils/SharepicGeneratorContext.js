// SharepicGeneratorContext.js
import React, { createContext, useReducer, useCallback, useContext, useMemo } from 'react';
import PropTypes from 'prop-types';
import { prepareDataForDreizeilenCanvas } from '../../dreizeilen/utils/dataPreparation';
import { debounce } from 'lodash';
import { prepareDataForQuoteCanvas } from '../../quote/utils/dataPreparation';

import {
  SHAREPIC_TYPES,
  FORM_STEPS,
  FONT_SIZES,
  ERROR_MESSAGES,
  DEFAULT_COLORS,
} from '../../../../components/utils/constants';

const SharepicGeneratorContext = createContext();

const initialState = {
  formData: {
    type: '',
    thema: '',
    details: '',
    line1: '',
    line2: '',
    line3: '',
    quote: '',
    name: '',
    fontSize: FONT_SIZES.M,
    balkenOffset: [50, -100, 50],
    colorScheme: DEFAULT_COLORS,
    balkenGruppenOffset: [0, 0],
    sunflowerOffset: [0, 0],
    credit: '',
    isAdvancedEditingOpen: false,
    searchTerms: [],
    sloganAlternatives: []
  },
  currentStep: FORM_STEPS.WELCOME,
  error: null,
  loading: false,
  uploadedImage: null,
  isLottieVisible: false,
  file: null,
};

function sharepicGeneratorReducer(state, action) {
  console.log('Reducer received action:', action);

  switch (action.type) {
    case 'UPDATE_FORM_DATA': {
      const updatedFormData = Object.keys(action.payload).reduce((acc, key) => {
        if (key === 'balkenOffset' && !Array.isArray(action.payload[key])) {
          console.warn('Invalid balkenOffset in UPDATE_FORM_DATA:', action.payload[key]);
          acc[key] = Array.isArray(state.formData[key]) ? state.formData[key] : [50, -100, 50];
        } else {
          acc[key] = action.payload[key];
        }
        return acc;
      }, { ...state.formData });
    
      return {
        ...state,
        formData: updatedFormData,
        currentStep: action.payload.currentStep !== undefined ? action.payload.currentStep : state.currentStep,
        loading: action.payload.loading !== undefined ? action.payload.loading : state.loading,
        generatedImageSrc: action.payload.generatedImageSrc || state.generatedImageSrc,
        selectedImage: action.payload.selectedImage || state.selectedImage,
      };
    }
    case 'SET_CURRENT_STEP':
      return { ...state, currentStep: action.payload };
    case 'SET_LOADING_UNSPLASH_IMAGES':
      return { ...state, isLoadingUnsplashImages: action.payload };
    case 'SET_UNSPLASH_IMAGES':
      console.log('Reducer: Setting new unsplash images', action.payload);
      return { 
        ...state, 
        unsplashImages: action.payload,
        isLoadingUnsplashImages: false // Setzen Sie isLoadingUnsplashImages auf false, wenn neue Bilder gesetzt werden
      };
    case 'SET_UNSPLASH_ERROR':
      return { ...state, unsplashError: action.payload };
    case 'SET_SELECTED_IMAGE':
      return { ...state, selectedImage: action.payload };
    case 'SET_GENERATED_IMAGE':
      return { ...state, generatedImageSrc: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_UPLOADED_IMAGE':
      return { ...state, uploadedImage: action.payload };
    case 'RESET_UNSPLASH_STATE':
      return { 
        ...state, 
        unsplashImages: [], 
        isLoadingUnsplashImages: false, 
        unsplashError: null,
        selectedImage: null
      };
    case 'UPDATE_IMAGE_MODIFICATION': {
      const updatedFormData = {
        ...state.formData,
        colorScheme: action.payload.colorScheme || state.formData.colorScheme,
        fontSize: action.payload.fontSize || state.formData.fontSize,
        balkenOffset: Array.isArray(action.payload.balkenOffset) 
          ? action.payload.balkenOffset 
          : (Array.isArray(state.formData.balkenOffset) ? state.formData.balkenOffset : [50, -100, 50]),
      };
    
      return {
        ...state,
        formData: updatedFormData
      };
    }
    case 'RESET_STATE':
      return initialState;
    case 'SET_SEARCH_BAR_ACTIVE':
      return { ...state, isSearchBarActive: action.payload };
    case 'SET_LOTTIE_VISIBLE': // Angepasste Case für Lottie
      return { ...state, isLottieVisible: action.payload };
    case 'SET_FILE':
      return {
        ...state,
        file: action.payload
      };
    case 'SET_SLOGAN_ALTERNATIVES':
      return {
        ...state,
        formData: {
          ...state.formData,
          sloganAlternatives: action.payload
        }
      };
    case 'SELECT_SLOGAN':
      return {
        ...state,
        formData: {
          ...state.formData,
          line1: action.payload.line1,
          line2: action.payload.line2,
          line3: action.payload.line3
        }
      };
    default:
      return state;
    case 'UPDATE_BALKEN_GRUPPEN_OFFSET':
      return {
        ...state,
        formData: {
          ...state.formData,
          balkenGruppenOffset: action.payload,
        },
      };
    case 'UPDATE_SUNFLOWER_OFFSET':
      return {
        ...state,
        formData: {
          ...state.formData,
          sunflowerOffset: action.payload,
        },
      };
    case 'UPDATE_CREDIT':
      return {
        ...state,
        formData: {
          ...state.formData,
          credit: action.payload,
        },
      };
    case 'SET_ADVANCED_EDITING':
      return { ...state, isAdvancedEditingOpen: action.payload };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.payload.isSubmitting, currentSubmittingStep: action.payload.step };
  }
}

export const generateImage = async (formData, modificationData) => {
    try {
        const isQuote = formData.type === 'Zitat';
        const formDataToSend = isQuote 
            ? prepareDataForQuoteCanvas(formData, modificationData)
            : prepareDataForDreizeilenCanvas(formData, modificationData);

        const endpoint = isQuote ? 'zitat_canvas' : 'dreizeilen_canvas';
        const response = await fetch(`/api/${endpoint}`, {
            method: 'POST',
            body: formDataToSend
        });

        if (!response.ok) {
            throw new Error('Fehler beim Generieren des Bildes');
        }

        const data = await response.json();
        return data.image;
    } catch (error) {
        console.error('Fehler beim Generieren des Bildes:', error);
        throw error;
    }
};

export const generateQuote = async (thema, details, existingQuote = '', name = '') => {
    try {
        const response = await fetch('/api/zitat_claude', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                thema,
                details,
                quote: existingQuote,
                name
            })
        });

        if (!response.ok) {
            throw new Error('Fehler bei der Zitat-Generierung');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Fehler bei der Zitat-Generierung:', error);
        throw error;
    }
};

export function SharepicGeneratorProvider({ children }) {
  const [state, dispatch] = useReducer(sharepicGeneratorReducer, initialState);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    dispatch({ 
      type: 'UPDATE_FORM_DATA', 
      payload: { [name]: value } 
    });
  }, []);

  const setLottieVisible = useCallback((isVisible) => {
    dispatch({ type: 'SET_LOTTIE_VISIBLE', payload: isVisible });
  }, []);

  const setFile = useCallback((file) => {
    dispatch({ type: 'SET_FILE', payload: file });
  }, []);

  const updateFormData = useCallback((data) => {
    console.log('SharepicGeneratorContext: Updating form data:', data);
    const safeData = { ...data };
    if ('balkenOffset' in safeData && !Array.isArray(safeData.balkenOffset)) {
      console.warn('Invalid balkenOffset in updateFormData:', safeData.balkenOffset);
      delete safeData.balkenOffset; // Entferne ungültige Werte
    }
    dispatch({ type: 'UPDATE_FORM_DATA', payload: safeData });
  }, []);

  const toggleAdvancedEditing = useCallback(() => {
    dispatch({ type: 'SET_ADVANCED_EDITING', payload: !state.isAdvancedEditingOpen });
  }, [state.isAdvancedEditingOpen]);

  const setError = useCallback((error) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  const setSearchBarActive = useCallback((isActive) => {
    dispatch({ type: 'SET_SEARCH_BAR_ACTIVE', payload: isActive });
  }, []);

  const updateBalkenGruppenOffset = useCallback((newOffset) => {
    dispatch({ type: 'UPDATE_BALKEN_GRUPPEN_OFFSET', payload: newOffset });
  }, []);

  const updateCredit = useCallback((credit) => {
    dispatch({ type: 'UPDATE_CREDIT', payload: credit });
  }, []);

  const updateSunflowerOffset = useCallback((newOffset) => {
    dispatch({ type: 'UPDATE_SUNFLOWER_OFFSET', payload: newOffset });
  }, []);

  const handleUnsplashSearch = useCallback((query) => {
    if (!query) return;
    const searchUrl = `https://unsplash.com/de/s/fotos/${encodeURIComponent(query)}?license=free`;
    window.open(searchUrl, '_blank');
  }, []);

  const modifyImage = useCallback(async (modificationData) => {
    try {
      console.log('Modifying image with data:', modificationData);
      const formDataToSend = prepareDataForDreizeilenCanvas(state.formData, modificationData, state.file);

      const response = await fetch('/api/dreizeilen_canvas', {
        method: 'POST',
        body: formDataToSend,
      });

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.NETWORK_ERROR);
      }

      const result = await response.json();
      if (!result.image) {
        throw new Error(ERROR_MESSAGES.NO_IMAGE_DATA);
      }

      dispatch({ type: 'SET_GENERATED_IMAGE', payload: result.image });
      dispatch({ 
        type: 'UPDATE_FORM_DATA', 
        payload: { 
          fontSize: modificationData.fontSize,
          balkenOffset: modificationData.balkenOffset,
          colorScheme: modificationData.colorScheme,
          credit: modificationData.credit, // Include credit in the update

        } 
      });

      console.log('Image successfully modified');
      return result.image;
    } catch (error) {
      console.error('Error in modifyImage:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message });
      throw error;
    }
  }, [state.formData, state.file]);

  const debouncedModifyImage = useMemo(
    () => debounce(modifyImage, 300),
    [modifyImage]
  );

  const updateImageModification = useCallback(async (modificationData) => {
    console.log('Updating image modification:', modificationData);
    dispatch({ type: 'UPDATE_IMAGE_MODIFICATION', payload: modificationData });
    
    if (state.currentStep === FORM_STEPS.RESULT) {
      await debouncedModifyImage(modificationData);
    }
  }, [state.currentStep, debouncedModifyImage]);
  
  const setAlternatives = useCallback((alternatives) => {
    dispatch({ type: 'SET_SLOGAN_ALTERNATIVES', payload: alternatives });
  }, []);

  const selectSlogan = useCallback((slogan) => {
    dispatch({ type: 'SELECT_SLOGAN', payload: slogan });
  }, []);

  const value = useMemo(() => ({
    state,
    setFile,
    updateFormData,
    setError,
    handleUnsplashSearch,
    isAdvancedEditingOpen: state.isAdvancedEditingOpen,
    modifyImage,
    updateCredit,
    updateImageModification,
    setLottieVisible,
    setAlternatives,
    selectSlogan,
    SHAREPIC_TYPES,
    FORM_STEPS,
    FONT_SIZES,
    ERROR_MESSAGES,
    setSearchBarActive, 
    toggleAdvancedEditing,
    generateImage,
    generateQuote,
    handleChange
  }), [
    state,
    setFile,
    updateFormData,
    setError,
    handleUnsplashSearch,
    modifyImage,
    updateImageModification,
    setSearchBarActive, 
    setLottieVisible,
    updateBalkenGruppenOffset,
    updateSunflowerOffset,
    toggleAdvancedEditing,
    setAlternatives,
    selectSlogan,
    generateImage,
    generateQuote,
    handleChange
  ]);

  return (
    <SharepicGeneratorContext.Provider value={value}>
      {children}
    </SharepicGeneratorContext.Provider>
  );
}
SharepicGeneratorProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useSharepicGeneratorContext = () => {
  const context = useContext(SharepicGeneratorContext);
  if (!context) {
    throw new Error('useSharepicGeneratorContext must be used within a SharepicGeneratorProvider');
  }
  return context;
};

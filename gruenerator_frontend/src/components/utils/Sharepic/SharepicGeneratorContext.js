// SharepicGeneratorContext.js
import React, { createContext, useReducer, useCallback, useContext, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useUnsplashService } from '../Unsplash/unsplashService';
import { prepareDataForDreizeilenCanvas } from './dataPreparation';
import { debounce } from 'lodash';


import {
  SHAREPIC_TYPES,
  FORM_STEPS,
  FONT_SIZES,
  ERROR_MESSAGES,
  DEFAULT_COLORS,
} from '../constants';

const SharepicGeneratorContext = createContext();

const initialState = {
  formData: {
    type: SHAREPIC_TYPES.THREE_LINES,
    thema: '',
    details: '',
    line1: '',
    line2: '',
    line3: '',
    fontSize: FONT_SIZES.m,
    balkenOffset: [50, -100, 50],
    colorScheme: DEFAULT_COLORS,
    balkenGruppenOffset: [0, 0],
    sunflowerOffset: [0, 0],
    credit: '', // Add credit to initial state
    isAdvancedEditingOpen: false,

  },
  currentStep: FORM_STEPS.INPUT,
  isLoadingUnsplashImages: false,
  unsplashError: null,
  selectedImage: null,
  generatedImageSrc: '',
  error: null,
  loading: false,
  uploadedImage: null,
  isSearchBarActive: false, 
  isLottieVisible: false, 
};

function sharepicGeneratorReducer(state, action) {
  console.log('Reducer received action:', action);

  switch (action.type) {
    case 'UPDATE_FORM_DATA':
      return {
        ...state,
        formData: { ...state.formData, ...action.payload },
        currentStep: action.payload.currentStep !== undefined 
          ? action.payload.currentStep 
          : state.currentStep,
        loading: action.payload.loading !== undefined 
          ? action.payload.loading 
          : state.loading,
        generatedImageSrc: action.payload.generatedImageSrc || state.generatedImageSrc,
        selectedImage: action.payload.selectedImage || state.selectedImage,
      };
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
        };    case 'SET_UNSPLASH_ERROR':
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
      case 'UPDATE_IMAGE_MODIFICATION':
        return {
          ...state,
          formData: {
            ...state.formData,
            colorScheme: action.payload.colorScheme || state.formData.colorScheme,
            fontSize: action.payload.fontSize || state.formData.fontSize,
            balkenOffset: action.payload.balkenOffset || state.formData.balkenOffset,
          }
        };
    case 'RESET_STATE':
      return initialState;
      case 'SET_SEARCH_BAR_ACTIVE':
      return { ...state, isSearchBarActive: action.payload };
    case 'SET_LOTTIE_VISIBLE': // Angepasste Case für Lottie
      return { ...state, isLottieVisible: action.payload };
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
export function SharepicGeneratorProvider({ children }) {
  const [state, dispatch] = useReducer(sharepicGeneratorReducer, initialState);
 
  const handleUnsplashImagesUpdate = useCallback((newImages) => {
    console.log('handleUnsplashImagesUpdate called with:', newImages);
    dispatch({ type: 'SET_UNSPLASH_IMAGES', payload: newImages });
  }, []);
   
  const unsplashService = useUnsplashService(handleUnsplashImagesUpdate);

  const setLottieVisible = useCallback((isVisible) => {
    dispatch({ type: 'SET_LOTTIE_VISIBLE', payload: isVisible });
  }, []);

  const setFile = useCallback((file) => {
    dispatch({ type: 'SET_FILE', payload: file });
  }, []);

  const updateFormData = useCallback((data) => {
    console.log('SharepicGeneratorContext: Updating form data:', data);
    dispatch({ type: 'UPDATE_FORM_DATA', payload: data });
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

  const handleUnsplashSearch = useCallback(async (query) => {
    if (!query) return;
    
    console.log('handleUnsplashSearch called with query:', query);
    
    dispatch({ type: 'SET_LOADING_UNSPLASH_IMAGES', payload: true });
    dispatch({ type: 'SET_UNSPLASH_ERROR', payload: null });
  
    try {
      console.log('Fetching Unsplash images for query:', query);
      await unsplashService.fetchUnsplashImages([query], true);
      dispatch({ type: 'SET_UNSPLASH_ERROR', payload: null });
    } catch (error) {
      console.error('Error fetching Unsplash images:', error);
      dispatch({ type: 'SET_UNSPLASH_IMAGES', payload: [] });
      dispatch({ type: 'SET_UNSPLASH_ERROR', payload: error.message });
    } finally {
      dispatch({ type: 'SET_LOADING_UNSPLASH_IMAGES', payload: false });
      setLottieVisible(false);  // Hier das Lottie ausblenden

    }
  }, [unsplashService]);

 
  const modifyImage = useCallback(async (modificationData) => {
    try {
      console.log('Modifying image with data:', modificationData);
      const formDataToSend = prepareDataForDreizeilenCanvas(state.formData, modificationData);

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
  }, [state.formData, dispatch, prepareDataForDreizeilenCanvas]);

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
  
  const value = useMemo(() => ({
    state,
    setFile,
    updateFormData,
    setError,
    handleUnsplashSearch,
    fetchFullSizeImage: unsplashService.fetchFullSizeImage,
    triggerDownload: unsplashService.triggerDownload,
    isAdvancedEditingOpen: state.isAdvancedEditingOpen,
    modifyImage,
    updateCredit, // Add updateCredit to the context value
    updateImageModification,
    setLottieVisible, // Methode zum Setzen der Lottie-Sichtbarkeit
    SHAREPIC_TYPES,
    FORM_STEPS,
    FONT_SIZES,
    ERROR_MESSAGES,
    setSearchBarActive, 
    toggleAdvancedEditing
    
    

  }), [
    state,
    setFile,
    updateFormData,
    setError,
    handleUnsplashSearch,
    unsplashService.fetchFullSizeImage,
    unsplashService.triggerDownload,
    modifyImage,
    updateImageModification,
    setSearchBarActive, 
    setLottieVisible,
    updateBalkenGruppenOffset,
    updateSunflowerOffset,
    toggleAdvancedEditing

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
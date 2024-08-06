import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { useSharepicContext, getFontSizeInPixels } from '../../utils/SharepicContext';
import { FORM_STEPS, BUTTON_LABELS, SHAREPIC_TYPES, FONT_SIZES } from '../../utils/constants';
import BaseForm from '../../common/BaseForm';
import { useSharepicGeneration } from '../../hooks/sharepic/useSharepicGeneration';
import { useSharepicRendering } from '../../hooks/sharepic/useSharepicRendering';
import { useFormValidation } from '../../hooks/useFormValidation';
import ErrorBoundary from '../../ErrorBoundary';
import useGeneratePost from '../../hooks/sharepic/useGeneratePost';
import FileUpload from '../../utils/FileUpload';
import { useUnsplashService} from '../../utils/Unsplash/unsplashService';

const SharepicGenerator = ({ showHeaderFooter = true, darkMode }) => {
  console.log('SharepicGenerator: Rendering component');

  // Context und State-Definitionen
  const { state, dispatch } = useSharepicContext();
  const { formData, error: contextError, loading: contextLoading, fontSize } = state;
  const [currentStep, setCurrentStep] = useState(FORM_STEPS.INPUT);
  const [generatedImageSrc, setGeneratedImageSrc] = useState('');
  const [file, setFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [searchTerms, setSearchTerms] = useState([]);
  const [generatedPost, setGeneratedPost] = useState(null);
  const [selectedUnsplashImage, setSelectedUnsplashImage] = useState(null);
  const [isImageModified, setIsImageModified] = useState(false);
  const [isLoading] = useState(false);
  const [error, setError] = useState(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [isLoadingUnsplashImages, setIsLoadingUnsplashImages] = useState(false);
const [isSearchBarActive, setIsSearchBarActive] = useState(false);
const [forceUpdateKey, setForceUpdateKey] = useState(0);


  // Custom Hooks
  const { generateText, generateImage, loading: generationLoading, error: generationError } = useSharepicGeneration();
  const { renderFormFields } = useSharepicRendering();
  const { generatePost } = useGeneratePost();
  const {
    unsplashImages,
    loading: unsplashLoading,
    error: unsplashError,
    fetchUnsplashImages,
    fetchFullSizeImage,
    triggerDownload
  } = useUnsplashService();

  const latestUnsplashImages = useRef(unsplashImages);

  const validationRules = {
    thema: { required: true },
    type: { required: true },
  };
  const { errors, validateForm } = useFormValidation(validationRules);

  // Berechnete Werte
  const totalLoading = contextLoading || generationLoading || isLoading || unsplashLoading;
  const totalError = contextError || generationError || uploadError || unsplashError || error;
  const defaultSharepicType = SHAREPIC_TYPES.THREE_LINES;

  // useEffect Hooks
  useEffect(() => {
    console.log('SharepicGenerator: unsplashImages updated', unsplashImages);
    latestUnsplashImages.current = unsplashImages;
  }, [unsplashImages]);

  useEffect(() => {
    console.log('SharepicGenerator: unsplashImages updated', unsplashImages);
    if (unsplashImages.length > 0) {
      console.log('Images loaded:', unsplashImages);
    }
  }, [unsplashImages]);
  

  useEffect(() => {
    console.log('SharepicGenerator: currentStep changed', currentStep);
    dispatch({ type: 'SET_ERROR', payload: null });
  }, [currentStep, dispatch]);

  useEffect(() => {
    console.log('SharepicGenerator: Setting initial form data');
    dispatch({
      type: 'UPDATE_FORM_DATA',
      payload: { type: SHAREPIC_TYPES.THREE_LINES }
    });
  }, [dispatch]);

  useEffect(() => {
    console.log('SharepicGenerator: useEffect for initial Unsplash image load', { currentStep, initialLoadDone, unsplashImages });
  
    if (currentStep === FORM_STEPS.PREVIEW && !initialLoadDone) {
      console.log('SharepicGenerator: Conditions met for initial Unsplash image load');
      fetchUnsplashImagesWrapper(true);
    }
  }, [currentStep, initialLoadDone]);

  useEffect(() => {
    console.log('useEffect: unsplashImages changed', unsplashImages);
    if (unsplashImages.length > 0) {
      console.log('Forcing update due to new unsplash images');
      setForceUpdateKey(prevKey => prevKey + 1);
    }
  }, [unsplashImages]);

  // Callback-Funktionen
  const fetchUnsplashImagesWrapper = useCallback(async (isInitialLoad = false) => {
    setIsLoadingUnsplashImages(true);
    let retryCount = 0;
    const maxRetries = 3;
  
    const tryFetchImages = async () => {
      try {
        const images = await fetchUnsplashImages(searchTerms, isInitialLoad);
        console.log('SharepicGenerator: Received images from Unsplash', images);
  
        if (images && images.length > 0) {
          setInitialLoadDone(true);
          return true;
        } else {
          console.log('SharepicGenerator: No images received');
          return false;
        }
      } catch (error) {
        console.error('SharepicGenerator: Error fetching Unsplash images:', error);
        return false;
      }
    };
  
    while (retryCount < maxRetries) {
      const success = await tryFetchImages();
      if (success) break;
      retryCount++;
      if (retryCount < maxRetries) {
        console.log(`SharepicGenerator: Retry attempt ${retryCount}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  
    if (retryCount === maxRetries) {
      setError('Fehler beim Laden der Unsplash-Bilder nach mehreren Versuchen');
    }
  
    setIsLoadingUnsplashImages(false);
  }, [fetchUnsplashImages, searchTerms]);
  

  const handleUnsplashSearch = useCallback((query) => {
    console.log('SharepicGenerator: Unsplash search triggered with query:', query);
    const newSearchTerms = query.split(',').map(term => term.trim());
  
    // Setzen Sie den Zustand unsplashImages auf ein leeres Array
    dispatch({ type: 'UPDATE_UNSPLASH_IMAGES', payload: [] });
    
    // Setzen Sie die Suchbegriffe und laden Sie die neuen Bilder
    setSearchTerms(newSearchTerms);
    fetchUnsplashImagesWrapper(true);
  }, [fetchUnsplashImagesWrapper, setSearchTerms, dispatch]);
  
  
  

  const handleFileChange = useCallback((selectedFile) => {
    console.log('SharepicGenerator: File selected', selectedFile);
    setFile(selectedFile);
    setUploadError(null);
    setIsSearchBarActive(false);  // Deaktiviere die Suchleiste
    dispatch({
      type: 'UPDATE_FORM_DATA',
      payload: { image: selectedFile }
    });
  }, [dispatch]);

  const handleImageSelection = useCallback((selectedImage) => {
    console.log('SharepicGenerator: Image selected', selectedImage);
    if (selectedImage) {
      setSelectedUnsplashImage(selectedImage);
    }
  }, []);
  
const handleUnsplashSelect = useCallback((selectedImage) => {
  console.log('SharepicGenerator: Unsplash image selected', selectedImage);
  if (selectedImage) {
    handleImageSelection(selectedImage);
    setIsSearchBarActive(false);  // Deaktiviere die Suchleiste
  }
}, [handleImageSelection]);

  const handleFontSizeChange = useCallback((event) => {
    console.log('SharepicGenerator: Font size changed', event.target.value);
    dispatch({ type: 'UPDATE_FONT_SIZE', payload: event.target.value });
  }, [dispatch]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    console.log('SharepicGenerator: Form data changed', { name, value });
    dispatch({
      type: 'UPDATE_FORM_DATA',
      payload: { [name]: value }
    });
  }, [dispatch]);

  const handleSubmit = async (event) => {
    if (event) event.preventDefault();
    
    console.log('SharepicGenerator: handleSubmit called', { currentStep, formData });
    
    dispatch({ type: 'SET_LOADING', payload: true });
    
    if (!validateForm(formData)) {
      console.log('SharepicGenerator: Form validation failed');
      dispatch({ type: 'SET_LOADING', payload: false });
      return;
    }
    
    try {
      if (currentStep === FORM_STEPS.INPUT) {
        const sharepicType = formData.type || defaultSharepicType;
        console.log('SharepicGenerator: Generating text', { sharepicType, thema: formData.thema, details: formData.details });
        const result = await generateText(sharepicType, { thema: formData.thema, details: formData.details });
        if (result) {
          console.log('SharepicGenerator: Text generation successful', result);
          dispatch({ 
            type: 'UPDATE_FORM_DATA', 
            payload: { ...result, type: sharepicType }
          });
          
          if (result.searchTerms && result.searchTerms.length > 0) {
            setSearchTerms(result.searchTerms);
            setCurrentStep(FORM_STEPS.PREVIEW);
          } else {
            console.error('No search terms found in the result');
          }
        } else {
          throw new Error("Keine Textdaten empfangen");
        }
      } else if (currentStep === FORM_STEPS.PREVIEW || currentStep === FORM_STEPS.RESULT) {
        let fileToUse = file;
        if (!fileToUse && selectedUnsplashImage) {
          console.log('Fetching full size image from:', selectedUnsplashImage.fullImageUrl);
          fileToUse = await fetchFullSizeImage(selectedUnsplashImage.fullImageUrl);
          console.log('Full size image fetched:', fileToUse);
          handleFileChange(fileToUse);
          console.log('Triggering download for:', selectedUnsplashImage.downloadLocation);
          await triggerDownload(selectedUnsplashImage.downloadLocation);
        }
        
        if (!fileToUse) {
          throw new Error("Bitte wählen Sie ein Bild aus");
        }
  
        console.log('SharepicGenerator: Generating image', { ...formData, fontSize });
        const imageResult = await generateImage({ ...formData, image: fileToUse, fontSize: getFontSizeInPixels(fontSize) });
        if (imageResult) {
          console.log('SharepicGenerator: Image generation successful');
          setGeneratedImageSrc(imageResult);
          setCurrentStep(FORM_STEPS.RESULT);
        } else {
          throw new Error("Keine Bilddaten empfangen");
        }
      }
    } catch (error) {
      console.error("SharepicGenerator: Error in handleSubmit:", error);
      dispatch({ type: 'SET_ERROR', payload: error.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleBack = useCallback(() => {
    if (currentStep === FORM_STEPS.RESULT) {
      if (window.confirm("Möchtest du wirklich zurück zum ersten Schritt? Das generierte Sharepic geht verloren.")) {
        setCurrentStep(FORM_STEPS.INPUT);
        setGeneratedImageSrc('');
        setIsImageModified(false);
        setFile(null);
        setGeneratedPost(null);
      }
    } else if (currentStep === FORM_STEPS.PREVIEW) {
      setCurrentStep(FORM_STEPS.INPUT);
      setFile(null);
      setGeneratedPost(null);
    } else if (currentStep > FORM_STEPS.INPUT) {
      setCurrentStep(prevStep => prevStep - 1);
      setGeneratedPost(null);
    }
  }, [currentStep]);

  const handleGeneratePost = useCallback(async () => {
    const formDataToSend = { thema: formData.thema, details: formData.details };
    console.log('SharepicGenerator: Generating post', formDataToSend);
    const post = await generatePost(formDataToSend);
    setGeneratedPost(post);
  }, [formData, generatePost]);

  // Render-Logik
  const submitButtonText = useMemo(() =>
    currentStep === FORM_STEPS.INPUT ? BUTTON_LABELS.GENERATE_TEXT :
    currentStep === FORM_STEPS.PREVIEW ? BUTTON_LABELS.GENERATE_IMAGE :
    BUTTON_LABELS.MODIFY_IMAGE,
    [currentStep]
  );

  const memoizedFormFields = useMemo(() => {
    console.log('SharepicGenerator: Rendering form fields', { currentStep, formData });
    return renderFormFields(currentStep, formData, handleChange, errors, defaultSharepicType);
  }, [currentStep, formData, handleChange, errors, defaultSharepicType, renderFormFields]);

  console.log('SharepicGenerator: Rendering with state', {
    currentStep,
    unsplashImages,
    isLoading,
    totalError
  });

  // Rendering
  return (
    <ErrorBoundary>
      <div
        className={`container ${showHeaderFooter ? 'with-header' : ''} ${darkMode ? 'dark-mode' : ''}`}
        role="main"
        aria-label="Sharepic Generator"
      >
        <BaseForm
          title="Sharepic Grünerator"
          onSubmit={handleSubmit}
          onBack={handleBack}
          loading={totalLoading}
          error={totalError}
          generatedContent={generatedImageSrc}
          useDownloadButton={currentStep === FORM_STEPS.RESULT}
          showBackButton={currentStep > FORM_STEPS.INPUT}
          submitButtonText={submitButtonText}
          isImageModified={isImageModified}
          generatedImageSrc={generatedImageSrc}
          showGeneratePostButton={currentStep === FORM_STEPS.RESULT && !generatedPost}
          onGeneratePost={handleGeneratePost}
          generatedPost={currentStep === FORM_STEPS.RESULT ? generatedPost : null}
          isSharepicGenerator={true}
          currentStep={currentStep}
          unsplashImages={unsplashImages}
          onUnsplashSelect={handleUnsplashSelect}
          unsplashLoading={unsplashLoading}
          unsplashError={unsplashError}
          fetchFullSizeImage={fetchFullSizeImage}
          triggerDownload={triggerDownload}
          isSearchBarActive={isSearchBarActive}
          isLoadingUnsplashImages={isLoadingUnsplashImages}
          onUnsplashSearch={handleUnsplashSearch}
          key={forceUpdateKey}  // Diese Zeile hinzufügen
          fileUploadComponent={
            <FileUpload
              loading={totalLoading}
              file={file}
              handleChange={handleFileChange}
              error={uploadError}
              allowedTypes={['image/*']}
              selectedUnsplashImage={selectedUnsplashImage}
            />
          }
          
          formErrors={errors}
        >
          {memoizedFormFields}
          {currentStep === FORM_STEPS.RESULT && (
            <div className="form-group">
              <label htmlFor="fontSize">Schriftgröße:</label>
              <select
                id="fontSize"
                name="fontSize"
                value={fontSize}
                onChange={handleFontSizeChange}
              >
                {Object.entries(FONT_SIZES).map(([key, value]) => (
                  <option key={key} value={key}>
                    {key.toUpperCase()} ({value}px)
                  </option>
                ))}
</select>
            </div>
          )}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

SharepicGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool,
  darkMode: PropTypes.bool.isRequired,
};

export default SharepicGenerator;
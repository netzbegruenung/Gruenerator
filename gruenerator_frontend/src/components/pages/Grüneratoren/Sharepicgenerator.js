import React, { useState, useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useSharepicContext } from '../../utils/SharepicContext';
import { FORM_STEPS, BUTTON_LABELS } from '../../utils/constants';
import BaseForm from '../../common/BaseForm';
import { useSharepicGeneration } from '../../hooks/sharepic/useSharepicGeneration';
import { useSharepicRendering } from '../../hooks/sharepic/useSharepicRendering';
import { useFormValidation } from '../../hooks/useFormValidation';
import ErrorBoundary from '../../ErrorBoundary';
import ImageModificationForm from '../../utils/ImageModificationForm';
import useGeneratePost from '../../hooks/sharepic/useGeneratePost';
import FileUpload from '../../utils/FileUpload';

const SharepicGenerator = ({ showHeaderFooter = true, darkMode }) => {
  const { state, dispatch } = useSharepicContext();
  const { formData, error: contextError, loading: contextLoading } = state;
  const [currentStep, setCurrentStep] = useState(FORM_STEPS.INPUT);
  const [generatedImageSrc, setGeneratedImageSrc] = useState('');
  const [isImageModified, setIsImageModified] = useState(false);
  const [imageModificationInstruction, setImageModificationInstruction] = useState('');
  const [file, setFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const { generateText, generateImage, modifyImage, loading: generationLoading, error: generationError } = useSharepicGeneration();
  const { renderFormFields } = useSharepicRendering();
  const { postContent, generatePost } = useGeneratePost();

  const validationRules = {
    thema: { required: true },
    type: { required: true },
  };

  const { errors, validateForm } = useFormValidation(validationRules);

  const isLoading = contextLoading || generationLoading;
  const error = contextError || generationError || uploadError;

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    dispatch({
      type: 'UPDATE_FORM_DATA',
      payload: { [name]: value }
    });
  }, [dispatch]);

  const handleFileChange = useCallback((selectedFile) => {
    setFile(selectedFile);
    setUploadError(null);
    dispatch({
      type: 'UPDATE_FORM_DATA',
      payload: { image: selectedFile }
    });
  }, [dispatch]);

  const uploadAndProcessFile = useCallback(async (file) => {
    if (!file) {
      setUploadError('Keine Datei ausgewählt');
      return null;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);

      console.log('Sending request to /api/upload');
      console.log('FormData content:', [...formData.entries()]);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server error response:', errorText);
        throw new Error(`Network error during upload: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Received data:', data);
      return data;
    } catch (error) {
      console.error('Error during upload:', error);
      setUploadError(error.message);
      return null;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [dispatch]);

  const handleSubmit = useCallback(async () => {
    console.log('handleSubmit called. Current step:', currentStep);
    console.log('Current form data:', formData);
    dispatch({ type: 'SET_LOADING', payload: true });
    if (!validateForm(formData)) {
      dispatch({ type: 'SET_LOADING', payload: false });
      return;
    }
    try {
      if (currentStep === FORM_STEPS.INPUT) {
        const result = await generateText(formData.type, { thema: formData.thema, details: formData.details });
        if (result) {
          dispatch({ type: 'UPDATE_FORM_DATA', payload: result });
          setCurrentStep(FORM_STEPS.PREVIEW);
        } else {
          throw new Error("Keine Textdaten empfangen");
        }
      } else if (currentStep === FORM_STEPS.PREVIEW) {
        if (!file) {
          throw new Error("Bitte wählen Sie ein Bild aus");
        }
        const imageResult = await uploadAndProcessFile(file);
        if (imageResult && imageResult.image) {
          setGeneratedImageSrc(imageResult.image);
          setCurrentStep(FORM_STEPS.RESULT);
        } else {
          throw new Error("Keine Bilddaten empfangen");
        }
      } else if (currentStep === FORM_STEPS.RESULT) {
        const modifiedParams = await modifyImage(imageModificationInstruction, formData);
        const newImageResult = await generateImage({ ...formData, ...modifiedParams });
        if (newImageResult && newImageResult.startsWith('data:image')) {
          setGeneratedImageSrc(newImageResult);
          setIsImageModified(true);
          dispatch({ type: 'UPDATE_FORM_DATA', payload: modifiedParams });
        } else {
          throw new Error("Keine modifizierten Bilddaten empfangen");
        }
      }
    } catch (error) {
      console.error("Error in handleSubmit:", error);
      dispatch({ type: 'SET_ERROR', payload: error.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [currentStep, formData, file, uploadAndProcessFile, dispatch, validateForm, generateImage, generateText, modifyImage, imageModificationInstruction]);

  const handleBack = useCallback(() => {
    if (currentStep === FORM_STEPS.RESULT) {
      if (window.confirm("Möchtest du wirklich zurück zum ersten Schritt? Das generierte Sharepic geht verloren.")) {
        setCurrentStep(FORM_STEPS.INPUT);
        setGeneratedImageSrc('');
        setIsImageModified(false);
        setFile(null);
      }
    } else if (currentStep > FORM_STEPS.INPUT) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const handleGeneratePost = useCallback(async () => {
    const formDataToSend = { thema: formData.thema, details: formData.details };
    console.log('FormData Inhalt:', formDataToSend);
    await generatePost(formDataToSend);
  }, [formData, generatePost]);

  const submitButtonText = useMemo(() =>
    currentStep === FORM_STEPS.INPUT ? BUTTON_LABELS.GENERATE_TEXT :
    currentStep === FORM_STEPS.PREVIEW ? BUTTON_LABELS.GENERATE_IMAGE :
    BUTTON_LABELS.MODIFY_IMAGE,
    [currentStep]
  );

  const memoizedFormFields = useMemo(() => {
    const fields = renderFormFields(currentStep, formData, handleChange, errors);
    
    if (currentStep === FORM_STEPS.PREVIEW) {
      return (
        <>
          {fields}
          <FileUpload
            loading={isLoading}
            file={file}
            handleChange={handleFileChange}
            error={uploadError}
            allowedTypes={['image/*']}
          />
        </>
      );
    }
    return fields;
  }, [currentStep, formData, handleChange, errors, renderFormFields, isLoading, file, handleFileChange, uploadError]);

  useEffect(() => {
    // Reset error state when switching steps
    dispatch({ type: 'SET_ERROR', payload: null });
  }, [currentStep, dispatch]);

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
          loading={isLoading}
          error={error}
          generatedContent={generatedImageSrc}
          useDownloadButton={currentStep === FORM_STEPS.RESULT}
          showBackButton={currentStep > FORM_STEPS.INPUT}
          submitButtonText={submitButtonText}
          isImageModified={isImageModified}
          generatedImageSrc={generatedImageSrc}
          showGeneratePostButton={!!generatedImageSrc}
          onGeneratePost={handleGeneratePost}
          generatedPost={postContent}
        >
          {memoizedFormFields}
          {currentStep === FORM_STEPS.RESULT && (
            <ImageModificationForm
              instruction={imageModificationInstruction}
              setInstruction={setImageModificationInstruction}
            />
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
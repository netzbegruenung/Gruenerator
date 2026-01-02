import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HiArrowLeft, HiCog, HiArrowRight, HiX, HiPhotograph } from 'react-icons/hi';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useStepFlow } from '../hooks/useStepFlow';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import StepFlowSloganStep from './StepFlowSloganStep';
import StockImagesGrid from '../steps/StockImagesGrid';
import SegmentedControl from '../../../components/common/UI/SegmentedControl';
import UnsplashAttribution from '../../../components/common/UnsplashAttribution';
import Button from '../../../components/common/SubmitButton';

import '../../../assets/styles/components/image-studio/typeform-fields.css';

const slideVariants = {
  enter: (direction) => ({
    y: direction > 0 ? 40 : -40,
    opacity: 0
  }),
  center: {
    y: 0,
    opacity: 1
  },
  exit: (direction) => ({
    y: direction < 0 ? 40 : -40,
    opacity: 0
  })
};

const StepFlowInputStep = ({
  field,
  value,
  onChange,
  onNext,
  onBack,
  isLastInput,
  loading,
  error,
  direction
}) => {
  const inputRef = useRef(null);
  const [fieldError, setFieldError] = useState(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [field?.name]);

  const handleChange = useCallback((e) => {
    setFieldError(null);
    onChange(e);
  }, [onChange]);

  const validateAndProceed = useCallback(() => {
    if (!field) return;

    const currentValue = value || '';

    if (field.required && !currentValue.trim()) {
      setFieldError(`${field.label} ist erforderlich`);
      return;
    }

    if (field.minLength && currentValue.trim().length < field.minLength) {
      setFieldError(`Mindestens ${field.minLength} Zeichen`);
      return;
    }

    onNext();
  }, [field, value, onNext]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      if (field?.type === 'textarea' && !e.shiftKey) {
        return;
      }
      if (field?.type !== 'textarea' || e.shiftKey) {
        e.preventDefault();
        validateAndProceed();
      }
    }
  }, [field, validateAndProceed]);

  const hasError = !!fieldError || !!error;
  const displayError = fieldError || error;

  return (
    <motion.div
      key={field?.name}
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="typeform-field"
      onKeyDown={handleKeyDown}
    >
      <div className="typeform-input-wrapper">
        {field?.type === 'textarea' ? (
          <textarea
            ref={inputRef}
            id={field.name}
            name={field.name}
            value={value}
            onChange={handleChange}
            placeholder={field.placeholder || 'Schreibe hier...'}
            rows={field.rows || 1}
            maxLength={field.maxLength}
            disabled={loading}
            className={`typeform-textarea ${hasError ? 'error-input' : ''}`}
          />
        ) : field?.type === 'select' ? (
          <select
            ref={inputRef}
            id={field?.name}
            name={field?.name}
            value={value}
            onChange={handleChange}
            disabled={loading}
            className={`typeform-select ${hasError ? 'error-input' : ''}`}
          >
            <option value="">{field?.placeholder || 'Bitte wählen...'}</option>
            {field?.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef}
            type={field?.type || 'text'}
            id={field?.name}
            name={field?.name}
            value={value}
            onChange={handleChange}
            placeholder={field.placeholder || 'Schreibe hier...'}
            disabled={loading}
            className={`typeform-input ${hasError ? 'error-input' : ''}`}
          />
        )}

        {field?.maxLength && value && value.length > (field.maxLength - 100) && (
          <div className="typeform-char-count">
            {value.length}/{field.maxLength}
          </div>
        )}

        {displayError && (
          <motion.p
            className="typeform-error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {displayError}
          </motion.p>
        )}
      </div>

      <div className="template-input-step__actions">
        <Button
          onClick={onBack}
          text="Zurück"
          icon={<HiArrowLeft />}
          className="btn-secondary"
          ariaLabel="Zurück"
        />
        <Button
          onClick={validateAndProceed}
          loading={loading}
          text={isLastInput ? "Grünerieren" : "Weiter"}
          icon={isLastInput ? <HiCog /> : <HiArrowRight />}
          className="btn-primary"
          ariaLabel={isLastInput ? "Text generieren" : "Weiter"}
        />
      </div>
    </motion.div>
  );
};

const IMAGE_SOURCE_TABS = [
  { value: 'upload', label: 'Hochladen' },
  { value: 'stock', label: 'Stock Bilder' }
];

const StepFlowImageUploadStep = ({ onNext, onBack, direction }) => {
  const {
    uploadedImage,
    updateFormData,
    imageSourceTab,
    setImageSourceTab,
    selectedStockImage,
    stockImageAttribution,
    resetStockImageState
  } = useImageStudioStore();

  const fileInputRef = useRef(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(() =>
    uploadedImage ? URL.createObjectURL(uploadedImage) : null
  );
  const isNewUploadRef = useRef(false);

  useEffect(() => {
    if (uploadedImage) {
      const url = URL.createObjectURL(uploadedImage);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [uploadedImage]);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileSelect = useCallback((file) => {
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) return;

    isNewUploadRef.current = true;
    updateFormData({ uploadedImage: file });
    setTimeout(() => onNext(), 50);
  }, [updateFormData, onNext]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const file = e.dataTransfer?.files?.[0];
    handleFileSelect(file);
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e) => {
    const file = e.target.files?.[0];
    handleFileSelect(file);
    e.target.value = '';
  }, [handleFileSelect]);

  const handleRemoveImage = useCallback(() => {
    updateFormData({ uploadedImage: null });
    resetStockImageState();
  }, [updateFormData, resetStockImageState]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleStockImageSelect = useCallback(() => {
    setTimeout(() => onNext(), 50);
  }, [onNext]);

  const handleTabChange = useCallback((tab) => {
    setImageSourceTab(tab);
  }, [setImageSourceTab]);

  const renderUploadContent = () => (
    <div
      className={`typeform-upload-content ${isDragActive ? 'typeform-upload-content--drag-active' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/jpeg,image/png,image/webp"
        hidden
        aria-label="Bild auswählen"
      />

      <div className="typeform-upload-wrapper">
        {!previewUrl ? (
          <div
            className={`typeform-upload-area ${isDragActive ? 'typeform-upload-area--active' : ''}`}
            onClick={handleUploadClick}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleUploadClick()}
            role="button"
            tabIndex={0}
            aria-label="Bild hochladen"
          >
            <HiPhotograph className="typeform-upload-icon" />
          </div>
        ) : (
          <div className="typeform-upload-preview">
            <img
              src={previewUrl}
              alt="Vorschau"
              className="typeform-upload-preview__image"
              onClick={handleUploadClick}
              style={{ cursor: 'pointer' }}
            />
            <button
              type="button"
              className="typeform-upload-preview__remove"
              onClick={handleRemoveImage}
              aria-label="Bild entfernen"
            >
              <HiX />
            </button>
            {stockImageAttribution && (
              <UnsplashAttribution
                photographer={stockImageAttribution.photographer}
                profileUrl={stockImageAttribution.profileUrl}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderStockContent = () => (
    <div className="typeform-stock-content">
      {previewUrl ? (
        <div className="typeform-upload-preview">
          <img
            src={previewUrl}
            alt={selectedStockImage?.alt_text || 'Ausgewähltes Stock Bild'}
            className="typeform-upload-preview__image"
          />
          <button
            type="button"
            className="typeform-upload-preview__remove"
            onClick={handleRemoveImage}
            aria-label="Bild entfernen"
          >
            <HiX />
          </button>
          {stockImageAttribution && (
            <UnsplashAttribution
              photographer={stockImageAttribution.photographer}
              profileUrl={stockImageAttribution.profileUrl}
            />
          )}
        </div>
      ) : (
        <StockImagesGrid onImageSelect={handleStockImageSelect} />
      )}
    </div>
  );

  return (
    <motion.div
      key="image_upload"
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="typeform-field typeform-field--image-upload"
    >
      <div className="typeform-image-source-tabs">
        <SegmentedControl
          steps={IMAGE_SOURCE_TABS}
          currentValue={imageSourceTab}
          onChange={handleTabChange}
          ariaLabel="Bildquelle auswählen"
        />
      </div>

      {imageSourceTab === 'upload' ? renderUploadContent() : renderStockContent()}

      <div className="template-input-step__actions">
        <Button
          onClick={onBack}
          text="Zurück"
          icon={<HiArrowLeft />}
          className="btn-secondary"
          ariaLabel="Zurück"
        />
        {previewUrl && (
          <Button
            onClick={onNext}
            text="Weiter"
            icon={<HiArrowRight />}
            className="btn-primary"
            ariaLabel="Weiter"
          />
        )}
      </div>
    </motion.div>
  );
};

const StepFlow = ({ onBack: parentOnBack, onComplete, imageLimitData }) => {
  const { handleChange, updateFormData, name } = useImageStudioStore();
  const { user } = useOptimizedAuth();

  const {
    stepIndex,
    direction,
    currentStep,
    flowSteps,
    isFirstStep,
    loading,
    error,
    goNext,
    goBack,
    getFieldValue
  } = useStepFlow();

  const userDisplayName = useMemo(() => {
    const displayName = user?.display_name || user?.name || '';
    return displayName.trim();
  }, [user]);

  useEffect(() => {
    if (!name && userDisplayName) {
      updateFormData({ name: userDisplayName });
    }
  }, [userDisplayName]);

  const handleBack = useCallback(() => {
    if (isFirstStep) {
      parentOnBack?.();
    } else {
      goBack();
    }
  }, [isFirstStep, parentOnBack, goBack]);

  const handleNext = useCallback(async () => {
    await goNext();
  }, [goNext]);

  // For template types: last input is before slogan step
  // For KI types: last input triggers image generation directly (afterComplete === 'generateImage')
  // For parallelPreload types: last input triggers parallel loading
  const isLastInputStep = currentStep?.type === 'input' && (
    currentStep?.afterComplete === 'generateText' ||
    currentStep?.afterComplete === 'generateImage' ||
    currentStep?.afterComplete === 'parallelPreload'
  );

  if (!currentStep) {
    return null;
  }

  return (
    <div className="typeform-container">
      <div className="typeform-content">
        <AnimatePresence mode="wait" custom={direction}>
          {currentStep.type === 'image_upload' && (
            <StepFlowImageUploadStep
              key={currentStep.id}
              onNext={handleNext}
              onBack={handleBack}
              direction={direction}
            />
          )}

          {currentStep.type === 'input' && (
            <StepFlowInputStep
              key={currentStep.id}
              field={currentStep.field}
              value={getFieldValue(currentStep.field?.name)}
              onChange={handleChange}
              onNext={handleNext}
              onBack={handleBack}
              isLastInput={isLastInputStep}
              loading={loading}
              error={error}
              direction={direction}
            />
          )}

          {currentStep.type === 'slogan' && (
            <StepFlowSloganStep
              key={currentStep.id}
              onNext={handleNext}
              onBack={handleBack}
              loading={loading}
              direction={direction}
            />
          )}
        </AnimatePresence>

        {imageLimitData && imageLimitData.count >= 8 && (
          <div className={`image-limit-indicator ${!imageLimitData.canGenerate ? 'image-limit-indicator--blocked' : ''}`}>
            <span className="image-limit-indicator__text">
              {imageLimitData.count}/10 Bilder heute
            </span>
            {!imageLimitData.canGenerate && (
              <span className="image-limit-indicator__blocked">
                Tageslimit erreicht
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StepFlow;

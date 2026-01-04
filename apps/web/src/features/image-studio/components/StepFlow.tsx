import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HiArrowLeft, HiCog, HiArrowRight, HiX, HiPhotograph, HiCheck } from 'react-icons/hi';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useImageSourceStore } from '../hooks/useImageSourceStore';
import { useShareStore, type Share } from '@gruenerator/shared/share';
import { useStepFlow } from '../hooks/useStepFlow';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import StockImagesGrid from '../steps/StockImagesGrid';
import { ProfilbildCanvas, ZitatPureCanvas, ZitatCanvas, InfoCanvas, VeranstaltungCanvas, DreizeilenCanvas } from '../canvas-editor';
import SegmentedControl from '../../../components/common/UI/SegmentedControl';
import UnsplashAttribution from '../../../components/common/UnsplashAttribution';
import Button from '../../../components/common/SubmitButton';
import apiClient from '../../../components/utils/apiClient';
import { IMAGE_STUDIO_TYPES } from '../utils/typeConfig';

import '../../../assets/styles/components/image-studio/typeform-fields.css';

// Type definitions for form fields
interface FieldOption {
  value: string;
  label: string;
}

interface FormField {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'select';
  placeholder?: string;
  helpText?: string;
  subtitle?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  rows?: number;
  options?: FieldOption[];
}

// Flow step types
interface BaseFlowStep {
  id: string;
  stepTitle: string;
  stepSubtitle?: string | null;
  afterComplete?: 'generateText' | 'generateImage' | 'parallelPreload' | 'backgroundRemoval' | null;
}

interface InputFlowStep extends BaseFlowStep {
  type: 'input';
  field: FormField;
}

interface ImageUploadFlowStep extends BaseFlowStep {
  type: 'image_upload';
}

interface SloganFlowStep extends BaseFlowStep {
  type: 'slogan';
}

interface CanvasEditFlowStep extends BaseFlowStep {
  type: 'canvas_edit';
}

type FlowStep = InputFlowStep | ImageUploadFlowStep | SloganFlowStep | CanvasEditFlowStep;

// Component props interfaces
interface StepFlowInputStepProps {
  field: FormField | undefined;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onNext: () => void;
  onBack: () => void;
  isLastInput: boolean;
  loading: boolean;
  error: string | null;
  direction: number;
}

interface BackgroundRemovalProgress {
  phase: 'downloading' | 'processing' | 'compressing';
  progress: number;
  message: string;
}

interface StepFlowImageUploadStepProps {
  onNext: () => void;
  onBack: () => void;
  direction: number;
  loading: boolean;
  bgRemovalProgress: BackgroundRemovalProgress | null;
}

interface StepFlowProps {
  onBack?: () => void;
  onComplete?: () => void;
  imageLimitData?: {
    count: number;
    canGenerate: boolean;
  } | null;
  startAtCanvasEdit?: boolean;
}

// Animation variant type
type AnimationDirection = number;

const slideVariants = {
  enter: (direction: AnimationDirection) => ({
    y: direction > 0 ? 40 : -40,
    opacity: 0
  }),
  center: {
    y: 0,
    opacity: 1
  },
  exit: (direction: AnimationDirection) => ({
    y: direction < 0 ? 40 : -40,
    opacity: 0
  })
};

const StepFlowInputStep: React.FC<StepFlowInputStepProps> = ({
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    // Focus the appropriate input based on field type
    if (field?.type === 'textarea' && textareaRef.current) {
      textareaRef.current.focus();
    } else if (field?.type === 'select' && selectRef.current) {
      selectRef.current.focus();
    } else if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [field?.name, field?.type]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
            ref={textareaRef}
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
            ref={selectRef}
            id={field?.name}
            name={field?.name}
            value={value}
            onChange={handleChange}
            disabled={loading}
            className={`typeform-select ${hasError ? 'error-input' : ''}`}
          >
            <option value="">{field?.placeholder || 'Bitte wählen...'}</option>
            {field?.options?.map((opt: FieldOption) => (
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
  { value: 'stock', label: 'Stock Bilder' },
  { value: 'mediathek', label: 'Meine Bilder' }
];

const StepFlowImageUploadStep: React.FC<StepFlowImageUploadStepProps> = ({ onNext, onBack, direction, loading, bgRemovalProgress }) => {
  const { uploadedImage, updateFormData } = useImageStudioStore();
  const {
    imageSourceTab,
    setImageSourceTab,
    selectedStockImage,
    stockImageAttribution,
    resetStockImageState
  } = useImageSourceStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    uploadedImage ? URL.createObjectURL(uploadedImage) : null
  );
  const isNewUploadRef = useRef<boolean>(false);

  useEffect(() => {
    if (uploadedImage) {
      const url = URL.createObjectURL(uploadedImage);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [uploadedImage]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileSelect = useCallback((file: File | undefined) => {
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) return;

    isNewUploadRef.current = true;
    updateFormData({ uploadedImage: file });
    setTimeout(() => onNext(), 50);
  }, [updateFormData, onNext]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const file = e.dataTransfer?.files?.[0];
    handleFileSelect(file);
  }, [handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleTabChange = useCallback((tab: 'upload' | 'stock' | 'unsplash' | 'mediathek') => {
    setImageSourceTab(tab);
  }, [setImageSourceTab]);

  // Mediathek state
  const { shares, isLoading: isLoadingShares, fetchUserShares } = useShareStore();
  const [selectedMediathekImage, setSelectedMediathekImage] = useState<Share | null>(null);
  const [isLoadingMediathekImage, setIsLoadingMediathekImage] = useState(false);

  // Filter for images with originals or AI-generated
  const mediathekImages = useMemo(() => {
    return shares.filter(share =>
      share.mediaType === 'image' && (
        share.imageMetadata?.hasOriginalImage === true ||
        share.imageType === 'pure-create'
      )
    );
  }, [shares]);

  // Fetch mediathek images when tab is selected
  useEffect(() => {
    if (imageSourceTab === 'mediathek' && shares.length === 0) {
      fetchUserShares('image');
    }
  }, [imageSourceTab, shares.length, fetchUserShares]);

  const handleMediathekImageSelect = useCallback(async (share: Share) => {
    setSelectedMediathekImage(share);
    setIsLoadingMediathekImage(true);

    try {
      const hasOriginal = share.imageMetadata?.hasOriginalImage === true;
      const imageUrl = hasOriginal
        ? `${apiClient.defaults.baseURL}/share/${share.shareToken}/original`
        : `${apiClient.defaults.baseURL}/share/${share.shareToken}`;

      const response = await fetch(imageUrl, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch image');
      }

      const blob = await response.blob();
      const file = new File([blob], `mediathek-${share.shareToken}.jpg`, { type: blob.type || 'image/jpeg' });

      updateFormData({ uploadedImage: file });
      setTimeout(() => onNext(), 50);
    } catch (error) {
      console.error('Failed to load mediathek image:', error);
    } finally {
      setIsLoadingMediathekImage(false);
      setSelectedMediathekImage(null);
    }
  }, [updateFormData, onNext]);

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
            onKeyDown={(e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && handleUploadClick()}
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

  const renderMediathekContent = () => (
    <div className="typeform-stock-content">
      {previewUrl ? (
        <div className="typeform-upload-preview">
          <img
            src={previewUrl}
            alt="Ausgewähltes Bild aus Mediathek"
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
        </div>
      ) : (
        <div className="stock-images-grid">
          {isLoadingShares && mediathekImages.length === 0 ? (
            <div className="stock-images-grid__loading">
              <div className="stock-images-grid__spinner" />
              <p>Mediathek wird geladen...</p>
            </div>
          ) : mediathekImages.length === 0 ? (
            <div className="stock-images-grid__empty">
              <p>Noch keine Bilder in der Mediathek.</p>
              <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                Erstelle Sharepics, um sie hier wiederzuverwenden.
              </p>
            </div>
          ) : (
            <div className="stock-images-grid__grid">
              <AnimatePresence mode="popLayout">
                {mediathekImages.map((share, index) => {
                  const isSelected = selectedMediathekImage?.shareToken === share.shareToken;
                  const thumbnailUrl = share.thumbnailUrl || `${apiClient.defaults.baseURL}/share/${share.shareToken}/thumbnail`;
                  const isOriginal = share.imageMetadata?.hasOriginalImage === true;

                  return (
                    <motion.div
                      key={share.shareToken}
                      className={`stock-images-grid__card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleMediathekImageSelect(share)}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2, delay: index * 0.02 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      style={{ cursor: isLoadingMediathekImage ? 'wait' : 'pointer' }}
                    >
                      <img
                        src={thumbnailUrl}
                        alt={share.title || 'Mediathek Bild'}
                        loading="lazy"
                        className="stock-images-grid__image"
                      />

                      {isSelected && isLoadingMediathekImage && (
                        <div className="stock-images-grid__selected-overlay">
                          <div className="stock-images-grid__spinner" style={{ width: 16, height: 16 }} />
                        </div>
                      )}

                      {!isSelected && (
                        <div
                          className="stock-images-grid__recommended-badge"
                          title={isOriginal ? 'Original Bild' : 'KI-generiert'}
                          style={{ background: isOriginal ? 'var(--primary-500)' : 'var(--sonne)' }}
                        >
                          {isOriginal ? <HiPhotograph style={{ fontSize: 12 }} /> : '✨'}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderTabContent = () => {
    switch (imageSourceTab) {
      case 'upload':
        return renderUploadContent();
      case 'stock':
        return renderStockContent();
      case 'mediathek':
        return renderMediathekContent();
      default:
        return renderUploadContent();
    }
  };

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

      {renderTabContent()}

      {bgRemovalProgress && (
        <div className="typeform-progress-overlay">
          <div className="typeform-progress-content">
            <div className="typeform-progress-spinner" />
            <p className="typeform-progress-message">{bgRemovalProgress.message}</p>
            <div className="typeform-progress-bar">
              <div
                className="typeform-progress-bar__fill"
                style={{ width: `${Math.round(bgRemovalProgress.progress * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="template-input-step__actions">
        <Button
          onClick={onBack}
          text="Zurück"
          icon={<HiArrowLeft />}
          className="btn-secondary"
          ariaLabel="Zurück"
          disabled={loading}
        />
        {previewUrl && (
          <Button
            onClick={onNext}
            text={loading ? "Wird verarbeitet..." : "Weiter"}
            icon={loading ? undefined : <HiArrowRight />}
            className="btn-primary"
            ariaLabel="Weiter"
            loading={loading}
            disabled={loading}
          />
        )}
      </div>
    </motion.div>
  );
};

const StepFlow: React.FC<StepFlowProps> = ({ onBack: parentOnBack, onComplete, imageLimitData, startAtCanvasEdit }) => {
  const { handleChange, updateFormData, name, sloganAlternatives, uploadedImage } = useImageStudioStore();
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
    getFieldValue,
    transparentImage,
    typeConfig,
    handleCanvasExport,
    bgRemovalProgress
  } = useStepFlow({ startAtCanvasEdit });

  const userDisplayName = useMemo(() => {
    const displayName = user?.display_name || user?.name || '';
    return displayName.trim();
  }, [user]);

  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (uploadedImage) {
      const url = URL.createObjectURL(uploadedImage);
      setUploadedImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setUploadedImageUrl(null);
  }, [uploadedImage]);

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
              loading={loading}
              bgRemovalProgress={bgRemovalProgress}
            />
          )}

          {currentStep.type === 'input' && (
            <StepFlowInputStep
              key={currentStep.id}
              field={(currentStep as any).field}
              value={getFieldValue((currentStep as any).field?.name)}
              onChange={handleChange}
              onNext={handleNext}
              onBack={handleBack}
              isLastInput={isLastInputStep}
              loading={loading}
              error={error}
              direction={direction}
            />
          )}

          {currentStep.type === 'canvas_edit' && transparentImage && !typeConfig?.hasTextCanvasEdit && (
            <motion.div
              key={currentStep.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="typeform-field typeform-field--canvas-edit"
            >
              <ProfilbildCanvas
                transparentImage={transparentImage}
                onExport={handleCanvasExport}
                onCancel={handleBack}
              />
            </motion.div>
          )}

          {currentStep.type === 'canvas_edit' && typeConfig?.id === IMAGE_STUDIO_TYPES.ZITAT_PURE && (
            <motion.div
              key={currentStep.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="typeform-field typeform-field--canvas-edit"
            >
              <ZitatPureCanvas
                quote={getFieldValue('quote')}
                name={getFieldValue('name')}
                alternatives={sloganAlternatives.map((alt: { quote?: string }) => alt.quote || '')}
                onExport={handleCanvasExport}
                onCancel={handleBack}
              />
            </motion.div>
          )}

          {currentStep.type === 'canvas_edit' && typeConfig?.id === IMAGE_STUDIO_TYPES.ZITAT && uploadedImageUrl && (
            <motion.div
              key={currentStep.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="typeform-field typeform-field--canvas-edit"
            >
              <ZitatCanvas
                quote={getFieldValue('quote')}
                name={getFieldValue('name')}
                imageSrc={uploadedImageUrl}
                alternatives={sloganAlternatives.map((alt: { quote?: string }) => alt.quote || '')}
                onExport={handleCanvasExport}
                onCancel={handleBack}
              />
            </motion.div>
          )}

          {currentStep.type === 'canvas_edit' && typeConfig?.id === IMAGE_STUDIO_TYPES.INFO && (
            <motion.div
              key={currentStep.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="typeform-field typeform-field--canvas-edit"
            >
              <InfoCanvas
                header={getFieldValue('header')}
                subheader={getFieldValue('subheader')}
                body={getFieldValue('body')}
                alternatives={sloganAlternatives}
                onExport={handleCanvasExport}
                onCancel={handleBack}
              />
            </motion.div>
          )}

          {currentStep.type === 'canvas_edit' && typeConfig?.id === IMAGE_STUDIO_TYPES.VERANSTALTUNG && uploadedImageUrl && (
            <motion.div
              key={currentStep.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="typeform-field typeform-field--canvas-edit"
            >
              <VeranstaltungCanvas
                eventTitle={getFieldValue('eventTitle')}
                beschreibung={getFieldValue('beschreibung')}
                weekday={getFieldValue('weekday')}
                date={getFieldValue('date')}
                time={getFieldValue('time')}
                locationName={getFieldValue('locationName')}
                address={getFieldValue('address')}
                imageSrc={uploadedImageUrl}
                alternatives={sloganAlternatives}
                onExport={handleCanvasExport}
                onCancel={handleBack}
              />
            </motion.div>
          )}

          {currentStep.type === 'canvas_edit' && typeConfig?.id === IMAGE_STUDIO_TYPES.DREIZEILEN && (
            <motion.div
              key={currentStep.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="typeform-field typeform-field--canvas-edit"
            >
              <DreizeilenCanvas
                line1={getFieldValue('line1')}
                line2={getFieldValue('line2')}
                line3={getFieldValue('line3')}
                imageSrc={uploadedImageUrl}
                alternatives={sloganAlternatives}
                onExport={handleCanvasExport}
                onCancel={handleBack}
              />
            </motion.div>
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

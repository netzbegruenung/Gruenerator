import React, { useEffect, useMemo, useCallback, useState, ReactNode } from 'react';
import { HiCog, HiChevronDown, HiChevronUp } from "react-icons/hi";
import { FaSave } from 'react-icons/fa';
import Button from '../../../../components/common/SubmitButton';
import DownloadButton from './DownloadButton';
import FileUpload from '../../../../components/utils/FileUpload';
import UnsplashButton from './UnsplashButton';
import { useSharepicStore } from '../../../../stores';
import AdvancedEditingSection from '../../dreizeilen/components/AdvancedEditingSection';
import HelpDisplay from '../../../../components/common/HelpDisplay';
import FormErrors from '../../../../components/common/FormErrors';
import SharepicBackendResult from './SharepicBackendResult';
import CopyButton from '../../../../components/common/CopyButton';
import HelpTooltip from '../../../../components/common/HelpTooltip';
import useAltTextGeneration from '../../../../components/hooks/useAltTextGeneration';
import { ShareMediaModal } from '../../../../components/common/ShareMediaModal';
import { useShareStore } from '@gruenerator/shared';

// Sharepic Feature CSS - Loaded only when this feature is accessed
import '../../../../assets/styles/components/sharepic/sharepic.css';
import '../../../../assets/styles/components/sharepic/sharepic-type-selector.css';

import {
  ColorSchemeControl,
  FontSizeControl,
  CreditControl,
} from '../../../../components/utils/ImageModificationForm';
import {
  BUTTON_LABELS,
  ARIA_LABELS,
  FORM_STEPS,
} from '../../../../components/utils/constants';

// Types
interface ColorScheme {
  background: string;
  text: string;
}

interface UnsplashImage {
  urls: {
    regular: string;
    small?: string;
    thumb?: string;
    full?: string;
  };
  alt_description?: string;
  user?: {
    name?: string;
  };
}

interface HelpContentType {
  title?: string;
  content?: string;
  tips?: string[];
}

interface Slogan {
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  line5?: string;
  quote?: string;
  header?: string;
  subheader?: string;
  body?: string;
}

interface BaseFormFileUploadProps {
  loading?: boolean;
  file?: File | null;
  handleChange?: (file: File) => void;
  error?: string;
  allowedTypes?: string[];
  buttonText?: string;
  unsplashButtonText?: string;
  showAlternativesButton?: boolean;
  alternativesButtonProps?: {
    isExpanded?: boolean;
    onClick?: () => void;
    onSloganSelect?: (selected: Slogan) => void;
  };
}

interface BaseFormProps {
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  onBack?: () => void;
  loading: boolean;
  success?: boolean;
  error?: string | { message?: string; title?: string } | null;
  formErrors?: Record<string, string>;
  generatedContent?: ReactNode | string;
  fileUploadProps?: BaseFormFileUploadProps;
  useDownloadButton?: boolean;
  showBackButton?: boolean;
  submitButtonText?: string;
  fontSize?: number;
  balkenOffset?: number[];
  colorScheme?: ColorScheme[];
  onControlChange?: (name: string, value: unknown) => void;
  isSubmitting?: boolean;
  currentSubmittingStep?: string;
  balkenGruppenOffset?: [number, number];
  sunflowerOffset?: [number, number];
  credit?: string;
  helpContent?: HelpContentType;
  hidePostTextButton?: boolean;
  galleryEditMode?: boolean;
  editShareToken?: string | null;
}

// Utility function to safely extract text from error objects
const getErrorText = (error: string | { message?: string; title?: string } | null): string => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    return error.message || error.title || 'Ein Fehler ist aufgetreten';
  }
  return String(error);
};

const BaseForm: React.FC<BaseFormProps> = ({
  title,
  children,
  onSubmit,
  onBack,
  loading,
  success,
  error,
  formErrors = {},
  generatedContent,
  fileUploadProps,
  useDownloadButton = false,
  showBackButton = false,
  submitButtonText = BUTTON_LABELS.SUBMIT,
  fontSize,
  balkenOffset,
  colorScheme,
  onControlChange,
  isSubmitting,
  currentSubmittingStep,
  balkenGruppenOffset,
  sunflowerOffset,
  credit,
  helpContent,
  hidePostTextButton = false,
  galleryEditMode = false,
  editShareToken = null
}) => {
  const {
    // State
    currentStep, generatedImageSrc, isAdvancedEditingOpen,
    selectedImage: rawSelectedImage,
    type, thema, details, line1, line2, line3, line4, line5, quote, name,
    header, subheader, body,
    fontSize: storeFontSize,
    balkenOffset: storeBalkenOffset, colorScheme: storeColorScheme,
    balkenGruppenOffset: storeBalkenGruppenOffset, sunflowerOffset: storeSunflowerOffset,
    credit: storeCredit, searchTerms, sloganAlternatives, uploadedImage,
    file,
    // Actions
    toggleAdvancedEditing, handleChange, updateFormData
  } = useSharepicStore();

  // Cast selectedImage to UnsplashImage if it's an object (store types it as string | null but it's actually an object)
  const selectedImage = rawSelectedImage as unknown as UnsplashImage | null;

  // Create formData object for compatibility with existing code
  const formData = {
    type, thema, details, line1, line2, line3, line4, line5, quote, name,
    header, subheader, body,
    fontSize: storeFontSize, balkenOffset: storeBalkenOffset,
    colorScheme: storeColorScheme, balkenGruppenOffset: storeBalkenGruppenOffset,
    sunflowerOffset: storeSunflowerOffset, credit: storeCredit,
    searchTerms, sloganAlternatives, uploadedImage, file
  };

  // Alt text state management
  const [showAltTextSection, setShowAltTextSection] = useState(false);
  const [generatedAltText, setGeneratedAltText] = useState('');

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareImageData, setShareImageData] = useState(null);

  // Get updateImageShare for gallery edit mode
  const { updateImageShare, isCreating: isSaving } = useShareStore();

  // Alt text generation hook
  const {
    loading: altTextLoading,
    error: altTextError,
    generateAltTextForImage,
    resetState: resetAltTextState
  } = useAltTextGeneration();

  useEffect(() => {
    console.log('BaseForm: Current step changed to', currentStep);
  }, [currentStep]);

  useEffect(() => {
    console.log('BaseForm props update:', {
      currentStep,
      isSubmitting,
      currentSubmittingStep,
    });
  }, [currentStep, isSubmitting, currentSubmittingStep]);

  useEffect(() => {
    if (isAdvancedEditingOpen) {
      const advancedSection = document.querySelector('.advanced-editing-section');
      if (advancedSection) {
        advancedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [isAdvancedEditingOpen]);

  const handleAltTextClick = useCallback(async () => {
    if (!generatedImageSrc) {
      console.error('[BaseForm] No generated image available for alt text generation');
      return;
    }

    // Show the section and reset states
    setShowAltTextSection(true);
    setGeneratedAltText('');
    resetAltTextState();

    try {
      // Create image description from form data for better alt text context
      let imageDescription = '';
      if (formData.type === 'Zitat' && formData.quote) {
        imageDescription = `Zitat-Sharepic mit dem Text: "${formData.quote}"`;
        if (formData.name) {
          imageDescription += ` von ${formData.name}`;
        }
      } else if (formData.line1 || formData.line2 || formData.line3) {
        const lines = [formData.line1, formData.line2, formData.line3].filter(Boolean);
        imageDescription = `Sharepic mit dem Text: "${lines.join(' ')}"`;
      } else if (formData.thema) {
        imageDescription = `Sharepic zum Thema: ${formData.thema}`;
      }

      const response = await generateAltTextForImage(generatedImageSrc, imageDescription);
      if (response && response.altText) {
        setGeneratedAltText(response.altText);
      }
    } catch (error) {
      console.error('[BaseForm] Alt text generation failed:', error);
      // Error state is handled by the hook and displayed inline
    }
  }, [generatedImageSrc, formData, generateAltTextForImage, resetAltTextState]);

  // Helper to convert File to base64
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  // Helper to fetch image URL and convert to base64
  const urlToBase64 = useCallback(async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Failed to convert URL to base64:', error);
      return null;
    }
  }, []);

  // Get original image as base64 for sharing
  const getOriginalImageBase64 = useCallback(async (): Promise<string | null> => {
    if (formData.file) {
      return await fileToBase64(formData.file);
    }
    if (selectedImage?.urls?.regular) {
      return await urlToBase64(selectedImage.urls.regular);
    }
    return null;
  }, [formData.file, selectedImage, fileToBase64, urlToBase64]);

  // Build metadata for sharing/saving
  const buildShareMetadata = useCallback(() => {
    const metadata = {
      sharepicType: formData.type,
      content: {},
      styling: {
        fontSize: formData.fontSize,
        colorScheme: formData.colorScheme,
        balkenOffset: formData.balkenOffset,
        balkenGruppenOffset: formData.balkenGruppenOffset,
        sunflowerOffset: formData.sunflowerOffset,
        credit: formData.credit,
      },
      searchTerms: formData.searchTerms,
      sloganAlternatives: formData.sloganAlternatives,
    };

    // Add type-specific content
    if (formData.type === 'Zitat' || formData.type === 'Zitat_Pure') {
      metadata.content = {
        quote: formData.quote,
        name: formData.name,
      };
    } else if (formData.type === 'Info') {
      metadata.content = {
        header: formData.header,
        subheader: formData.subheader,
        body: formData.body,
      };
    } else {
      metadata.content = {
        line1: formData.line1,
        line2: formData.line2,
        line3: formData.line3,
        line4: formData.line4,
        line5: formData.line5,
      };
    }

    return metadata;
  }, [formData]);

  // Handle save button click
  const handleSaveClick = useCallback(async () => {
    const originalImage = await getOriginalImageBase64();
    const metadata = buildShareMetadata();

    // If in gallery edit mode, update the existing share directly
    if (galleryEditMode && editShareToken) {
      try {
        await updateImageShare({
          shareToken: editShareToken,
          imageBase64: generatedImageSrc || '',
          title: formData.thema || undefined,
          metadata,
          originalImage: originalImage || undefined,
        });
        alert('Sharepic erfolgreich aktualisiert!');
      } catch (error) {
        console.error('Failed to update sharepic:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
        alert('Fehler beim Aktualisieren: ' + errorMessage);
      }
    } else {
      // Normal flow: open modal to create new share
      setShareImageData({
        image: generatedImageSrc,
        type: formData.type,
        metadata,
        originalImage,
      });
      setShowShareModal(true);
    }
  }, [generatedImageSrc, formData.type, formData.thema, getOriginalImageBase64, buildShareMetadata, galleryEditMode, editShareToken, updateImageShare]);

  const formButtons = useMemo(() => ({
    showBack: showBackButton,
    submitText: submitButtonText,
    loading,
    success
  }), [showBackButton, submitButtonText, loading, success]);

  const renderFormButtons = () => (
    <div className="button-container">
      {formButtons.showBack && (
        <div className="button-wrapper">
          <Button
            onClick={onBack}
            text={BUTTON_LABELS.BACK}
            className="submit-button"
            ariaLabel={ARIA_LABELS.BACK}
          />
        </div>
      )}
      {currentStep !== FORM_STEPS.RESULT && (
        <div className="button-wrapper">
          <Button
            onClick={onSubmit}
            loading={formButtons.loading}
            success={formButtons.success}
            text={formButtons.submitText}
            icon={<HiCog />}
            className="form-button"
            ariaLabel={ARIA_LABELS.SUBMIT}
          />
        </div>
      )}
    </div>
  );

  const renderInputStep = () => (
    <div className="input-fields-wrapper">
      {children}
      {formData.type === 'Zitat' && (
        <div className="form-group">
          <h3>Zitiert wird</h3>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name || ''}
            onChange={handleChange}
            placeholder="Maxi Mustermensch"
            required
            className={`form-input ${formErrors.name ? 'error-input' : ''}`}
          />
          {formErrors.name && <span className="error-message">{formErrors.name}</span>}
        </div>
      )}
      {renderFormButtons()}
    </div>
  );

  const renderPreviewStep = () => (
    <>
      <div className="input-fields-wrapper">
        {children}
      </div>
      <div className="action-buttons">
        {formData.type === 'Dreizeilen' && (
          <>
            <div className="button-wrapper">
              <UnsplashButton
                searchTerms={formData.searchTerms}
              />
            </div>
            <div className="button-wrapper">
              <FileUpload {...fileUploadProps} buttonText="Upload" />
            </div>
          </>
        )}
        {formData.type === 'Zitat' && (
          <div className="button-wrapper">
            <FileUpload {...fileUploadProps} buttonText="Upload" />
          </div>
        )}
      </div>
      <div className="button-container">
        {renderFormButtons()}
      </div>
    </>
  );

  const handleSocialMediaClick = useCallback(() => {
    const url = new URL(window.location.origin + '/presse-social');
    url.searchParams.append('thema', formData.thema || '');
    url.searchParams.append('details', formData.details || '');
    window.open(url.toString(), '_blank');
  }, [formData]);

  const renderResultStep = () => {
    return (
      <SharepicBackendResult
        onSubmit={onSubmit}
        loading={loading}
        success={success}
        fontSize={fontSize}
        balkenOffset={balkenOffset}
        colorScheme={colorScheme}
        onControlChange={onControlChange}
        balkenGruppenOffset={balkenGruppenOffset}
        sunflowerOffset={sunflowerOffset}
        credit={credit}
        formData={formData}
        generatedImage={generatedImageSrc}
        onAltTextClick={handleAltTextClick}
        hidePostTextButton={hidePostTextButton}
      >
        {children}
      </SharepicBackendResult>
    );
  };

  const renderFormContent = () => {
    const helpDisplay = helpContent ? (
      <HelpDisplay
        content={helpContent.content}
        tips={helpContent.tips}
      />
    ) : null;

    return (
      <>
        {helpDisplay}
        {(() => {
          switch (currentStep) {
            case FORM_STEPS.INPUT:
              return renderInputStep();
            case FORM_STEPS.PREVIEW:
              return renderPreviewStep();
            case FORM_STEPS.RESULT:
              return renderResultStep();
            default:
              return null;
          }
        })()}
      </>
    );
  };

  const renderDisplayContent = useMemo(() => {
    if (!generatedImageSrc && generatedContent) {
      return <div className="display-content">{generatedContent}</div>;
    }

    return (
      <div className="display-content" style={{ fontSize: fontSize }}>
        {currentStep === FORM_STEPS.PREVIEW && (
          <>
            <div className="preview-image-container">
              {formData.file && (
                <img
                  src={URL.createObjectURL(formData.file)}
                  alt="Vorschau"
                  className="preview-image"
                />
              )}
              {selectedImage && (
                <img
                  src={selectedImage.urls.regular}
                  alt={selectedImage.alt_description || "Unsplash Vorschau"}
                  className="preview-image"
                />
              )}
            </div>
          </>
        )}
        {currentStep === FORM_STEPS.RESULT && typeof generatedImageSrc === 'string' && (generatedImageSrc.startsWith('data:image') || generatedImageSrc.startsWith('/api/')) && (
          <>
            <div className="sticky-sharepic-container">
              <img src={generatedImageSrc} alt="Generiertes Sharepic" className="sticky-sharepic" />
              <div className="button-container" style={{ fontSize: 'initial' }}>
                {useDownloadButton && <DownloadButton imageUrl={generatedImageSrc} />}
                <button
                  type="button"
                  className="sharepic-save-button"
                  onClick={handleSaveClick}
                  aria-label="Sharepic speichern"
                >
                  <FaSave style={{ marginRight: '10px' }} /> Speichern
                </button>
              </div>
            </div>

            {/* Alt Text Inline Section */}
            {showAltTextSection && (
              <div className="alt-text-inline-section" style={{ fontSize: 'initial' }}>
                <div className="alt-text-header">
                  <h3>Alt-Text für Barrierefreiheit</h3>
                  <HelpTooltip>
                    <p>
                      Alt-Text beschreibt Bilder für Menschen mit Sehbehinderung.
                      Er wird von Screenreadern vorgelesen und macht Inhalte barrierefrei.
                    </p>
                    <p>
                      <a href="https://www.dbsv.org/bildbeschreibung-4-regeln.html"
                         target="_blank"
                         rel="noopener noreferrer">
                        DBSV-Richtlinien für Bildbeschreibungen →
                      </a>
                    </p>
                  </HelpTooltip>
                  {generatedAltText && !altTextLoading && (
                    <CopyButton
                      directContent={generatedAltText}
                      variant="icon"
                      className="alt-text-copy-button"
                    />
                  )}
                </div>

                {altTextLoading && (
                  <div className="alt-text-loading">
                    <span className="loading-spinner">⏳</span>
                    <span>Alt-Text wird generiert...</span>
                  </div>
                )}

                {altTextError && (
                  <div className="alt-text-error">
                    <span>⚠️</span>
                    <span>Fehler bei der Alt-Text-Generierung: {altTextError}</span>
                  </div>
                )}

                {generatedAltText && !altTextLoading && (
                  <div className="alt-text-content">
                    {generatedAltText}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }, [
    currentStep,
    generatedImageSrc,
    generatedContent,
    useDownloadButton,
    fontSize,
    formData,
    selectedImage,
    showAltTextSection,
    altTextLoading,
    altTextError,
    generatedAltText,
    handleSaveClick
  ]);

  return (
    <>
      <div className={`sharepic-base-container ${generatedContent ? 'with-content' : ''} ${currentStep === FORM_STEPS.RESULT ? 'result-step' : ''}`}>
        <div className={`form-container form-card form-card--elevated form-card--large`}>
          <form onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            onSubmit();
          }}>
            <div className={`form-content ${generatedContent ? 'with-generated-content' : ''}`}>
              {renderFormContent()}
            </div>
          </form>
        </div>
        <div className="display-container">
          <h3>{helpContent?.title || title}</h3>
          {error && (
            <p role="alert" aria-live="assertive" className="error-message">{getErrorText(error)}</p>
          )}
          {Object.keys(formErrors).length > 0 && <FormErrors errors={formErrors} />}
          {renderDisplayContent}
        </div>
      </div>

      <ShareMediaModal
        isOpen={showShareModal}
        onClose={() => {
          setShowShareModal(false);
          setShareImageData(null);
        }}
        mediaType="image"
        imageData={shareImageData}
        defaultTitle={formData.thema || ''}
      />
    </>
  );
};

export default BaseForm;

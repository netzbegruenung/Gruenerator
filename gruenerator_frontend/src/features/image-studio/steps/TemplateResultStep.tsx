import React, { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense, ChangeEvent, RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { FaDownload, FaEdit, FaRedo, FaArrowLeft, FaTimes, FaChevronDown, FaExchangeAlt, FaInstagram, FaShareAlt, FaSave, FaImages, FaImage } from 'react-icons/fa';
import { IoCopyOutline, IoCheckmarkOutline } from 'react-icons/io5';
import { HiSparkles, HiArrowLeft, HiRefresh, HiShare } from 'react-icons/hi';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useShareStore } from '@gruenerator/shared';
import ConfigDrivenFields from '../components/ConfigDrivenFields';
import {
  ColorSchemeControl,
  FontSizeControl,
  GroupedFontSizeControl,
  InputWithFontSize,
  CreditControl,
  BalkenOffsetControl,
  BalkenGruppeControl,
  SonnenblumenControl
} from '../../../components/utils/ImageModificationForm';
import { getTypeConfig, getTemplateFieldConfig } from '../utils/typeConfig';
import useAltTextGeneration from '../../../components/hooks/useAltTextGeneration';
import { useGenerateSocialPost } from '../../../components/hooks/useGenerateSocialPost';
import Spinner from '../../../components/common/Spinner';
import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import ImageDisplay from '../../../components/common/ImageDisplay';
import Button from '../../../components/common/SubmitButton';

const ReactMarkdown = lazy(() => import('react-markdown'));

import '../../../assets/styles/components/ui/button.css';
import '../../../assets/styles/components/actions/advanced-editing.css';
import './TemplateResultStep.css';

// Types
interface FieldConfigField {
  name: string;
  label: string;
  placeholder?: string;
}

interface FieldConfig {
  showImageUpload?: boolean;
  showGroupedFontSizeControl?: boolean;
  previewFields?: FieldConfigField[];
  showPreviewLabels?: boolean;
  showCredit?: boolean;
  showFontSizeControl?: boolean;
  showColorControls?: boolean;
  showAdvancedEditing?: boolean;
  showAutoSave?: boolean;
  showSocialGeneration?: boolean;
  minimalLayout?: boolean;
}

interface SloganAlternative {
  _index: number;
  quote?: string;
  eventTitle?: string;
  weekday?: string;
  date?: string;
  time?: string;
  header?: string;
  subheader?: string;
  body?: string;
  line1?: string;
  line2?: string;
  line3?: string;
  [key: string]: any;
}

interface PreviewValues {
  line1?: string;
  line2?: string;
  line3?: string;
  quote?: string;
  header?: string;
  subheader?: string;
  body?: string;
  eventTitle?: string;
  line3Main?: string;
  line3Suffix?: string;
  weekday?: string;
  date?: string;
  time?: string;
  locationName?: string;
  address?: string;
  [key: string]: any;
}

interface TemplateResultEditPanelProps {
  isOpen: boolean;
  onClose: () => void;
  fieldConfig: FieldConfig | null;
  currentImagePreview: string | null;
  fileInputRef: RefObject<HTMLInputElement>;
  handleImageChange: (e: ChangeEvent<HTMLInputElement>) => void;
  previewValues: PreviewValues;
  handleChange: (e: { target: { name: string; value: string } }) => void;
  displayAlternatives: SloganAlternative[];
  isAlternativesOpen: boolean;
  setIsAlternativesOpen: (open: boolean) => void;
  handleSloganSwitch: (alt: SloganAlternative, index: number) => void;
  getAlternativePreview: (alt: SloganAlternative) => string;
  credit?: string;
  fontSize?: number;
  colorScheme?: any;
  balkenOffset?: number[];
  balkenGruppenOffset?: number[];
  sunflowerOffset?: number[];
  veranstaltungFieldFontSizes?: Record<string, number>;
  handleControlChange: (name: string, value: any) => void;
  handleFieldFontSizeChange: (fieldName: string, value: number) => void;
  isAdvancedEditingOpen?: boolean;
  toggleAdvancedEditing?: () => void;
  type?: string;
  loading?: boolean;
  onRegenerate: () => void;
}

interface TemplateResultLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  altText?: string;
}

interface TemplateResultStepProps {
  onRegenerate: () => void;
  loading?: boolean;
}

// Sub-component: Edit Panel
const TemplateResultEditPanel: React.FC<TemplateResultEditPanelProps> = ({
  isOpen,
  onClose,
  fieldConfig,
  currentImagePreview,
  fileInputRef,
  handleImageChange,
  previewValues,
  handleChange,
  displayAlternatives,
  isAlternativesOpen,
  setIsAlternativesOpen,
  handleSloganSwitch,
  getAlternativePreview,
  credit,
  fontSize,
  colorScheme,
  balkenOffset,
  balkenGruppenOffset,
  sunflowerOffset,
  veranstaltungFieldFontSizes,
  handleControlChange,
  handleFieldFontSizeChange,
  isAdvancedEditingOpen,
  toggleAdvancedEditing,
  type,
  loading,
  onRegenerate
}) => {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="edit-panel-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleOverlayClick}
      />
      <motion.div
        className="edit-panel"
        initial={isDesktop ? { x: '100%' } : { y: '100%' }}
        animate={isDesktop ? { x: 0 } : { y: 0 }}
        exit={isDesktop ? { x: '100%' } : { y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <div className="edit-panel__header">
          <h3 className="edit-panel__title">Bild bearbeiten</h3>
          <button
            className="edit-panel__close"
            onClick={onClose}
            aria-label="Panel schließen"
          >
            <FaTimes />
          </button>
        </div>

        <div className="edit-panel__content">
          {fieldConfig?.showImageUpload && (
            <div className="edit-panel__section">
              <h4>Hintergrundbild</h4>
              <div className="image-change-control">
                <div className="image-change-preview">
                  {currentImagePreview ? (
                    <img src={currentImagePreview} alt="Aktuelles Bild" />
                  ) : (
                    <div className="image-change-placeholder">
                      <FaImage />
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />
                <button
                  className="btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  type="button"
                >
                  <FaImage />
                  Bild ändern
                </button>
              </div>
            </div>
          )}

          <div className="edit-panel__section">
            <h4>Text</h4>
            {fieldConfig?.showGroupedFontSizeControl ? (
              <div className="veranstaltung-fields-with-fontsize">
                {(fieldConfig?.previewFields || []).map(field => {
                  const baseFontSizes = {
                    eventTitle: 94,
                    beschreibung: 62,
                    weekday: 57, date: 55, time: 55,
                    locationName: 42, address: 42
                  };
                  const base = baseFontSizes[field.name] || 60;
                  return (
                    <InputWithFontSize
                      key={field.name}
                      label={field.label}
                      name={field.name}
                      value={previewValues[field.name] || ''}
                      onChange={handleChange}
                      fontSizePx={veranstaltungFieldFontSizes?.[field.name] || base}
                      baseFontSize={base}
                      onFontSizeChange={handleFieldFontSizeChange}
                      placeholder={field.placeholder || ''}
                      disabled={loading}
                    />
                  );
                })}
              </div>
            ) : (
              <ConfigDrivenFields
                fields={fieldConfig?.previewFields || []}
                values={previewValues}
                onChange={handleChange}
                disabled={loading}
                hideLabels={!fieldConfig?.showPreviewLabels}
              />
            )}
          </div>

          {displayAlternatives.length > 0 && (
            <div className="edit-panel__section">
              <button
                className={`edit-panel__section-toggle ${isAlternativesOpen ? 'edit-panel__section-toggle--open' : ''}`}
                onClick={() => setIsAlternativesOpen(!isAlternativesOpen)}
                type="button"
              >
                <FaExchangeAlt />
                Text-Alternativen ({displayAlternatives.length})
                <FaChevronDown />
              </button>

              <AnimatePresence>
                {isAlternativesOpen && (
                  <motion.div
                    className="edit-panel__alternatives"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="alternatives-pills">
                      {displayAlternatives.map((alt) => (
                        <button
                          key={alt._index}
                          className="alternative-pill"
                          onClick={() => handleSloganSwitch(alt, alt._index)}
                          disabled={loading}
                          type="button"
                        >
                          {getAlternativePreview(alt)}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {(fieldConfig?.showCredit || (fieldConfig?.showFontSizeControl && !fieldConfig?.showGroupedFontSizeControl)) && (
            <div className="edit-panel__row">
              {fieldConfig?.showCredit && (
                <div className="edit-panel__section edit-panel__section--flex">
                  <h4>Credit</h4>
                  <CreditControl credit={credit} onControlChange={handleControlChange} />
                </div>
              )}
              {fieldConfig?.showFontSizeControl && !fieldConfig?.showGroupedFontSizeControl && (
                <div className="edit-panel__section edit-panel__section--auto">
                  <h4>Schriftgröße</h4>
                  <FontSizeControl
                    fontSize={fontSize}
                    onControlChange={handleControlChange}
                    isQuoteType={type === 'zitat' || type === 'zitat-pure'}
                  />
                </div>
              )}
            </div>
          )}

          {fieldConfig?.showColorControls && (
            <div className="edit-panel__section">
              <h4>Farbschema</h4>
              <ColorSchemeControl colorScheme={colorScheme} onControlChange={handleControlChange} />
            </div>
          )}

          {fieldConfig?.showAdvancedEditing && (
            <>
              <button
                className={`edit-panel__advanced-toggle ${isAdvancedEditingOpen ? 'edit-panel__advanced-toggle--open' : ''}`}
                onClick={toggleAdvancedEditing}
              >
                <HiSparkles />
                Erweiterte Einstellungen
                <FaChevronDown />
              </button>

              {isAdvancedEditingOpen && (
                <div className="advanced-controls-row">
                  <div className="advanced-control-item">
                    <h5>Balken</h5>
                    <BalkenOffsetControl
                      balkenOffset={balkenOffset || [50, -100, 50]}
                      onControlChange={handleControlChange}
                    />
                  </div>
                  <div className="advanced-control-item">
                    <h5>Gruppe</h5>
                    <BalkenGruppeControl
                      offset={balkenGruppenOffset || [0, 0]}
                      onOffsetChange={(value) => handleControlChange('balkenGruppenOffset', value)}
                    />
                  </div>
                  <div className="advanced-control-item">
                    <h5>Sonnenblume</h5>
                    <SonnenblumenControl
                      offset={sunflowerOffset || [0, 0]}
                      onOffsetChange={(value) => handleControlChange('sunflowerOffset', value)}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="edit-panel__actions">
          <button
            className="btn-primary"
            onClick={() => {
              onRegenerate();
              onClose();
            }}
            disabled={loading}
          >
            {loading ? <div className="button-spinner" /> : <FaRedo />}
            Aktualisieren
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// Sub-component: Lightbox
const TemplateResultLightbox: React.FC<TemplateResultLightboxProps> = ({ isOpen, onClose, imageSrc, altText }) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="image-lightbox-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <div className="image-lightbox-content">
          <button
            className="image-lightbox-close"
            onClick={onClose}
            aria-label="Lightbox schließen"
          >
            ×
          </button>
          <img
            src={imageSrc}
            alt={altText || 'Vergrößertes Bild'}
            className="image-lightbox-image"
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

const TemplateResultStep: React.FC<TemplateResultStepProps> = ({ onRegenerate, loading = false }) => {
  const navigate = useNavigate();

  const {
    type,
    generatedImageSrc,
    line1, line2, line3,
    quote, name,
    header, subheader, body,
    eventTitle, beschreibung, weekday, date, time, locationName, address,
    fontSize,
    colorScheme,
    balkenOffset,
    balkenGruppenOffset,
    sunflowerOffset,
    credit,
    veranstaltungFieldFontSizes,
    updateFieldFontSize,
    handleChange,
    updateFormData,
    goBack,
    sloganAlternatives,
    handleSloganSelect,
    cacheSloganImage,
    getCachedSloganImage,
    currentAlternativeIndex,
    setCurrentAlternativeIndex,
    isAdvancedEditingOpen,
    toggleAdvancedEditing,
    galleryEditMode,
    editShareToken,
    editTitle,
    uploadedImage,
    selectedImage,
    searchTerms,
    autoSaveStatus,
    autoSavedShareToken,
    lastAutoSavedImageSrc,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc
  } = useImageStudioStore();

  const { createImageShare, updateImageShare, isCreating: isUpdating } = useShareStore();

  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isNewImage, setIsNewImage] = useState(true);
  const [altText, setAltText] = useState('');
  const [isAltTextLoading, setIsAltTextLoading] = useState(false);
  const [isAlternativesOpen, setIsAlternativesOpen] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  const { generateAltTextForImage } = useAltTextGeneration();
  const { generatedPosts, generatePost, loading: socialLoading } = useGenerateSocialPost();

  const typeConfig = useMemo(() => getTypeConfig(type), [type]);
  const fieldConfig = useMemo(() => getTemplateFieldConfig(type), [type]);

  // Helper to convert blob/file to base64
  const blobToBase64 = useCallback((blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, []);

  // Get original image as base64 for saving
  const getOriginalImageBase64 = useCallback(async () => {
    if (uploadedImage) {
      return await blobToBase64(uploadedImage);
    }
    if (selectedImage?.urls?.regular) {
      try {
        const response = await fetch(selectedImage.urls.regular);
        const blob = await response.blob();
        return await blobToBase64(blob);
      } catch (error) {
        console.error('Failed to fetch original image:', error);
      }
    }
    return null;
  }, [uploadedImage, selectedImage, blobToBase64]);

  // Build metadata for sharing/saving
  const buildShareMetadata = useCallback(() => {
    const legacyType = typeConfig?.legacyType || type;
    const hasOriginal = !!(uploadedImage || selectedImage);

    const metadata = {
      sharepicType: legacyType,
      hasOriginalImage: hasOriginal,
      content: {},
      styling: {
        fontSize,
        colorScheme,
        balkenOffset,
        balkenGruppenOffset,
        sunflowerOffset,
        credit,
      },
      searchTerms,
      sloganAlternatives,
    };

    // Add type-specific content
    if (legacyType === 'Zitat' || legacyType === 'Zitat_Pure') {
      metadata.content = { quote, name };
    } else if (legacyType === 'Info') {
      metadata.content = { header, subheader, body };
    } else if (legacyType === 'Veranstaltung') {
      metadata.content = { eventTitle, line1, line2, line3Main, line3Suffix, weekday, date, time, locationName, address };
    } else {
      metadata.content = { line1, line2, line3 };
    }

    return metadata;
  }, [typeConfig, type, fontSize, colorScheme, balkenOffset, balkenGruppenOffset,
      sunflowerOffset, credit, searchTerms, sloganAlternatives, quote, name,
      header, subheader, body, line1, line2, line3, uploadedImage, selectedImage,
      eventTitle, line3Main, line3Suffix, weekday, date, time, locationName, address]);

  // Handle gallery update
  const handleGalleryUpdate = useCallback(async () => {
    if (!galleryEditMode || !editShareToken || !generatedImageSrc) return;

    try {
      const originalImage = await getOriginalImageBase64();
      const metadata = buildShareMetadata();

      await updateImageShare({
        shareToken: editShareToken,
        imageData: generatedImageSrc,
        title: editTitle,
        metadata,
        originalImage,
      });

      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to update sharepic:', error);
      alert('Fehler beim Aktualisieren: ' + error.message);
    }
  }, [galleryEditMode, editShareToken, editTitle, generatedImageSrc,
      getOriginalImageBase64, buildShareMetadata, updateImageShare]);

  const previewValues = useMemo(() => ({
    line1, line2, line3,
    quote,
    header, subheader, body,
    eventTitle, line3Main, line3Suffix, weekday, date, time, locationName, address
  }), [line1, line2, line3, quote, header, subheader, body, eventTitle, line3Main, line3Suffix, weekday, date, time, locationName, address]);

  useEffect(() => {
    setIsNewImage(true);
    const timer = setTimeout(() => setIsNewImage(false), 1000);
    return () => clearTimeout(timer);
  }, [generatedImageSrc]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isLightboxOpen) setIsLightboxOpen(false);
        else if (isEditPanelOpen) setIsEditPanelOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, isEditPanelOpen]);

  useEffect(() => {
    if (isEditPanelOpen || isLightboxOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isEditPanelOpen, isLightboxOpen]);

  useEffect(() => {
    if (generatedImageSrc) {
      cacheSloganImage(currentAlternativeIndex, generatedImageSrc);
    }
  }, [generatedImageSrc, currentAlternativeIndex, cacheSloganImage]);

  // Auto-save effect: Save new images to gallery automatically
  useEffect(() => {
    const performAutoSave = async () => {
      // Skip auto-save conditions
      if (!generatedImageSrc) return;
      if (fieldConfig?.showAutoSave === false) return;
      if (galleryEditMode) return;
      if (autoSaveStatus === 'saving') return;
      if (lastAutoSavedImageSrc === generatedImageSrc) return;

      setAutoSaveStatus('saving');

      try {
        const originalImage = await getOriginalImageBase64();
        const metadata = buildShareMetadata();
        const title = typeConfig?.label || 'Sharepic';

        const share = await createImageShare({
          imageData: generatedImageSrc,
          title,
          imageType: typeConfig?.legacyType || type,
          metadata,
          originalImage,
        });

        if (share?.shareToken) {
          setAutoSavedShareToken(share.shareToken);
          setLastAutoSavedImageSrc(generatedImageSrc);
          setAutoSaveStatus('saved');
        }
      } catch (error) {
        console.error('[TemplateResultStep] Auto-save failed:', error);
        setAutoSaveStatus('error');
      }
    };

    const timer = setTimeout(performAutoSave, 500);
    return () => clearTimeout(timer);
  }, [generatedImageSrc, galleryEditMode, autoSaveStatus, lastAutoSavedImageSrc,
      getOriginalImageBase64, buildShareMetadata, createImageShare, typeConfig, type,
      setAutoSaveStatus, setAutoSavedShareToken, setLastAutoSavedImageSrc, fieldConfig]);

  useEffect(() => {
    const checkShareCapability = async () => {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || (navigator.maxTouchPoints > 0 && window.innerWidth <= 768);

      if (!isMobile || !navigator.share || !navigator.canShare) {
        setCanNativeShare(false);
        return;
      }
      try {
        const testFile = new File(['test'], 'test.png', { type: 'image/png' });
        setCanNativeShare(navigator.canShare({ files: [testFile] }));
      } catch {
        setCanNativeShare(false);
      }
    };
    checkShareCapability();
  }, []);

  const stableAlternativesRef = useRef(null);
  const fileInputRef = useRef(null);

  if (stableAlternativesRef.current === null && sloganAlternatives?.length > 0) {
    stableAlternativesRef.current = sloganAlternatives.map((alt, idx) => ({
      ...alt,
      _index: idx
    }));
  }

  const displayAlternatives = stableAlternativesRef.current || [];

  const currentImagePreview = useMemo(() => {
    if (uploadedImage) {
      return URL.createObjectURL(uploadedImage);
    }
    if (selectedImage?.urls?.small) {
      return selectedImage.urls.small;
    }
    return null;
  }, [uploadedImage, selectedImage]);

  const handleSloganSwitch = useCallback((selected, alternativeIndex) => {
    cacheSloganImage(currentAlternativeIndex, generatedImageSrc);

    const cachedImage = getCachedSloganImage(alternativeIndex);

    handleSloganSelect(selected);
    setCurrentAlternativeIndex(alternativeIndex);

    if (cachedImage) {
      updateFormData({ generatedImageSrc: cachedImage });
    } else {
      onRegenerate();
    }

    setIsAlternativesOpen(false);
  }, [cacheSloganImage, getCachedSloganImage, handleSloganSelect, setCurrentAlternativeIndex,
      currentAlternativeIndex, generatedImageSrc, updateFormData, onRegenerate]);

  const getAlternativePreview = useCallback((alt) => {
    if (alt.quote) {
      return alt.quote;
    }
    if (alt.eventTitle) {
      return `${alt.eventTitle} · ${alt.weekday || ''} ${alt.date || ''} ${alt.time || ''}`.trim();
    }
    if (alt.header) {
      return [alt.header, alt.subheader, alt.body].filter(Boolean).join(' · ');
    }
    const lines = [alt.line1, alt.line2, alt.line3].filter(Boolean);
    if (lines.length > 0) {
      return lines.join(' · ');
    }
    return 'Alternative';
  }, []);

  const handleControlChange = useCallback((name, value) => {
    updateFormData({ [name]: value });
  }, [updateFormData]);

  const handleFieldFontSizeChange = useCallback((fieldName, value) => {
    updateFieldFontSize(fieldName, value);
  }, [updateFieldFontSize]);

  const handleImageChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Bitte nur JPEG, PNG oder WebP Bilder hochladen.');
      return;
    }

    updateFormData({
      uploadedImage: file,
      selectedImage: null
    });
  }, [updateFormData]);

  const handleDownload = useCallback(() => {
    if (!generatedImageSrc) return;
    const link = document.createElement('a');
    link.href = generatedImageSrc;
    link.download = `sharepic-${type || 'image'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [generatedImageSrc, type]);

  const handleShareToInstagram = useCallback(async () => {
    if (!generatedImageSrc) return;
    setIsSharing(true);
    try {
      const response = await fetch(generatedImageSrc);
      const blob = await response.blob();
      const file = new File([blob], 'sharepic.png', { type: 'image/png' });

      await navigator.share({
        files: [file],
        title: 'Grünerator Sharepic',
        text: generatedPosts?.instagram || '',
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Share failed:', error);
      }
    } finally {
      setIsSharing(false);
    }
  }, [generatedImageSrc, generatedPosts?.instagram]);

  const handleGenerateAltText = useCallback(async () => {
    if (isAltTextLoading || !generatedImageSrc) return;

    setIsAltTextLoading(true);
    try {
      const imageBase64 = generatedImageSrc.replace(/^data:image\/[^;]+;base64,/, '');
      const response = await generateAltTextForImage(imageBase64, `${line1} ${line2} ${line3}`.trim());
      if (response?.altText) {
        setAltText(response.altText);
      }
    } catch (error) {
      console.error('[TemplateResultStep] Alt text generation failed:', error);
    } finally {
      setIsAltTextLoading(false);
    }
  }, [generatedImageSrc, generateAltTextForImage, line1, line2, line3, isAltTextLoading]);

  const handleGenerateInstagramText = useCallback(async () => {
    if (socialLoading || generatedPosts?.instagram) return;

    const sharepicContent = [line1, line2, line3, quote, header, subheader, body]
      .filter(Boolean)
      .join(' ');

    if (!sharepicContent.trim()) return;

    await generatePost(
      sharepicContent,
      `Sharepic Typ: ${type}`,
      ['instagram'],
      false
    );
  }, [line1, line2, line3, quote, header, subheader, body, type, generatePost, socialLoading, generatedPosts?.instagram]);

  const hasGeneratedText = !!(altText || generatedPosts?.instagram);

  const handleTextButtonClick = useCallback(async () => {
    if (hasGeneratedText) {
      const textToCopy = [
        altText ? `Alt-Text: ${altText}` : '',
        generatedPosts?.instagram || ''
      ].filter(Boolean).join('\n\n');

      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Copy failed:', err);
      }
    } else {
      handleGenerateInstagramText();
      handleGenerateAltText();
    }
  }, [hasGeneratedText, altText, generatedPosts?.instagram, handleGenerateInstagramText, handleGenerateAltText]);

  const isMinimalLayout = fieldConfig?.minimalLayout;

  if (!generatedImageSrc) {
    return (
      <div className="template-result-step template-result-step--empty">
        <p>Kein Bild generiert. Bitte gehe zurück und versuche es erneut.</p>
        <button className="btn-primary" onClick={goBack}>
          <FaArrowLeft />
          Zurück
        </button>
      </div>
    );
  }

  // Unified layout for both KI and template types
  return (
    <motion.div
      className={`template-result-step ${isMinimalLayout ? 'template-result-step--minimal' : ''} ${loading ? 'template-result-step--loading' : ''}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Image Display Section */}
      {isMinimalLayout ? (
        <ImageDisplay
          sharepicData={{ image: generatedImageSrc, type: typeConfig?.label || type }}
          title="Dein KI-generiertes Bild"
          downloadFilename={`ki-bild-${type || 'image'}.png`}
          showEditButton={false}
          enableKiLabel={true}
          fullscreenMode={true}
          minimal={true}
        />
      ) : (
        <div className="template-result-main">
          <motion.div
            className="image-result-hero"
            initial={isNewImage ? { opacity: 0, scale: 0.95 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <motion.img
              src={generatedImageSrc}
              alt={altText || 'Generiertes Sharepic'}
              className="image-result-hero__img"
              onClick={() => setIsLightboxOpen(true)}
              initial={isNewImage ? { filter: 'blur(10px)' } : false}
              animate={{ filter: 'blur(0px)' }}
              transition={{ duration: 0.5 }}
            />
          </motion.div>

          <motion.div
            className={`image-result-info ${(altText || generatedPosts?.instagram) ? 'image-result-info--has-text' : ''}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3 }}
          >
            <div className="image-result-info__header">
              <div className="image-result-info__text">
                <h2>Dein Sharepic ist fertig!</h2>
                <p>{galleryEditMode ? 'Speichere deine Änderungen oder lade das Bild herunter.' : 'Lade es herunter oder bearbeite den Text.'}</p>
              </div>

              <div className="action-buttons">
                <button className="btn-icon btn-primary" onClick={handleDownload} disabled={loading} title="Herunterladen">
                  <FaDownload />
                </button>
                {galleryEditMode ? (
                  <button
                    className={`btn-icon btn-primary ${updateSuccess ? 'btn-success' : ''}`}
                    onClick={handleGalleryUpdate}
                    disabled={loading || isUpdating}
                    title={updateSuccess ? 'Gespeichert!' : 'Änderungen speichern'}
                  >
                    {isUpdating ? <Spinner size="small" /> : updateSuccess ? <IoCheckmarkOutline /> : <FaSave />}
                  </button>
                ) : (
                  <button className="btn-icon btn-primary" onClick={() => setShowShareModal(true)} disabled={loading} title="Teilen">
                    <FaShareAlt />
                  </button>
                )}
                {!galleryEditMode && autoSaveStatus === 'saved' && (
                  <button className="btn-icon btn-primary" onClick={() => navigate('/image-studio/gallery')} title="In Galerie anzeigen">
                    <FaImages />
                  </button>
                )}
                <button className="btn-icon btn-primary" onClick={() => setIsEditPanelOpen(true)} disabled={loading} title="Bearbeiten">
                  <FaEdit />
                </button>
                <button
                  className={`btn-icon btn-primary ${copied ? 'btn-success' : ''}`}
                  onClick={handleTextButtonClick}
                  disabled={loading || socialLoading || isAltTextLoading}
                  title={hasGeneratedText ? (copied ? 'Kopiert!' : 'Text kopieren') : 'Texte generieren'}
                >
                  {(socialLoading || isAltTextLoading) ? <Spinner size="small" /> : copied ? <IoCheckmarkOutline /> : hasGeneratedText ? <IoCopyOutline /> : <HiSparkles />}
                </button>
                {canNativeShare && (
                  <button className="btn-icon btn-primary" onClick={handleShareToInstagram} disabled={loading || isSharing} title="Auf Instagram posten">
                    {isSharing ? <Spinner size="small" /> : <FaInstagram />}
                  </button>
                )}
              </div>
            </div>

            {(altText || generatedPosts?.instagram) && (
              <div className="image-result-info__generated">
                {altText && (
                  <motion.div className="alt-text-result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <strong>Alt-Text:</strong> {altText}
                  </motion.div>
                )}
                {generatedPosts?.instagram && (
                  <motion.div className="social-text-result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <h3>Dein Instagram Post:</h3>
                    <div className="markdown-content">
                      <Suspense fallback={<div>Laden...</div>}>
                        <ReactMarkdown>{generatedPosts.instagram}</ReactMarkdown>
                      </Suspense>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Generated Text for Minimal Layout */}
      {isMinimalLayout && fieldConfig?.showSocialGeneration && (altText || generatedPosts?.instagram) && (
        <motion.div className="ki-result-generated-text" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {altText && <div className="alt-text-result"><strong>Alt-Text:</strong> {altText}</div>}
          {generatedPosts?.instagram && (
            <div className="social-text-result">
              <h3>Dein Instagram Post:</h3>
              <div className="markdown-content">
                <Suspense fallback={<div>Laden...</div>}>
                  <ReactMarkdown>{generatedPosts.instagram}</ReactMarkdown>
                </Suspense>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Action Buttons for Minimal Layout */}
      {isMinimalLayout && (
        <div className="ki-studio-result__actions">
          <Button onClick={goBack} text="Zurück" icon={<HiArrowLeft />} className="submit-button" ariaLabel="Zurück zur Eingabe" />
          <Button onClick={() => setShowShareModal(true)} text="Teilen" icon={<HiShare />} className="submit-button" ariaLabel="Bild teilen" />
          {fieldConfig?.showSocialGeneration && (
            <Button
              onClick={handleTextButtonClick}
              loading={socialLoading || isAltTextLoading}
              text={hasGeneratedText ? (copied ? 'Kopiert!' : 'Text kopieren') : 'Texte generieren'}
              icon={copied ? <IoCheckmarkOutline /> : hasGeneratedText ? <IoCopyOutline /> : <HiSparkles />}
              className="submit-button"
              ariaLabel={hasGeneratedText ? 'Text kopieren' : 'Texte generieren'}
            />
          )}
          {fieldConfig?.showAutoSave && autoSaveStatus === 'saved' && (
            <Button onClick={() => navigate('/image-studio/gallery')} text="Galerie" icon={<FaImages />} className="submit-button" ariaLabel="In Galerie anzeigen" />
          )}
          <Button onClick={onRegenerate} loading={loading} text="Neues Bild" icon={<HiRefresh />} className="form-button" ariaLabel="Neues Bild generieren" />
        </div>
      )}

      {/* Edit Panel - only for non-minimal layout */}
      {!isMinimalLayout && (
        <TemplateResultEditPanel
          isOpen={isEditPanelOpen}
          onClose={() => setIsEditPanelOpen(false)}
          fieldConfig={fieldConfig}
          currentImagePreview={currentImagePreview}
          fileInputRef={fileInputRef}
          handleImageChange={handleImageChange}
          previewValues={previewValues}
          handleChange={handleChange}
          displayAlternatives={displayAlternatives}
          isAlternativesOpen={isAlternativesOpen}
          setIsAlternativesOpen={setIsAlternativesOpen}
          handleSloganSwitch={handleSloganSwitch}
          getAlternativePreview={getAlternativePreview}
          credit={credit}
          fontSize={fontSize}
          colorScheme={colorScheme}
          balkenOffset={balkenOffset}
          balkenGruppenOffset={balkenGruppenOffset}
          sunflowerOffset={sunflowerOffset}
          veranstaltungFieldFontSizes={veranstaltungFieldFontSizes}
          handleControlChange={handleControlChange}
          handleFieldFontSizeChange={handleFieldFontSizeChange}
          isAdvancedEditingOpen={isAdvancedEditingOpen}
          toggleAdvancedEditing={toggleAdvancedEditing}
          type={type}
          loading={loading}
          onRegenerate={onRegenerate}
        />
      )}

      {/* Lightbox - only for non-minimal layout */}
      {!isMinimalLayout && (
        <TemplateResultLightbox
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
          imageSrc={generatedImageSrc}
          altText={altText}
        />
      )}

      {/* Share Modal */}
      <ShareMediaModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        mediaType="image"
        imageData={{
          image: generatedImageSrc,
          type: typeConfig?.legacyType || type,
          metadata: buildShareMetadata(),
          originalImage: uploadedImage || selectedImage ? 'pending' : null
        }}
        defaultTitle={typeConfig?.label || (isMinimalLayout ? 'KI-generiertes Bild' : 'Sharepic')}
        getOriginalImage={getOriginalImageBase64}
      />
    </motion.div>
  );
};

export default TemplateResultStep;

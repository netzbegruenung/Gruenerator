import React, { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { FaArrowLeft, FaEdit } from 'react-icons/fa';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useAutoSaveStore } from '../hooks/useAutoSaveStore';
import { useShareStore } from '@gruenerator/shared/share';
import { getTypeConfig, getTemplateFieldConfig, IMAGE_STUDIO_TYPES } from '../utils/typeConfig';
import { getAlternativePreview, buildPreviewValues } from '../utils/templateResultUtils';
import { useLightbox } from '../hooks/useLightbox';
import { useEditPanel } from '../hooks/useEditPanel';
import { useImageHelpers } from '../hooks/useImageHelpers';
import { useTemplateResultActions } from '../hooks/useTemplateResultActions';
import { useTemplateResultAutoSave } from '../hooks/useTemplateResultAutoSave';
import { useImageGeneration } from '../hooks/useImageGeneration';
import { Lightbox } from '../components/Lightbox';
import { EditPanel } from '../components/EditPanel';
import { TemplateResultActionButtons } from '../components/TemplateResultActionButtons';
import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import {
  ZitatPureCanvas,
  ZitatCanvas,
  InfoCanvas,
  VeranstaltungCanvas,
  DreizeilenCanvas
} from '../canvas-editor';
import type { TemplateResultStepProps, SloganAlternativeWithIndex, SloganAlternative, VeranstaltungFieldFontSizes } from '../types/templateResultTypes';

const CANVAS_SUPPORTED_TYPES = [
  IMAGE_STUDIO_TYPES.DREIZEILEN,
  IMAGE_STUDIO_TYPES.ZITAT,
  IMAGE_STUDIO_TYPES.ZITAT_PURE,
  IMAGE_STUDIO_TYPES.INFO,
  IMAGE_STUDIO_TYPES.VERANSTALTUNG
] as const;

const ReactMarkdown = lazy(() => import('react-markdown'));

import './TemplateResultStep.css';

const TemplateResultStep: React.FC<TemplateResultStepProps> = ({ onRegenerate, loading = false, onGoBackToCanvas: _onGoBackToCanvas }) => {
  const navigate = useNavigate();

  const {
    type,
    thema,
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
    setSloganAlternatives,
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
    selectedImage
  } = useImageStudioStore();

  const { autoSaveStatus } = useAutoSaveStore();

  const { isCreating: isUpdating } = useShareStore();
  const typeConfig = useMemo(() => (type ? getTypeConfig(type) : null), [type]);
  const fieldConfig = useMemo(() => (type ? getTemplateFieldConfig(type) : null), [type]);

  const { isOpen: isLightboxOpen, openLightbox, closeLightbox } = useLightbox();
  const {
    isOpen: isEditPanelOpen,
    openPanel: openEditPanel,
    closePanel: closeEditPanel,
    isAlternativesOpen,
    setIsAlternativesOpen
  } = useEditPanel();
  const { currentImagePreview, buildShareMetadata, getOriginalImageBase64 } = useImageHelpers();
  const {
    handleDownload,
    handleShareToInstagram,
    handleTextButtonClick,
    handleGalleryUpdate,
    isSharing,
    copied,
    updateSuccess,
    altText,
    isAltTextLoading,
    generatedPosts,
    socialLoading,
    hasGeneratedText
  } = useTemplateResultActions();

  useTemplateResultAutoSave();

  const { generateAlternatives, alternativesLoading } = useImageGeneration();

  const [isNewImage, setIsNewImage] = useState(true);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  // Default to canvas mode only if we don't have a generated image yet
  const [isCanvasMode, setIsCanvasMode] = useState(!generatedImageSrc);

  const supportsCanvas = useMemo(() =>
    type ? CANVAS_SUPPORTED_TYPES.includes(type as typeof CANVAS_SUPPORTED_TYPES[number]) : false,
    [type]);

  const handleCanvasExport = useCallback((base64: string) => {
    updateFormData({ generatedImageSrc: base64 });
    setIsCanvasMode(false);
  }, [updateFormData]);

  const handleCanvasCancel = useCallback(() => {
    setIsCanvasMode(false);
  }, []);

  const handleSwitchToCanvas = useCallback(() => {
    setIsCanvasMode(true);
  }, []);

  const uploadedImageUrl = useMemo(() => {
    if (uploadedImage) {
      return URL.createObjectURL(uploadedImage);
    }
    if (selectedImage && typeof selectedImage === 'string') {
      return selectedImage;
    }
    return undefined;
  }, [uploadedImage, selectedImage]);

  useEffect(() => {
    return () => {
      if (uploadedImage && uploadedImageUrl) {
        URL.revokeObjectURL(uploadedImageUrl);
      }
    };
  }, [uploadedImage, uploadedImageUrl]);

  const renderCanvasEditor = useCallback(() => {
    if (!type) return null;

    const canvasProps = {
      onExport: handleCanvasExport,
      onCancel: handleCanvasCancel,
    };

    switch (type) {
      case IMAGE_STUDIO_TYPES.DREIZEILEN:
        return (
          <DreizeilenCanvas
            line1={line1 || ''}
            line2={line2 || ''}
            line3={line3 || ''}
            imageSrc={uploadedImageUrl}
            alternatives={sloganAlternatives}
            {...canvasProps}
          />
        );
      case IMAGE_STUDIO_TYPES.ZITAT:
        return (
          <ZitatCanvas
            quote={quote || ''}
            name={name || ''}
            imageSrc={uploadedImageUrl || ''}
            alternatives={sloganAlternatives?.map((a: SloganAlternative) => a.quote || '')}
            {...canvasProps}
          />
        );
      case IMAGE_STUDIO_TYPES.ZITAT_PURE:
        return (
          <ZitatPureCanvas
            quote={quote || ''}
            name={name || ''}
            alternatives={sloganAlternatives?.map((a: SloganAlternative) => a.quote || '')}
            {...canvasProps}
          />
        );
      case IMAGE_STUDIO_TYPES.INFO:
        return (
          <InfoCanvas
            header={header || ''}
            subheader={subheader || ''}
            body={body || ''}
            alternatives={sloganAlternatives}
            {...canvasProps}
          />
        );
      case IMAGE_STUDIO_TYPES.VERANSTALTUNG:
        return (
          <VeranstaltungCanvas
            eventTitle={eventTitle || ''}
            beschreibung={beschreibung || ''}
            weekday={weekday || ''}
            date={date || ''}
            time={time || ''}
            locationName={locationName || ''}
            address={address || ''}
            imageSrc={uploadedImageUrl || ''}
            {...canvasProps}
          />
        );
      default:
        return null;
    }
  }, [
    type, line1, line2, line3, quote, name, header, subheader, body,
    eventTitle, weekday, date, time, locationName, address,
    uploadedImageUrl, sloganAlternatives, handleCanvasExport, handleCanvasCancel
  ]);

  const stableAlternativesRef = useRef<SloganAlternativeWithIndex[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const previewValues = useMemo(() => buildPreviewValues({
    line1, line2, line3, quote, header, subheader, body,
    eventTitle, weekday, date, time, locationName, address
  }), [line1, line2, line3, quote, header, subheader, body, eventTitle, weekday, date, time, locationName, address]);

  if (stableAlternativesRef.current === null && sloganAlternatives?.length > 0) {
    stableAlternativesRef.current = sloganAlternatives.map((alt: SloganAlternative, idx: number) => ({
      ...alt,
      _index: idx
    } as unknown as SloganAlternativeWithIndex));
  }

  const displayAlternatives: SloganAlternativeWithIndex[] = stableAlternativesRef.current || [];

  useEffect(() => {
    setIsNewImage(true);
    const timer = setTimeout(() => setIsNewImage(false), 1000);
    return () => clearTimeout(timer);
  }, [generatedImageSrc]);

  useEffect(() => {
    if (generatedImageSrc) {
      cacheSloganImage(currentAlternativeIndex, generatedImageSrc);
    }
  }, [generatedImageSrc, currentAlternativeIndex, cacheSloganImage]);

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

  const handleSloganSwitch = useCallback((selected: SloganAlternative, alternativeIndex: number) => {
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
    currentAlternativeIndex, generatedImageSrc, updateFormData, onRegenerate, setIsAlternativesOpen]);

  const handleControlChange = useCallback((controlName: string, value: unknown) => {
    updateFormData({ [controlName]: value });
  }, [updateFormData]);

  const handleFieldFontSizeChange = useCallback((fieldName: string, value: number) => {
    updateFieldFontSize(fieldName as keyof VeranstaltungFieldFontSizes, value);
  }, [updateFieldFontSize]);

  const handleTextFieldChange = useCallback((e: { target: { name: string; value: string } }) => {
    handleChange(e as React.ChangeEvent<HTMLInputElement>);
  }, [handleChange]);

  const handleImageChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
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

  const handleGenerateAlternatives = useCallback(async () => {
    if (!type) return;

    const result = await generateAlternatives(type, { thema, name, quote });
    if (result?.alternatives && result.alternatives.length > 0) {
      setSloganAlternatives(result.alternatives);
      stableAlternativesRef.current = result.alternatives.map((alt, idx) => ({
        ...alt,
        _index: idx
      } as unknown as SloganAlternativeWithIndex));
    }
  }, [type, thema, name, quote, generateAlternatives, setSloganAlternatives]);

  if (!generatedImageSrc && !supportsCanvas) {
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

  if (supportsCanvas && isCanvasMode) {
    return (
      <motion.div
        className="template-result-step template-result-step--canvas-mode"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {renderCanvasEditor()}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`template-result-step ${loading ? 'template-result-step--loading' : ''}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="template-result-main">
        <motion.div
          className="image-result-hero"
          initial={isNewImage ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <motion.img
            src={generatedImageSrc || undefined}
            alt={altText || 'Generiertes Sharepic'}
            className="image-result-hero__img"
            onClick={openLightbox}
            initial={isNewImage ? { filter: 'blur(10px)' } : false}
            animate={{ filter: 'blur(0px)' }}
            transition={{ duration: 0.5 }}
          />
          {supportsCanvas && (
            <button
              className="btn-icon image-result-hero__edit-btn"
              onClick={handleSwitchToCanvas}
              title="Im Canvas-Editor bearbeiten"
            >
              <FaEdit />
            </button>
          )}
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

            <TemplateResultActionButtons
              generatedImageSrc={generatedImageSrc || ''}
              loading={loading}
              galleryEditMode={galleryEditMode}
              autoSaveStatus={autoSaveStatus}
              hasGeneratedText={hasGeneratedText}
              copied={copied}
              updateSuccess={updateSuccess}
              isSharing={isSharing}
              socialLoading={socialLoading}
              isAltTextLoading={isAltTextLoading}
              canNativeShare={canNativeShare}
              isUpdating={isUpdating}
              onDownload={handleDownload}
              onShare={() => setShowShareModal(true)}
              onGalleryUpdate={handleGalleryUpdate}
              onNavigateToGallery={() => navigate('/image-studio/gallery')}
              onOpenEditPanel={supportsCanvas ? handleSwitchToCanvas : openEditPanel}
              onTextButtonClick={handleTextButtonClick}
              onShareToInstagram={handleShareToInstagram}
            />
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

      <EditPanel
        isOpen={isEditPanelOpen}
        onClose={closeEditPanel}
        fieldConfig={fieldConfig}
        currentImagePreview={currentImagePreview}
        fileInputRef={fileInputRef as React.RefObject<HTMLInputElement>}
        handleImageChange={handleImageChange}
        previewValues={previewValues}
        handleChange={handleTextFieldChange}
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
        type={type || undefined}
        loading={loading}
        onRegenerate={onRegenerate}
        onGenerateAlternatives={handleGenerateAlternatives}
        alternativesLoading={alternativesLoading}
      />

      <Lightbox
        isOpen={isLightboxOpen}
        onClose={closeLightbox}
        imageSrc={generatedImageSrc || ''}
        altText={altText}
      />

      <ShareMediaModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        mediaType="image"
        imageData={{
          image: generatedImageSrc || undefined,
          type: (typeConfig?.legacyType || type) ?? undefined,
          metadata: buildShareMetadata() as Record<string, unknown>,
          originalImage: uploadedImage || selectedImage ? 'pending' : undefined
        }}
        defaultTitle={typeConfig?.label || 'Sharepic'}
        getOriginalImage={async () => (await getOriginalImageBase64()) ?? undefined}
      />
    </motion.div>
  );
};

export default TemplateResultStep;

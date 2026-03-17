import {
  ControllableCanvasWrapper,
  type CanvasConfigId,
  type DreizeilenAlternative,
  type InitialPageDef,
} from '@gruenerator/canvas-editor';
import { useShareStore } from '@gruenerator/shared/share';
import { Button } from '@gruenerator/ui';
import { motion } from 'motion/react';
import React, { useState, useCallback, useMemo, useEffect, useRef, type ChangeEvent } from 'react';
import { FaArrowLeft, FaEdit } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

import { Markdown } from '../../../components/common/Markdown';
import { ShareMediaModal } from '../../../components/common/ShareMediaModal';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { cn } from '../../../utils/cn';
import { AiHistoryTimeline } from '../components/AiHistoryTimeline';
import { EditPanel } from '../components/EditPanel';
import { Lightbox } from '../components/Lightbox';
import { TemplateResultActionButtons } from '../components/TemplateResultActionButtons';
import { useAiEditorHistory } from '../hooks/useAiEditorHistory';
import { useAutoSaveStore } from '../hooks/useAutoSaveStore';
import { useEditPanel } from '../hooks/useEditPanel';
import { useImageGeneration } from '../hooks/useImageGeneration';
import { useImageHelpers } from '../hooks/useImageHelpers';
import { useLightbox } from '../hooks/useLightbox';
import { useTemplateResultActions } from '../hooks/useTemplateResultActions';
import { useTemplateResultAutoSave } from '../hooks/useTemplateResultAutoSave';
import { getAlternativePreview, buildPreviewValues } from '../utils/templateResultUtils';
import {
  getTypeConfig,
  getTemplateFieldConfig,
  IMAGE_STUDIO_TYPES,
  FORM_STEPS,
} from '../utils/typeConfig';

import type {
  TemplateResultStepProps,
  SloganAlternativeWithIndex,
  SloganAlternative,
  VeranstaltungFieldFontSizes,
} from '../types/templateResultTypes';

const CANVAS_SUPPORTED_TYPES = [
  IMAGE_STUDIO_TYPES.DREIZEILEN,
  IMAGE_STUDIO_TYPES.ZITAT,
  IMAGE_STUDIO_TYPES.ZITAT_PURE,
  IMAGE_STUDIO_TYPES.INFO,
  IMAGE_STUDIO_TYPES.VERANSTALTUNG,
  IMAGE_STUDIO_TYPES.SLIDER,
  IMAGE_STUDIO_TYPES.FREEFORM,
] as const;

const TemplateResultStep: React.FC<TemplateResultStepProps> = ({
  onRegenerate,
  loading = false,
  onGoBackToCanvas: _onGoBackToCanvas,
}) => {
  const navigate = useNavigate();

  const {
    type,
    category,
    subcategory,
    thema,
    generatedImageSrc,
    line1,
    line2,
    line3,
    quote,
    name,
    header,
    subheader,
    body,
    headline,
    subtext,
    label,
    eventTitle,
    beschreibung,
    weekday,
    date,
    time,
    locationName,
    address,
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
    setCurrentStep,
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
    selectedImage,
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
    setIsAlternativesOpen,
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
    hasGeneratedText,
  } = useTemplateResultActions();

  useTemplateResultAutoSave();

  const { generateAlternatives, alternativesLoading } = useImageGeneration();

  // AI Editor history (undo/redo)
  const isAiEditor = typeConfig?.hasAiEditor === true;
  const { undo, redo, canUndo, canRedo } = useAiEditorHistory();

  const [isNewImage, setIsNewImage] = useState(true);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  // Default to canvas mode only if we don't have a generated image yet
  const [isCanvasMode, setIsCanvasMode] = useState(!generatedImageSrc);

  const supportsCanvas = useMemo(
    () =>
      type
        ? CANVAS_SUPPORTED_TYPES.includes(type as (typeof CANVAS_SUPPORTED_TYPES)[number])
        : false,
    [type]
  );

  const handleCanvasExport = useCallback(
    (base64: string) => {
      updateFormData({ generatedImageSrc: base64 });
      setIsCanvasMode(false);
    },
    [updateFormData]
  );

  const handleCanvasCancel = useCallback(() => {
    setIsCanvasMode(false);
  }, []);

  const handleSwitchToCanvas = useCallback(() => {
    setIsCanvasMode(true);
  }, []);

  const handleRecreate = useCallback(() => {
    // Clear all form data
    updateFormData({
      thema: '',
      details: '',
      line1: '',
      line2: '',
      line3: '',
      quote: '',
      name: '',
      header: '',
      subheader: '',
      body: '',
      headline: '',
      subtext: '',
      precisionInstruction: '',
      precisionMode: false,
      selectedInfrastructure: [],
      purePrompt: '',
      sharepicPrompt: '',
      imagineTitle: '',
      variant: null,
      allyPlacement: null,
      uploadedImage: null,
      selectedImage: null,
      generatedImageSrc: null,
      sloganAlternatives: [],
      searchTerms: [],
    });

    // Get first step from type config
    const firstStep = typeConfig?.steps?.[0] || FORM_STEPS.INPUT;
    setCurrentStep(firstStep);

    // Navigate to type route to ensure clean state
    const route = subcategory
      ? `/image-studio/${category}/${subcategory}`
      : `/image-studio/${category}`;
    navigate(route);
  }, [typeConfig, category, subcategory, updateFormData, setCurrentStep, navigate]);

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

    switch (type) {
      case IMAGE_STUDIO_TYPES.DREIZEILEN:
        return (
          <ControllableCanvasWrapper
            type="dreizeilen"
            initialState={{
              line1: line1 || '',
              line2: line2 || '',
              line3: line3 || '',
              currentImageSrc: uploadedImageUrl || '',
              alternatives: sloganAlternatives.map(
                (alt, index): DreizeilenAlternative => ({
                  id: `alt-${index}`,
                  line1: alt.line1 || '',
                  line2: alt.line2 || '',
                  line3: alt.line3 || '',
                })
              ),
            }}
            imageSrc={uploadedImageUrl}
            onExport={handleCanvasExport}
            onCancel={handleCanvasCancel}
          />
        );
      case IMAGE_STUDIO_TYPES.ZITAT:
        return (
          <ControllableCanvasWrapper
            type="zitat"
            initialState={{
              quote: quote || '',
              name: name || '',
              alternatives: sloganAlternatives?.map((a: SloganAlternative) => a.quote || '') || [],
            }}
            imageSrc={uploadedImageUrl || ''}
            onExport={handleCanvasExport}
            onCancel={handleCanvasCancel}
          />
        );
      case IMAGE_STUDIO_TYPES.ZITAT_PURE:
        return (
          <ControllableCanvasWrapper
            type="zitat-pure"
            initialState={{
              quote: quote || '',
              name: name || '',
              alternatives: sloganAlternatives?.map((a: SloganAlternative) => a.quote || '') || [],
            }}
            onExport={handleCanvasExport}
            onCancel={handleCanvasCancel}
          />
        );
      case IMAGE_STUDIO_TYPES.INFO:
        return (
          <ControllableCanvasWrapper
            type="info"
            initialState={{
              header: header || '',
              body: body || '',
              alternatives: sloganAlternatives || [],
            }}
            onExport={handleCanvasExport}
            onCancel={handleCanvasCancel}
          />
        );
      case IMAGE_STUDIO_TYPES.VERANSTALTUNG:
        return (
          <ControllableCanvasWrapper
            type="veranstaltung"
            initialState={{
              eventTitle: eventTitle || '',
              beschreibung: beschreibung || '',
              weekday: weekday || '',
              date: date || '',
              time: time || '',
              locationName: locationName || '',
              address: address || '',
              alternatives: sloganAlternatives || [],
            }}
            imageSrc={uploadedImageUrl || ''}
            onExport={handleCanvasExport}
            onCancel={handleCanvasCancel}
          />
        );
      case IMAGE_STUDIO_TYPES.SLIDER:
        return (
          <ControllableCanvasWrapper
            type="slider"
            initialState={{
              label: label || '',
              headline: headline || '',
              subtext: subtext || '',
              alternatives: sloganAlternatives || [],
            }}
            onExport={handleCanvasExport}
            onCancel={handleCanvasCancel}
            initialPages={
              sloganAlternatives && sloganAlternatives.length > 0
                ? [
                    {
                      configId: 'slider' as CanvasConfigId,
                      state: {
                        label: label || '',
                        headline: headline || '',
                        subtext: subtext || '',
                        slideVariant: 'cover',
                      },
                    },
                    ...sloganAlternatives.slice(1).map(
                      (alt: SloganAlternative, index: number): InitialPageDef => ({
                        configId: 'slider' as CanvasConfigId,
                        state: {
                          label: alt.label || 'Wusstest du?',
                          headline: alt.headline || '',
                          subtext: alt.subtext || '',
                          slideVariant: index < sloganAlternatives.length - 2 ? 'content' : 'cover',
                        },
                      })
                    ),
                  ]
                : undefined
            }
          />
        );
      case IMAGE_STUDIO_TYPES.FREEFORM:
        return (
          <ControllableCanvasWrapper
            type="freeform"
            initialState={{}}
            onExport={handleCanvasExport}
            onCancel={handleCanvasCancel}
          />
        );
      default:
        return null;
    }
  }, [
    type,
    line1,
    line2,
    line3,
    quote,
    name,
    header,
    body,
    headline,
    subtext,
    label,
    eventTitle,
    beschreibung,
    weekday,
    date,
    time,
    locationName,
    address,
    uploadedImageUrl,
    sloganAlternatives,
    handleCanvasExport,
    handleCanvasCancel,
  ]);

  const stableAlternativesRef = useRef<SloganAlternativeWithIndex[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const previewValues = useMemo(
    () =>
      buildPreviewValues({
        line1,
        line2,
        line3,
        quote,
        header,
        subheader,
        body,
        eventTitle,
        weekday,
        date,
        time,
        locationName,
        address,
      }),
    [
      line1,
      line2,
      line3,
      quote,
      header,
      subheader,
      body,
      eventTitle,
      weekday,
      date,
      time,
      locationName,
      address,
    ]
  );

  if (stableAlternativesRef.current === null && sloganAlternatives?.length > 0) {
    stableAlternativesRef.current = sloganAlternatives.map(
      (alt: SloganAlternative, idx: number) =>
        ({
          ...alt,
          _index: idx,
        }) as unknown as SloganAlternativeWithIndex
    );
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
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        ) ||
        (navigator.maxTouchPoints > 0 && window.innerWidth <= 768);

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

  const handleSloganSwitch = useCallback(
    (selected: SloganAlternative, alternativeIndex: number) => {
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
    },
    [
      cacheSloganImage,
      getCachedSloganImage,
      handleSloganSelect,
      setCurrentAlternativeIndex,
      currentAlternativeIndex,
      generatedImageSrc,
      updateFormData,
      onRegenerate,
      setIsAlternativesOpen,
    ]
  );

  const handleControlChange = useCallback(
    (controlName: string, value: unknown) => {
      updateFormData({ [controlName]: value });
    },
    [updateFormData]
  );

  const handleFieldFontSizeChange = useCallback(
    (fieldName: string, value: number) => {
      updateFieldFontSize(fieldName as keyof VeranstaltungFieldFontSizes, value);
    },
    [updateFieldFontSize]
  );

  const handleTextFieldChange = useCallback(
    (e: { target: { name: string; value: string } }) => {
      handleChange(e as React.ChangeEvent<HTMLInputElement>);
    },
    [handleChange]
  );

  const handleImageChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        alert('Bitte nur JPEG, PNG oder WebP Bilder hochladen.');
        return;
      }

      updateFormData({
        uploadedImage: file,
        selectedImage: null,
      });
    },
    [updateFormData]
  );

  const handleGenerateAlternatives = useCallback(async () => {
    if (!type) return;

    const result = await generateAlternatives(type, { thema, name, quote });
    if (result?.alternatives && result.alternatives.length > 0) {
      setSloganAlternatives(result.alternatives);
      stableAlternativesRef.current = result.alternatives.map(
        (alt, idx) =>
          ({
            ...alt,
            _index: idx,
          }) as unknown as SloganAlternativeWithIndex
      );
    }
  }, [type, thema, name, quote, generateAlternatives, setSloganAlternatives]);

  if (!generatedImageSrc && !supportsCanvas) {
    if (loading) {
      return (
        <div className="flex flex-col items-center w-full min-h-[70vh] p-md justify-center min-h-[60vh]">
          <motion.div
            className="flex flex-col items-center text-center gap-md max-w-[400px]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 border-4 border-[var(--border-subtle)] border-t-[var(--interactive-accent-color)] rounded-full animate-spin" />
            </div>
            <h3 className="m-0 text-[length:var(--font-size-xl)] font-semibold text-foreground-heading">
              Dein Bild wird generiert...
            </h3>
            <p className="m-0 text-[length:var(--font-size-base)] text-foreground opacity-80 leading-[var(--line-height-normal)]">
              Dies kann einige Sekunden dauern. Bitte habe einen Moment Geduld.
            </p>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center w-full min-h-[70vh] p-md justify-center gap-md text-center">
        <p>Kein Bild generiert. Bitte gehe zurück und versuche es erneut.</p>
        <Button variant="brand" size="brand" onClick={goBack}>
          <FaArrowLeft />
          Zurück
        </Button>
      </div>
    );
  }

  if (supportsCanvas && isCanvasMode) {
    return (
      <motion.div
        className="flex flex-col items-center w-full p-0 min-h-[calc(100vh-60px)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {renderCanvasEditor()}
      </motion.div>
    );
  }

  const hasText = altText || generatedPosts?.instagram;

  return (
    <motion.div
      className={cn(
        'flex flex-col items-center w-full min-h-[70vh] p-md lg:p-0',
        loading &&
          '[&_.image-result-hero-img]:opacity-70 [&_.action-buttons_button]:pointer-events-none'
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex flex-col items-center w-full lg:flex-row lg:items-center lg:justify-center lg:gap-xl lg:p-0">
        <motion.div
          className="flex justify-center items-center p-md relative lg:shrink-0 lg:p-0"
          initial={isNewImage ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <motion.img
            src={generatedImageSrc || undefined}
            alt={altText || 'Generiertes Sharepic'}
            className="image-result-hero-img max-w-full max-h-[65vh] w-auto h-auto rounded-2xl shadow-xl cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.01] motion-reduce:transition-none min-[768px]:max-h-[70vh] lg:max-h-[75vh]"
            onClick={openLightbox}
            initial={isNewImage ? { filter: 'blur(10px)' } : false}
            animate={{ filter: 'blur(0px)' }}
            transition={{ duration: 0.5 }}
          />
          {supportsCanvas && (
            <button
              className="btn-icon absolute top-lg right-lg w-11 h-11 rounded-full bg-background border border-grey-200 dark:border-grey-700 shadow-sm flex items-center justify-center cursor-pointer transition-all duration-200 ease-out text-foreground hover:bg-[var(--interactive-accent-color)] hover:text-white hover:border-[var(--interactive-accent-color)] hover:scale-105 [&_svg]:w-[18px] [&_svg]:h-[18px]"
              onClick={handleSwitchToCanvas}
              title="Im Canvas-Editor bearbeiten"
            >
              <FaEdit />
            </button>
          )}
        </motion.div>

        <motion.div
          className={cn(
            'flex flex-col items-center text-center w-full py-md px-0 gap-md lg:items-start lg:text-left lg:p-0',
            hasText && 'items-start text-left'
          )}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          <div
            className={cn(
              'flex flex-col items-center gap-sm w-full lg:items-start',
              hasText && 'flex-row justify-between items-center'
            )}
          >
            <div className={cn('flex flex-col gap-xs lg:items-start', hasText && 'items-start')}>
              <h2
                className={cn(
                  'm-0 text-[length:var(--font-size-xl)] font-semibold text-foreground-heading',
                  hasText && 'text-[length:var(--font-size-lg)]'
                )}
              >
                Dein Sharepic ist fertig!
              </h2>
              <p
                className={cn(
                  'm-0 text-[length:var(--font-size-base)] text-foreground opacity-80',
                  hasText && 'hidden'
                )}
              >
                {galleryEditMode
                  ? 'Speichere deine Änderungen oder lade das Bild herunter.'
                  : typeConfig?.usesFluxApi
                    ? 'Lade es herunter oder generiere eine neue Variante.'
                    : 'Lade es herunter oder bearbeite den Text.'}
              </p>
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
              isAiType={typeConfig?.usesFluxApi || false}
              isAiEditor={isAiEditor}
              canUndo={canUndo()}
              canRedo={canRedo()}
              onDownload={handleDownload}
              onShare={() => setShowShareModal(true)}
              onGalleryUpdate={handleGalleryUpdate}
              onNavigateToGallery={() => navigate('/image-studio/gallery')}
              onOpenEditPanel={supportsCanvas ? handleSwitchToCanvas : openEditPanel}
              onRecreate={handleRecreate}
              onTextButtonClick={handleTextButtonClick}
              onShareToInstagram={handleShareToInstagram}
              onUndo={undo}
              onRedo={redo}
            />

            {isAiEditor && <AiHistoryTimeline />}
          </div>

          {(altText || generatedPosts?.instagram) && (
            <div className="flex flex-col gap-sm w-full">
              {altText && (
                <motion.div
                  className="bg-background-alt px-md py-sm rounded-lg text-left text-[length:var(--font-size-xxs)] leading-[var(--line-height-snug)] text-foreground [&_strong]:font-semibold [&_strong]:text-foreground-heading"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <strong>Alt-Text:</strong> {altText}
                </motion.div>
              )}
              {generatedPosts?.instagram && (
                <motion.div
                  className="bg-background-alt px-md py-sm rounded-lg text-left text-[length:var(--font-size-xxs)] leading-[var(--line-height-snug)] text-foreground [&_h3]:m-0 [&_h3]:mb-xs [&_h3]:text-[length:var(--font-size-xs)] [&_h3]:font-semibold [&_h3]:text-foreground-heading"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <h3>Dein Instagram Post:</h3>
                  <div className="markdown-content text-[length:var(--font-size-xxs)] text-foreground mb-xs leading-[var(--line-height-snug)] [&_p]:m-0 [&_p]:mb-1 [&_p:last-child]:mb-0">
                    <Markdown fallback={<div>Laden...</div>}>{generatedPosts.instagram}</Markdown>
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
          originalImage: uploadedImage || selectedImage ? 'pending' : undefined,
        }}
        defaultTitle={typeConfig?.label || 'Sharepic'}
        getOriginalImage={async () => (await getOriginalImageBase64()) ?? undefined}
      />
    </motion.div>
  );
};

export default TemplateResultStep;

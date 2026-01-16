import React, { useState, useCallback, useRef, useMemo, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import BaseForm from '../../../components/common/BaseForm';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { fileToBase64 } from '../../../utils/fileAttachmentUtils';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import useAltTextGeneration from '../../../components/hooks/useAltTextGeneration';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import type { HelpContent } from '../../../types/baseform';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';
import AltTextForm from '../accessibility/components/AltTextForm';
import LeichteSpracheForm from '../accessibility/components/LeichteSpracheForm';
import { convertCanvaDesignToBase64 } from '../../../utils/canvaImageHelper';
import PlatformSelector from '../../../components/common/PlatformSelector';
import Icon from '../../../components/common/Icon';

interface FormRef {
  getFormData: () => Record<string, unknown> | null;
  isValid: () => boolean;
  setCanvaDesign?: (designData: unknown) => void;
}

interface BarrierefreiheitTabProps {
  isActive: boolean;
}

const ACCESSIBILITY_TYPES = {
  ALT_TEXT: 'alt-text',
  LEICHTE_SPRACHE: 'leichte-sprache'
};

const ACCESSIBILITY_TYPE_LABELS = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: 'Alt-Text',
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: 'Leichte Sprache'
};

const AltTextIcon = memo(() => <Icon category="accessibility" name="alt-text" size={16} />);
AltTextIcon.displayName = 'AltTextIcon';

const LeichteSpracheIcon = memo(() => <Icon category="accessibility" name="leichte-sprache" size={16} />);
LeichteSpracheIcon.displayName = 'LeichteSpracheIcon';

const ACCESSIBILITY_TYPE_ICONS: Record<string, () => React.ReactNode> = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: () => <AltTextIcon />,
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: () => <LeichteSpracheIcon />
};

const API_ENDPOINTS = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: '/claude_alttext',
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: '/leichte_sprache'
};

const BarrierefreiheitTab: React.FC<BarrierefreiheitTabProps> = memo(({ isActive }) => {
  const [searchParams] = useSearchParams();

  const initialType = useMemo(() => {
    const typeParam = searchParams.get('type');
    if (typeParam === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE) {
      return ACCESSIBILITY_TYPES.LEICHTE_SPRACHE;
    }
    return ACCESSIBILITY_TYPES.ALT_TEXT;
  }, [searchParams]);

  const [selectedType, setSelectedType] = useState(initialType);
  const [generatedContent, setGeneratedContent] = useState('');
  const formRef = useRef<FormRef>(null);

  const { setGeneratedText } = useGeneratedTextStore();

  useOptimizedAuth();

  const setup = useGeneratorSetup({
    instructionType: 'leichte_sprache',
    componentName: 'accessibility-leichte-sprache'
  });

  const usePrivacyMode = useGeneratorSelectionStore(state => state.usePrivacyMode);
  const componentName = `accessibility-${selectedType}`;

  const helpContent = useMemo<HelpContent>(() => {
    if (selectedType === ACCESSIBILITY_TYPES.ALT_TEXT) {
      return {
        content: "Erstelle barrierefreie Alt-Texte für Bilder nach den Richtlinien des DBSV.",
        tips: [
          "Lade ein Bild hoch (JPG, PNG, WebP)",
          "Füge optional eine Beschreibung hinzu",
          "Alt-Texte sollten prägnant aber beschreibend sein"
        ]
      };
    }
    return {
      content: "Übersetze Texte in Leichte Sprache für bessere Verständlichkeit.",
      tips: [
        "Füge den zu übersetzenden Text ein",
        "Die Übersetzung erfolgt in kurzen, klaren Sätzen",
        "Schwierige Wörter werden erklärt oder ersetzt"
      ]
    };
  }, [selectedType]);

  const form = useBaseForm({
    defaultValues: {},
    generatorType: `accessibility-${selectedType}`,
    componentName: componentName,
    endpoint: API_ENDPOINTS[selectedType],
    disableKnowledgeSystem: true,
    features: [],
    tabIndexKey: (selectedType === ACCESSIBILITY_TYPES.ALT_TEXT ? 'ALT_TEXT' : 'LEICHTE_SPRACHE'),
    helpContent: helpContent
  } as Record<string, unknown>);

  const {
    generateAltTextForImage,
    loading: altTextLoading,
    success: altTextSuccess,
    error: altTextError
  } = useAltTextGeneration();

  const {
    submitForm: submitLeichteSprache,
    loading: leichteSpracheLoading,
    success: leichteSpracheSuccess,
    error: leichteSpracheError
  } = useApiSubmit(API_ENDPOINTS[ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]);

  const {
    crawledUrls,
    isCrawling,
    detectAndCrawlUrls
  } = useUrlCrawler();

  const allAttachments = useMemo(() => [
    ...(form.generator?.attachedFiles || []),
    ...crawledUrls
  ], [form.generator?.attachedFiles, crawledUrls]);

  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: ['originalText'] as const
  });

  const handleUrlsDetected = useCallback(async (urls: string[]) => {
    if (selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE && !isCrawling && urls.length > 0) {
      await detectAndCrawlUrls(urls.join(' '), usePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, selectedType, usePrivacyMode]);

  const combinedLoading = altTextLoading || leichteSpracheLoading;
  const combinedSuccess = altTextSuccess || leichteSpracheSuccess;
  const combinedError = altTextError || leichteSpracheError;

  const handleSubmit = useCallback(async () => {
    if (!formRef.current?.getFormData || !formRef.current?.isValid()) return;

    const formData = formRef.current.getFormData();
    if (!formData) return;

    try {
      if (selectedType === ACCESSIBILITY_TYPES.ALT_TEXT) {
        interface CanvaDesignData {
          design: unknown;
          title?: string;
        }
        const hasUploadedImage = formData.hasUploadedImage as boolean;
        const hasCanvaImage = formData.hasCanvaImage as boolean;
        const uploadedImage = formData.uploadedImage as File | null;
        const selectedCanvaDesign = formData.selectedCanvaDesign as CanvaDesignData | null;
        const imageSource = formData.imageSource as string;
        const imageDescription = formData.imageDescription as string | null;

        if (!hasUploadedImage && !hasCanvaImage) return;

        let imageBase64;
        let imageContext = '';

        if (imageSource === 'upload' && hasUploadedImage && uploadedImage) {
          imageBase64 = await fileToBase64(uploadedImage);
          imageContext = `Bild: ${uploadedImage.name}`;
        } else if (imageSource === 'canva' && hasCanvaImage && selectedCanvaDesign) {
          const conversionResult = await convertCanvaDesignToBase64(selectedCanvaDesign.design as { thumbnail_url?: string; title?: string; id?: string; [key: string]: unknown });
          imageBase64 = conversionResult.base64;
          imageContext = `Canva Design: ${selectedCanvaDesign.title || 'Untitled'}`;
        } else {
          throw new Error('Invalid image source');
        }

        let fullDescription = imageDescription || '';
        if (imageContext) {
          fullDescription = fullDescription ? `${imageContext}. ${fullDescription}` : imageContext;
        }

        const response = await generateAltTextForImage(
          imageBase64,
          (fullDescription ? fullDescription : null) as null | undefined
        );

        const altTextResult = response?.altText || response || '';
        const altText = typeof altTextResult === 'string' ? altTextResult : '';

        setGeneratedContent(altText);
        form.generator?.handleGeneratedContentChange(altText);

      } else if (selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE) {
        const formDataToSubmit = builder.buildSubmissionData({
          originalText: formData.originalText,
          targetLanguage: formData.targetLanguage
        });

        const response = await submitLeichteSprache(formDataToSubmit as unknown as Record<string, unknown>);
        if (response) {
          const responseContent = typeof response === 'string' ? response : (response as { content?: string }).content;
          if (responseContent) {
            setGeneratedContent(responseContent);
            form.generator?.handleGeneratedContentChange(responseContent);
          }
        }
      }
    } catch (error) {
      console.error('[BarrierefreiheitTab] Error:', error);
      if (error instanceof Error) {
        form.handleSubmitError?.(error);
      }
    }
  }, [selectedType, generateAltTextForImage, submitLeichteSprache, form, builder]);

  const renderForm = () => {
    const tabIndexValue = form.generator?.tabIndex as { [key: string]: number | undefined } | undefined;
    switch (selectedType) {
      case ACCESSIBILITY_TYPES.ALT_TEXT:
        return <AltTextForm ref={formRef as any} tabIndex={tabIndexValue} />;
      case ACCESSIBILITY_TYPES.LEICHTE_SPRACHE:
        return (
          <LeichteSpracheForm
            ref={formRef as any}
            tabIndex={tabIndexValue}
            onUrlsDetected={handleUrlsDetected}
          />
        );
      default:
        return null;
    }
  };

  const accessibilityTypeOptions = useMemo(() => Object.entries(ACCESSIBILITY_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
    icon: ACCESSIBILITY_TYPE_ICONS[value]
  })), []);

  const handleTypeChange = useCallback((value: string | number | (string | number)[] | null) => {
    if (typeof value === 'string') {
      setSelectedType(value);
    }
  }, []);

  const renderTypeSelector = useCallback(() => (
    <PlatformSelector
      name="accessibilityType"
      options={accessibilityTypeOptions}
      value={selectedType}
      onChange={handleTypeChange}
      label="Art der Barrierefreiheit"
      placeholder="Typ auswählen..."
      isMulti={false}
      control={undefined}
      enableIcons={true}
      enableSubtitles={false}
      isSearchable={false}
      required={true}
    />
  ), [accessibilityTypeOptions, selectedType, handleTypeChange]);

  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));

  if (!isActive) return null;

  return (
    <BaseForm
      {...form.generator?.baseFormProps}
      generatedContent={(storeGeneratedText || generatedContent) as import('../../../types/baseform').GeneratedContent}
      onSubmit={handleSubmit}
      firstExtrasChildren={renderTypeSelector()}
      useFeatureIcons={false}
      loading={combinedLoading}
      success={combinedSuccess}
      error={combinedError}
      platformOptions={(form.generator?.baseFormProps?.platformOptions || undefined) as any}
      componentName={componentName}
      enableEditMode={selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE}
    >
      {renderForm()}
    </BaseForm>
  );
});

BarrierefreiheitTab.displayName = 'BarrierefreiheitTab';

export default BarrierefreiheitTab;

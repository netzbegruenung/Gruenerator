import React, { useState, useCallback, useRef, useMemo, memo } from 'react';
import { useSearchParams } from 'react-router-dom';

import BaseForm from '../../../components/common/BaseForm';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import Icon from '../../../components/common/Icon';
import PlatformSelector from '../../../components/common/PlatformSelector';
import useAltTextGeneration from '../../../components/hooks/useAltTextGeneration';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';
import { fileToBase64 } from '../../../utils/fileAttachmentUtils';
import AltTextForm from '../accessibility/components/AltTextForm';
import LeichteSpracheForm from '../accessibility/components/LeichteSpracheForm';

import type { HelpContent, GeneratedContent } from '../../../types/baseform';

interface FormRef {
  getFormData: () => Record<string, unknown> | null;
  isValid: () => boolean;
}

type BarrierefreiheitTabProps = Record<string, never>;

const ACCESSIBILITY_TYPES = {
  ALT_TEXT: 'alt-text',
  LEICHTE_SPRACHE: 'leichte-sprache',
};

const ACCESSIBILITY_TYPE_LABELS = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: 'Alt-Text',
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: 'Leichte Sprache',
};

const AltTextIcon = memo(() => <Icon category="accessibility" name="alt-text" size={16} />);
AltTextIcon.displayName = 'AltTextIcon';

const LeichteSpracheIcon = memo(() => (
  <Icon category="accessibility" name="leichte-sprache" size={16} />
));
LeichteSpracheIcon.displayName = 'LeichteSpracheIcon';

const ACCESSIBILITY_TYPE_ICONS: Record<string, () => React.ReactNode> = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: () => <AltTextIcon />,
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: () => <LeichteSpracheIcon />,
};

const API_ENDPOINTS = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: '/claude_alttext',
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: '/leichte_sprache',
};

const BarrierefreiheitTab: React.FC<BarrierefreiheitTabProps> = memo(() => {
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

  useOptimizedAuth();

  const setup = useGeneratorSetup({
    instructionType: 'leichte_sprache',
    componentName: 'accessibility-leichte-sprache',
  });

  const usePrivacyMode = useGeneratorSelectionStore((state) => state.usePrivacyMode);
  const componentName = `accessibility-${selectedType}`;

  const helpContent = useMemo<HelpContent>(() => {
    if (selectedType === ACCESSIBILITY_TYPES.ALT_TEXT) {
      return {
        content: 'Erstelle barrierefreie Alt-Texte für Bilder nach den Richtlinien des DBSV.',
        tips: [
          'Lade ein Bild hoch (JPG, PNG, WebP)',
          'Füge optional eine Beschreibung hinzu',
          'Alt-Texte sollten prägnant aber beschreibend sein',
        ],
      };
    }
    return {
      content: 'Übersetze Texte in Leichte Sprache für bessere Verständlichkeit.',
      tips: [
        'Füge den zu übersetzenden Text ein',
        'Die Übersetzung erfolgt in kurzen, klaren Sätzen',
        'Schwierige Wörter werden erklärt oder ersetzt',
      ],
    };
  }, [selectedType]);

  const form = useBaseForm({
    defaultValues: {},
    generatorType: `accessibility-${selectedType}`,
    componentName: componentName,
    endpoint: API_ENDPOINTS[selectedType],
    disableKnowledgeSystem: true,
    features: [],
    tabIndexKey: selectedType === ACCESSIBILITY_TYPES.ALT_TEXT ? 'ALT_TEXT' : 'LEICHTE_SPRACHE',
    helpContent: helpContent,
  } as Record<string, unknown>);

  const {
    generateAltTextForImage,
    loading: altTextLoading,
    success: altTextSuccess,
    error: altTextError,
  } = useAltTextGeneration();

  const { crawledUrls, isCrawling, detectAndCrawlUrls } = useUrlCrawler();
  const isCrawlingRef = useRef(isCrawling);
  isCrawlingRef.current = isCrawling;

  const allAttachments = useMemo(
    () => [...(form.generator?.attachedFiles || []), ...crawledUrls],
    [form.generator?.attachedFiles, crawledUrls]
  );

  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: ['originalText'] as const,
  });

  const handleUrlsDetected = useCallback(
    async (urls: string[]) => {
      if (
        selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE &&
        !isCrawlingRef.current &&
        urls.length > 0
      ) {
        await detectAndCrawlUrls(urls.join(' '), usePrivacyMode);
      }
    },
    [detectAndCrawlUrls, selectedType, usePrivacyMode]
  );

  const handleSubmit = useCallback(async () => {
    if (!formRef.current?.getFormData || !formRef.current?.isValid()) return;

    const formData = formRef.current.getFormData();
    if (!formData) return;

    try {
      if (selectedType === ACCESSIBILITY_TYPES.ALT_TEXT) {
        const hasUploadedImage = formData.hasUploadedImage as boolean;
        const uploadedImage = formData.uploadedImage as File | null;
        const imageDescription = formData.imageDescription as string | null;

        if (!hasUploadedImage || !uploadedImage) return;

        const imageBase64 = await fileToBase64(uploadedImage);
        const imageContext = `Bild: ${uploadedImage.name}`;

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
          targetLanguage: formData.targetLanguage,
        });

        const response = await form.generator!.submitForm(
          formDataToSubmit as unknown as Record<string, unknown>
        );
        if (response) {
          const responseContent =
            typeof response === 'string' ? response : (response as { content?: string }).content;
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
  }, [selectedType, generateAltTextForImage, form, builder]);

  const renderForm = () => {
    const tabIndexValue = form.generator?.tabIndex as
      | { [key: string]: number | undefined }
      | undefined;
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

  const accessibilityTypeOptions = useMemo(
    () =>
      Object.entries(ACCESSIBILITY_TYPE_LABELS).map(([value, label]) => ({
        value,
        label,
        icon: ACCESSIBILITY_TYPE_ICONS[value],
      })),
    []
  );

  const handleTypeChange = useCallback((value: string | number | (string | number)[] | null) => {
    if (typeof value === 'string') {
      setSelectedType(value);
    }
  }, []);

  const renderTypeSelector = useCallback(
    () => (
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
    ),
    [accessibilityTypeOptions, selectedType, handleTypeChange]
  );

  const baseFormProps = form.generator?.baseFormProps || {};

  return (
    <BaseForm
      {...baseFormProps}
      generatedContent={(generatedContent || baseFormProps.generatedContent) as GeneratedContent}
      onSubmit={handleSubmit}
      firstExtrasChildren={renderTypeSelector()}
      useFeatureIcons={false}
      loading={(baseFormProps.loading as boolean) || altTextLoading}
      success={(baseFormProps.success as boolean) || altTextSuccess}
      error={(baseFormProps.error as string) || altTextError}
      platformOptions={(baseFormProps.platformOptions || undefined) as any}
      componentName={componentName}
    >
      {renderForm()}
    </BaseForm>
  );
});

BarrierefreiheitTab.displayName = 'BarrierefreiheitTab';

export default BarrierefreiheitTab;

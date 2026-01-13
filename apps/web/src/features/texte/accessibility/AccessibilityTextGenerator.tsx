import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import BaseForm from '../../../components/common/BaseForm';
import ErrorBoundary from '../../../components/ErrorBoundary';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { fileToBase64 } from '../../../utils/fileAttachmentUtils';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import useAltTextGeneration from '../../../components/hooks/useAltTextGeneration';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import type { HelpContent } from '../../../types/baseform';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';

// Import components
import AltTextForm from './components/AltTextForm';
import LeichteSpracheForm from './components/LeichteSpracheForm';
import { convertCanvaDesignToBase64 } from '../../../utils/canvaImageHelper';
import PlatformSelector from '../../../components/common/PlatformSelector';
import Icon from '../../../components/common/Icon';

// Form ref interface for child forms
interface FormRef {
  getFormData: () => Record<string, unknown> | null;
  isValid: () => boolean;
  setCanvaDesign?: (designData: unknown) => void;
}

interface AccessibilityTextGeneratorProps {
  showHeaderFooter?: boolean;
}

// Define types and labels directly in this file
export const ACCESSIBILITY_TYPES = {
  ALT_TEXT: 'alt-text',
  LEICHTE_SPRACHE: 'leichte-sprache'
};

export const ACCESSIBILITY_TYPE_LABELS = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: 'Alt-Text',
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: 'Leichte Sprache'
};

export const ACCESSIBILITY_TYPE_TITLES = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: 'Welches Bild willst du heute beschreiben?',
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: 'Welchen Text willst du heute vereinfachen?'
};

const ACCESSIBILITY_TYPE_ICONS = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: () => <Icon category="accessibility" name="alt-text" size={16} />,
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: () => <Icon category="accessibility" name="leichte-sprache" size={16} />
};

const ACCESSIBILITY_TYPE_DESCRIPTIONS = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: 'Barrierefreie Bildbeschreibungen für Screenreader',
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: 'Vereinfachte Texte für bessere Verständlichkeit'
};

const API_ENDPOINTS = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: '/claude_alttext', // Update this to correct endpoint
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: '/leichte_sprache'
};

const AccessibilityTextGenerator: React.FC<AccessibilityTextGeneratorProps> = ({ showHeaderFooter = true }) => {
  const [searchParams] = useSearchParams();

  // Determine initial type from query params or default to alt-text
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

  // Consolidated setup using new hook (only for Leichte Sprache)
  const setup = useGeneratorSetup({
    instructionType: 'leichte_sprache',
    componentName: 'accessibility-leichte-sprache'
  });

  // Keep usePrivacyMode for backwards compatibility with existing code
  const usePrivacyMode = useGeneratorSelectionStore(state => state.usePrivacyMode);

  // Dynamic component name based on selected type
  const componentName = `accessibility-${selectedType}`;

  // Dynamic help content based on selected type
  const helpContent = useMemo<HelpContent>(() => {
    if (selectedType === ACCESSIBILITY_TYPES.ALT_TEXT) {
      return {
        content: "Erstelle barrierefreie Alt-Texte für Bilder nach den Richtlinien des Deutschen Blinden- und Sehbehindertenverbands (DBSV). Alt-Texte sind essentiell für Screenreader und die Zugänglichkeit von Webinhalten.",
        tips: [
          "Lade ein Bild hoch (JPG, PNG, WebP)",
          "Füge optional eine Beschreibung hinzu für besseren Kontext",
          "Der generierte Alt-Text folgt DBSV-Richtlinien für Barrierefreiheit",
          "Alt-Texte sollten prägnant aber beschreibend sein"
        ]
      };
    } else {
      return {
        content: "Dieser Grünerator übersetzt Texte in Leichte Sprache. Leichte Sprache ist eine vereinfachte Form des Deutschen für Menschen mit kognitiven Beeinträchtigungen, Lernschwierigkeiten oder begrenzten Sprachkenntnissen.",
        tips: [
          "Füge den zu übersetzenden Text in das Textfeld ein",
          "Der Text wird automatisch nach den Regeln der Leichten Sprache übersetzt",
          "Die Regeln folgen dem Netzwerk Leichte Sprache e.V. (Neuauflage 2022)",
          "Die Übersetzung erfolgt in kurzen, klaren Sätzen",
          "Schwierige Wörter werden erklärt oder ersetzt"
        ]
      };
    }
  }, [selectedType]);

  // Create baseForm based on selected type
  const form = useBaseForm({
    defaultValues: {},
    generatorType: `accessibility-${selectedType}`,
    componentName: componentName,
    endpoint: API_ENDPOINTS[selectedType],
    disableKnowledgeSystem: true,
    features: [],
    tabIndexKey: (selectedType === ACCESSIBILITY_TYPES.ALT_TEXT ? 'ALT_TEXT' : 'LEICHTE_SPRACHE'),
    helpContent: helpContent
  });

  // Hooks for different functionality
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

  // URL crawler hook for Leichte Sprache
  const {
    crawledUrls,
    isCrawling,
    detectAndCrawlUrls,
    retryUrl
  } = useUrlCrawler();

  // Combine file attachments with crawled URLs for Leichte Sprache
  const allAttachments = useMemo(() => [
    ...(form.generator?.attachedFiles || []),
    ...crawledUrls
  ], [form.generator?.attachedFiles, crawledUrls]);

  // Form data builder for Leichte Sprache submission
  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: ['originalText'] as const
  });

  // Handle URL detection and crawling for Leichte Sprache
  const handleUrlsDetected = useCallback(async (urls: string[]) => {
    if (selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE && !isCrawling && urls.length > 0) {
      await detectAndCrawlUrls(urls.join(' '), usePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, selectedType, usePrivacyMode]);

  // Handle URL retry for Leichte Sprache
  const handleRetryUrl = useCallback(async (url: string) => {
    if (selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE) {
      await retryUrl(url, usePrivacyMode);
    }
  }, [retryUrl, selectedType, usePrivacyMode]);

  // Combine loading states from both API submission hooks
  const combinedLoading = altTextLoading || leichteSpracheLoading;
  const combinedSuccess = altTextSuccess || leichteSpracheSuccess;
  const combinedError = altTextError || leichteSpracheError;

  // Handle pre-selected Canva template from URL parameters (Alt-Text only)
  useEffect(() => {
    if (selectedType !== ACCESSIBILITY_TYPES.ALT_TEXT) return;

    const canvaTemplateParam = searchParams.get('canvaTemplate');
    if (canvaTemplateParam) {
      try {
        const sessionData = sessionStorage.getItem(canvaTemplateParam);
        if (sessionData) {
          const parsedData = JSON.parse(sessionData);

          if (parsedData.source === 'canvaTemplate' && parsedData.template) {
            console.log('[AccessibilityTextGenerator] Pre-selecting Canva template from URL:', parsedData.template.title);

            // Set the Canva design in the form
            if (formRef.current?.setCanvaDesign) {
              formRef.current.setCanvaDesign(parsedData);
            }

            // Clean up sessionStorage
            sessionStorage.removeItem(canvaTemplateParam);
          }
        }
      } catch (error) {
        console.error('[AccessibilityTextGenerator] Error processing Canva template parameter:', error);
      }
    }
  }, [searchParams, selectedType]);

  const handleSubmit = useCallback(async () => {
    if (!formRef.current?.getFormData || !formRef.current?.isValid()) return;

    const formData = formRef.current.getFormData();
    if (!formData) return;

    try {
      if (selectedType === ACCESSIBILITY_TYPES.ALT_TEXT) {
        // Alt-Text generation logic
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

        if (!hasUploadedImage && !hasCanvaImage) {
          console.error('[AccessibilityTextGenerator] No image selected');
          return;
        }

        console.log('[AccessibilityTextGenerator] Starting alt text generation');

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
          throw new Error('Invalid image source or missing image data');
        }

        // Combine user description with image context
        let fullDescription = imageDescription || '';
        if (imageContext) {
          fullDescription = fullDescription
            ? `${imageContext}. ${fullDescription}`
            : imageContext;
        }

        // Generate alt text
        const response = await generateAltTextForImage(
          imageBase64,
          (fullDescription ? fullDescription : null) as null | undefined
        );

        const altText = response?.altText || response || '';

        setGeneratedContent(altText);
        form.generator?.handleGeneratedContentChange(altText);

        console.log('[AccessibilityTextGenerator] Alt text generated successfully');

      } else if (selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE) {
        // Leichte Sprache generation logic using new hook
        const formDataToSubmit = builder.buildSubmissionData({
          originalText: formData.originalText,
          targetLanguage: formData.targetLanguage
        });

        const response = await submitLeichteSprache(formDataToSubmit);
        if (response) {
          const content = typeof response === 'string' ? response : response.content;
          const metadata = typeof response === 'object' ? response.metadata : {};

          if (content) {
            setGeneratedContent(content);
            form.generator?.handleGeneratedContentChange(content);
          }
        }
      }
    } catch (error) {
      console.error('[AccessibilityTextGenerator] Error submitting form:', error);
      form.handleSubmitError?.(error);
    }
  }, [
    selectedType,
    generateAltTextForImage,
    submitLeichteSprache,
    componentName,
    form,
    builder
  ]);

  const handleGeneratedContentChange = useCallback((content: string) => {
    setGeneratedContent(content);
    form.generator?.handleGeneratedContentChange(content);
  }, [form.generator]);

  const renderForm = () => {
    switch (selectedType) {
      case ACCESSIBILITY_TYPES.ALT_TEXT:
        return <AltTextForm ref={formRef} tabIndex={form.generator?.tabIndex} />;
      case ACCESSIBILITY_TYPES.LEICHTE_SPRACHE:
        return (
          <LeichteSpracheForm
            ref={formRef}
            tabIndex={form.generator?.tabIndex}
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

  const renderTypeSelector = () => (
    <PlatformSelector
      name="accessibilityType"
      options={accessibilityTypeOptions}
      value={selectedType}
      onChange={setSelectedType}
      label="Art der Barrierefreiheit"
      placeholder="Barrierefreiheit-Typ auswählen..."
      isMulti={false}
      control={undefined}
      enableIcons={true}
      enableSubtitles={false}
      isSearchable={false}
      required={true}
    />
  );

  // Get stored generated text
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          {...form.generator?.baseFormProps}
          title={<span className="gradient-title">{ACCESSIBILITY_TYPE_TITLES[selectedType]}</span>}
          generatedContent={storeGeneratedText || generatedContent}
          onSubmit={handleSubmit}
          firstExtrasChildren={renderTypeSelector()}
          useFeatureIcons={false}
          loading={combinedLoading}
          success={combinedSuccess}
          error={combinedError}
        >
          {renderForm()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default withAuthRequired(AccessibilityTextGenerator, {
  title: 'Barrierefreiheit Grünerator',
  message: 'Anmeldung erforderlich für den Barrierefreiheit Generator'
});

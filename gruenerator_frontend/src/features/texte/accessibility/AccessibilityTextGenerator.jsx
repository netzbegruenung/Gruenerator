import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useSearchParams } from 'react-router-dom';
import BaseForm from '../../../components/common/BaseForm';
import ErrorBoundary from '../../../components/ErrorBoundary';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { fileToBase64 } from '../../../utils/fileAttachmentUtils';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import useAltTextGeneration from '../../../components/hooks/useAltTextGeneration';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';

// Import components
import AltTextForm from './components/AltTextForm';
import LeichteSpracheForm from './components/LeichteSpracheForm';
import { convertCanvaDesignToBase64 } from './utils/canvaImageHelper';
import FormSelect from '../../../components/common/Form/Input/FormSelect';

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
  [ACCESSIBILITY_TYPES.ALT_TEXT]: 'Barrierefreiheit - Alt-Text',
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: 'Barrierefreiheit - Leichte Sprache'
};

// Import styles
import './styles/canva-selector.css';

const API_ENDPOINTS = {
  [ACCESSIBILITY_TYPES.ALT_TEXT]: '/claude_alttext', // Update this to correct endpoint
  [ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]: '/leichte_sprache'
};

const AccessibilityTextGenerator = ({ showHeaderFooter = true }) => {
  const [selectedType, setSelectedType] = useState(ACCESSIBILITY_TYPES.ALT_TEXT);
  const [generatedContent, setGeneratedContent] = useState('');
  const formRef = useRef();
  const [searchParams] = useSearchParams();

  const { setGeneratedText } = useGeneratedTextStore();

  useOptimizedAuth();

  // Dynamic component name based on selected type
  const componentName = `accessibility-${selectedType}`;

  // Dynamic help content based on selected type
  const helpContent = useMemo(() => {
    if (selectedType === ACCESSIBILITY_TYPES.ALT_TEXT) {
      return {
        content: "Erstelle barrierefreie Alt-Texte für Bilder nach den Richtlinien des Deutschen Blinden- und Sehbehindertenverbands (DBSV). Alt-Texte sind essentiell für Screenreader und die Zugänglichkeit von Webinhalten.",
        title: ACCESSIBILITY_TYPE_TITLES[selectedType],
        tips: [
          "Wähle zwischen Datei-Upload oder Canva-Design",
          "Lade ein Bild hoch (JPG, PNG, WebP) oder wähle aus deinen Canva-Designs",
          "Füge optional eine Beschreibung hinzu für besseren Kontext",
          "Der generierte Alt-Text folgt DBSV-Richtlinien für Barrierefreiheit",
          "Alt-Texte sollten prägnant aber beschreibend sein"
        ]
      };
    } else {
      return {
        content: "Dieser Grünerator übersetzt Texte in Leichte Sprache. Leichte Sprache ist eine vereinfachte Form des Deutschen für Menschen mit kognitiven Beeinträchtigungen, Lernschwierigkeiten oder begrenzten Sprachkenntnissen.",
        title: ACCESSIBILITY_TYPE_TITLES[selectedType],
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
    defaultValues: {
      useWebSearchTool: false,
      usePrivacyMode: false
    },
    generatorType: `accessibility-${selectedType}`,
    componentName: componentName,
    endpoint: API_ENDPOINTS[selectedType],
    disableKnowledgeSystem: true, // Disable knowledge system - accessibility generators don't need custom instructions/Anweisungen
    features: selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE ? ['webSearch', 'privacyMode'] : ['privacyMode'],
    tabIndexKey: selectedType === ACCESSIBILITY_TYPES.ALT_TEXT ? 'ALT_TEXT' : 'LEICHTE_SPRACHE',
    helpContent: helpContent
  });

  // Hooks for different functionality
  const {
    generateAltTextForImage
  } = useAltTextGeneration();

  const {
    submitForm: submitLeichteSprache
  } = useApiSubmit(API_ENDPOINTS[ACCESSIBILITY_TYPES.LEICHTE_SPRACHE]);

  // URL crawler hook for Leichte Sprache
  const {
    crawledUrls,
    isCrawling,
    detectAndCrawlUrls,
    retryUrl
  } = useUrlCrawler();

  // Handle URL detection and crawling for Leichte Sprache
  const handleUrlsDetected = useCallback(async (urls) => {
    if (selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE && !isCrawling && urls.length > 0) {
      await detectAndCrawlUrls(urls.join(' '), form.generator.toggles.privacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, form.generator.toggles.privacyMode, selectedType]);

  // Handle URL retry for Leichte Sprache
  const handleRetryUrl = useCallback(async (url) => {
    if (selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE) {
      await retryUrl(url, form.generator.toggles.privacyMode);
    }
  }, [retryUrl, form.generator.toggles.privacyMode, selectedType]);

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
        const { hasUploadedImage, hasCanvaImage, uploadedImage, selectedCanvaDesign, imageSource, imageDescription } = formData;

        if (!hasUploadedImage && !hasCanvaImage) {
          console.error('[AccessibilityTextGenerator] No image selected');
          return;
        }

        console.log('[AccessibilityTextGenerator] Starting alt text generation');

        let imageBase64;
        let imageContext = '';

        if (imageSource === 'upload' && hasUploadedImage) {
          imageBase64 = await fileToBase64(uploadedImage);
          imageContext = `Bild: ${uploadedImage.name}`;
        } else if (imageSource === 'canva' && hasCanvaImage) {
          const conversionResult = await convertCanvaDesignToBase64(selectedCanvaDesign.design);
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
          fullDescription || null
        );

        const altText = response?.altText || response || '';

        setGeneratedContent(altText);
        form.generator.handleGeneratedContentChange(altText);

        console.log('[AccessibilityTextGenerator] Alt text generated successfully');

      } else if (selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE) {
        // Leichte Sprache generation logic
        const allAttachments = [
          ...form.generator.attachedFiles,
          ...crawledUrls
        ];

        const formDataToSubmit = {
          originalText: formData.originalText,
          targetLanguage: formData.targetLanguage,
          useWebSearchTool: form.generator.toggles.webSearch,
          usePrivacyMode: form.generator.toggles.privacyMode,
          attachments: allAttachments
        };

        const response = await submitLeichteSprache(formDataToSubmit);
        if (response) {
          const content = typeof response === 'string' ? response : response.content;
          const metadata = typeof response === 'object' ? response.metadata : {};

          if (content) {
            setGeneratedContent(content);
            form.generator.handleGeneratedContentChange(content);
          }
        }
      }
    } catch (error) {
      console.error('[AccessibilityTextGenerator] Error submitting form:', error);
      form.handleSubmitError(error);
    }
  }, [
    selectedType,
    generateAltTextForImage,
    submitLeichteSprache,
    componentName,
    form,
    crawledUrls
  ]);

  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedContent(content);
    form.generator.handleGeneratedContentChange(content);
  }, [form.generator]);

  // Feature toggles - only show for Leichte Sprache or when both support them
  const showWebSearch = selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE;
  const showFileAttachment = selectedType === ACCESSIBILITY_TYPES.LEICHTE_SPRACHE;

  const renderForm = () => {
    switch (selectedType) {
      case ACCESSIBILITY_TYPES.ALT_TEXT:
        return <AltTextForm ref={formRef} tabIndex={form.generator.tabIndex} />;
      case ACCESSIBILITY_TYPES.LEICHTE_SPRACHE:
        return (
          <LeichteSpracheForm
            ref={formRef}
            tabIndex={form.generator.tabIndex}
            onUrlsDetected={handleUrlsDetected}
          />
        );
      default:
        return null;
    }
  };

  const renderTypeSelector = () => {
    const accessibilityTypeOptions = Object.entries(ACCESSIBILITY_TYPE_LABELS).map(([value, label]) => ({
      value,
      label
    }));

    return (
      <div style={{ marginBottom: 'var(--spacing-large)' }}>
        <FormSelect
          name="accessibilityType"
          label="Art der Barrierefreiheit"
          options={accessibilityTypeOptions}
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          required
        />
      </div>
    );
  };

  // Get stored generated text
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          {...form.generator.baseFormProps}
          title={ACCESSIBILITY_TYPE_TITLES[selectedType]}
          generatedContent={storeGeneratedText || generatedContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          onSubmit={handleSubmit}
          firstExtrasChildren={renderTypeSelector()}
          submitButtonText={selectedType === ACCESSIBILITY_TYPES.ALT_TEXT ? "Alt-Text generieren" : "In Leichte Sprache übersetzen"}
          isSubmitDisabled={!formRef.current?.isValid?.()}
          // Override feature toggles based on generator type
          useWebSearchFeatureToggle={showWebSearch}
          useFeatureIcons={showWebSearch || true}
          onAttachmentClick={showFileAttachment ? form.generator.handleAttachmentClick : null}
          onRemoveFile={showFileAttachment ? form.generator.handleRemoveFile : null}
          attachedFiles={showFileAttachment ? form.generator.attachedFiles : []}
        >
          {renderForm()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

AccessibilityTextGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default withAuthRequired(AccessibilityTextGenerator, {
  title: 'Barrierefreiheit Generator',
  message: 'Anmeldung erforderlich für den Barrierefreiheit Generator'
});

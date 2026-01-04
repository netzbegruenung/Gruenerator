import { JSX, useCallback, useMemo } from 'react';
import { Controller, type FieldValues } from 'react-hook-form';
import BaseForm from '../../common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import useApiSubmit from '../../hooks/useApiSubmit';
import { useSharedContent } from '../../hooks/useSharedContent';
import ErrorBoundary from '../../ErrorBoundary';
import { FormInput, FormTextarea } from '../../common/Form/Input';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';
import { useUserInstructions } from '../../../hooks/useUserInstructions';
import PlatformSelector from '../../common/PlatformSelector';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import useBaseForm from '../../common/Form/hooks/useBaseForm';
import type { HelpContent } from '../../../types/baseform';

interface GrueneJugendGeneratorProps {
  showHeaderFooter?: boolean;
}

const GrueneJugendGenerator = ({ showHeaderFooter = true }: GrueneJugendGeneratorProps): JSX.Element => {
  const componentName = 'gruene-jugend';
  const { initialContent } = useSharedContent();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  // Get feature state and selection from store
  // Use proper selectors for reactive subscriptions
  const getFeatureState = useGeneratorSelectionStore(state => state.getFeatureState);
  const selectedDocumentIds = useGeneratorSelectionStore(state => state.selectedDocumentIds);
  const selectedTextIds = useGeneratorSelectionStore(state => state.selectedTextIds);
  const isInstructionsActive = useGeneratorSelectionStore(state => state.isInstructionsActive);
  const usePrivacyMode = useGeneratorSelectionStore(state => state.usePrivacyMode);

  // Fetch user's custom instructions
  const instructionType = 'gruenejugend';
  const customPrompt = useUserInstructions(instructionType, isInstructionsActive);

  const platformOptions = useMemo(() => [
    { id: 'instagram', label: 'Instagram' },
    { id: 'twitter', label: 'Twitter/X' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'messenger', label: 'Messenger' },
    { id: 'reelScript', label: 'Skript für Reels & Tiktoks' },
    { id: 'actionIdeas', label: 'Aktionsideen' }
  ], []);

  const defaultPlatforms = useMemo(() => {
    // Default for sharepic content
    if (initialContent?.isFromSharepic) {
      return ['instagram'];
    }

    return []; // No default selection
  }, [initialContent]);

  // Initialize useBaseForm with knowledge system enabled
  const helpContent: HelpContent = {
    content: "Der Grünerator für die Grüne Jugend erstellt jugendgerechte Social-Media-Inhalte für verschiedene Plattformen.",
    tips: [
      "Wähle die Plattformen aus, für die du Content erstellen möchtest",
      "Gib ein klares Thema und relevante Details an",
      "Der Grünerator passt Tonalität und Format automatisch an die Zielgruppe an",
      "Nutze die Websuche für aktuelle Informationen"
    ]
  };

  // Initialize useBaseForm with proper type casting
  // useBaseForm is a JS file with flexible parameter typing
  const form = useBaseForm({
    // @ts-ignore - JS function expects flexible typing for optional generator-specific params
    defaultValues: {
      thema: initialContent?.thema || '',
      details: initialContent?.details || '',
      platforms: defaultPlatforms,
      useWebSearchTool: false,
      usePrivacyMode: false,
      useProMode: false
    },
    // @ts-ignore - JS function expects flexible typing for optional generator-specific params
    generatorType: 'gruene-jugend',
    // @ts-ignore - JS function expects flexible typing for optional generator-specific params
    componentName: componentName,
    // @ts-ignore - JS function expects flexible typing for optional generator-specific params
    endpoint: '/claude_gruene_jugend',
    // @ts-ignore - JS function expects flexible typing for optional generator-specific params
    instructionType: 'gruenejugend',
    // @ts-ignore - JS function expects flexible typing for optional generator-specific params
    features: ['webSearch', 'privacyMode'],
    // @ts-ignore - JS function expects flexible typing for optional generator-specific params
    tabIndexKey: 'GRUENE_JUGEND',
    // @ts-ignore - JS function expects flexible typing for optional generator-specific params
    defaultMode: 'privacy',
    // @ts-ignore - JS function expects flexible typing for optional generator-specific params
    helpContent
  }) as {
    control: import('react-hook-form').Control<Record<string, unknown>>;
    handleSubmit: (cb: (data: Record<string, unknown>) => Promise<void>) => () => Promise<void>;
    reset: () => void;
    setValue: (name: string, value: unknown) => void;
    errors: Record<string, unknown>;
    getValues: (name?: string) => unknown;
    generator?: {
      tabIndex?: Record<string, number>;
      baseFormTabIndex?: Record<string, number>;
      attachedFiles?: unknown[];
      baseFormProps?: Record<string, unknown>;
    };
    [key: string]: unknown;
  };

  const { control, handleSubmit, setValue } = form;

  // Use store for content management (no local state needed)
  const socialMediaContent = useGeneratedTextStore(state => state.getGeneratedText(componentName)) || '';
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_gruene_jugend');

  // URL crawler hook for automatic link processing
  const {
    crawledUrls,
    crawlingUrls,
    crawlErrors,
    detectAndCrawlUrls,
    removeCrawledUrl,
    retryUrl,
    isCrawling
  } = useUrlCrawler();

  const onSubmitRHF = useCallback(async (rhfData: FieldValues) => {
    setStoreIsLoading(true);
    try {
      // Get current feature toggle state from store
      const features = getFeatureState();

      // Use platforms array directly from multi-select
      const selectedPlatforms = (rhfData.platforms as string[]) || [];

      // Combine file attachments with crawled URLs
      const allAttachments = [
        ...(form.generator?.attachedFiles || []),
        ...crawledUrls
      ];

      // Extract search query from form data
      const extractQueryFromFormData = (data: Record<string, unknown>) => {
        const queryParts: string[] = [];
        if (data.thema) queryParts.push(String(data.thema));
        if (data.details) queryParts.push(String(data.details));
        return queryParts.filter(part => part && part.trim()).join(' ');
      };

      const searchQuery = extractQueryFromFormData(rhfData);

      const formDataToSubmit = {
        thema: String(rhfData.thema || ''),
        details: String(rhfData.details || ''),
        platforms: selectedPlatforms,
        ...features, // Add feature toggles from store: useWebSearchTool, usePrivacyMode, useBedrock
        attachments: allAttachments,
        // Add custom prompt from user instructions (simplified)
        customPrompt,
        selectedDocumentIds: selectedDocumentIds || [],
        selectedTextIds: selectedTextIds || [],
        searchQuery: searchQuery || ''
      };

      console.log('[GrueneJugendGenerator] Sende Formular mit Daten:', formDataToSubmit);
      const content = await submitForm(formDataToSubmit);
      console.log('[GrueneJugendGenerator] API Antwort erhalten:', content);
      if (content) {
        const contentString = typeof content === 'string' ? content : String(content);
        console.log('[GrueneJugendGenerator] Setze generierten Content:', contentString.substring(0, 100) + '...');
        setGeneratedText(componentName, contentString);
        setTimeout(resetSuccess, 3000);
      }
    } catch (err) {
      console.error('[GrueneJugendGenerator] Fehler beim Formular-Submit:', err);
    } finally {
      setStoreIsLoading(false);
    }
  }, [submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, customPrompt, form.generator?.attachedFiles, crawledUrls, selectedDocumentIds, selectedTextIds, getFeatureState]);

  const handleGeneratedContentChange = useCallback((content: string) => {
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  // Handle URL detection and crawling
  const handleUrlsDetected = useCallback(async (urls: string[]) => {
    // Only crawl if not already crawling and URLs are detected
    if (!isCrawling && urls.length > 0) {
      await detectAndCrawlUrls(urls.join(' '), usePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, usePrivacyMode]);

  const renderPlatformSection = () => {
    if (!form.generator?.baseFormTabIndex) {
      return null;
    }
    return (
      <PlatformSelector
        name="platforms"
        control={control}
        platformOptions={platformOptions}
        label="Formate"
        placeholder="Formate auswählen..."
        required={true}
        tabIndex={(form.generator.baseFormTabIndex as Record<string, number>)?.platformSelectorTabIndex}
      />
    );
  };

  const renderFormInputs = () => {
    if (!form.generator?.tabIndex) {
      return null;
    }
    const tabIndex = form.generator.tabIndex as Record<string, number>;
    return (
      <>
        <FormInput
          name="thema"
          control={control}
          label={FORM_LABELS.THEME}
          placeholder={FORM_PLACEHOLDERS.THEME}
          rules={{ required: 'Thema ist ein Pflichtfeld' }}
          tabIndex={tabIndex.thema}
        />

        <FormTextarea
          name="details"
          control={control}
          label={FORM_LABELS.DETAILS}
          placeholder={FORM_PLACEHOLDERS.DETAILS}
          rules={{ required: 'Details sind ein Pflichtfeld' }}
          minRows={3}
          maxRows={10}
          tabIndex={tabIndex.details}
          enableUrlDetection={true}
          onUrlsDetected={handleUrlsDetected}
        />
      </>
    );
  };

  // form.generator is always defined since we pass generatorType to useBaseForm
  const baseFormProps = (form.generator?.baseFormProps || {}) as Record<string, unknown>;

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          {...baseFormProps}
          title={<span className="gradient-title">Grüne Jugend</span>}
          onSubmit={() => handleSubmit(onSubmitRHF)()}
          loading={loading}
          success={success}
          error={error}
          generatedContent={socialMediaContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          firstExtrasChildren={renderPlatformSection()}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default GrueneJugendGenerator;

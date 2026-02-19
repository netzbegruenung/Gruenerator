import { type JSX, useCallback, useMemo, useRef } from 'react';
import { Controller, type FieldValues } from 'react-hook-form';

import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';
import BaseForm from '../../common/BaseForm';
import useBaseForm from '../../common/Form/hooks/useBaseForm';
import { FormInput, FormTextarea } from '../../common/Form/Input';
import PlatformSelector from '../../common/PlatformSelector';
import ErrorBoundary from '../../ErrorBoundary';
import useApiSubmit from '../../hooks/useApiSubmit';
import { useSharedContent } from '../../hooks/useSharedContent';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';

import type { HelpContent } from '../../../types/baseform';

const GrueneJugendGenerator = (): JSX.Element => {
  const componentName = 'gruene-jugend';
  const { initialContent } = useSharedContent();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  // Consolidated setup using new hook
  const setup = useGeneratorSetup({
    instructionType: 'gruenejugend',
    componentName: 'gruene-jugend',
  });

  // Keep usePrivacyMode for backwards compatibility with existing code
  const usePrivacyMode = useGeneratorSelectionStore((state) => state.usePrivacyMode);

  const platformOptions = useMemo(
    () => [
      { id: 'instagram', label: 'Instagram' },
      { id: 'twitter', label: 'Twitter/X' },
      { id: 'tiktok', label: 'TikTok' },
      { id: 'messenger', label: 'Messenger' },
      { id: 'reelScript', label: 'Skript für Reels & Tiktoks' },
      { id: 'actionIdeas', label: 'Aktionsideen' },
    ],
    []
  );

  const defaultPlatforms = useMemo(() => {
    // Default for sharepic content
    if (initialContent?.isFromSharepic) {
      return ['instagram'];
    }

    return []; // No default selection
  }, [initialContent]);

  // Initialize useBaseForm with knowledge system enabled
  const helpContent: HelpContent = {
    content:
      'Der Grünerator für die Grüne Jugend erstellt jugendgerechte Social-Media-Inhalte für verschiedene Plattformen.',
    tips: [
      'Wähle die Plattformen aus, für die du Content erstellen möchtest',
      'Gib ein klares Thema und relevante Details an',
      'Der Grünerator passt Tonalität und Format automatisch an die Zielgruppe an',
      'Nutze die Websuche für aktuelle Informationen',
    ],
  };

  // Initialize useBaseForm with proper type casting
  const form = useBaseForm({
    defaultValues: {
      thema: initialContent?.thema || '',
      details: initialContent?.details || '',
      platforms: defaultPlatforms,
      useWebSearchTool: false,
      usePrivacyMode: false,
      useProMode: false,
    },
    generatorType: 'gruene-jugend',
    componentName: componentName,
    endpoint: '/claude_gruene_jugend',
    instructionType: 'gruenejugend',
    features: ['webSearch', 'privacyMode'],
    tabIndexKey: 'GRUENE_JUGEND',
    defaultMode: 'privacy',
    helpContent,
  } as unknown as Parameters<typeof useBaseForm>[0]);

  const { control, handleSubmit, setValue } = form;

  // Use store for content management (no local state needed)
  const socialMediaContent =
    useGeneratedTextStore((state) => state.getGeneratedText(componentName)) || '';
  const { submitForm, loading, success, resetSuccess, error } =
    useApiSubmit('/claude_gruene_jugend');

  // Combine file attachments with crawled URLs
  const {
    crawledUrls,
    crawlingUrls,
    crawlErrors,
    detectAndCrawlUrls,
    removeCrawledUrl,
    retryUrl,
    isCrawling,
  } = useUrlCrawler();

  // Form data builder with all attachments
  const allAttachments = useMemo(
    () => [...(form.generator?.attachedFiles || []), ...crawledUrls],
    [form.generator?.attachedFiles, crawledUrls]
  );

  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: ['thema', 'details'] as const,
  });

  const onSubmitRHF = useCallback(
    async (rhfData: Record<string, unknown>) => {
      setStoreIsLoading(true);
      try {
        // Use platforms array directly from multi-select
        const selectedPlatforms = (rhfData.platforms as string[]) || [];

        // Build submission data using new hook
        const formDataToSubmit = builder.buildSubmissionData({
          thema: String(rhfData.thema || ''),
          details: String(rhfData.details || ''),
          platforms: selectedPlatforms,
        } as Record<string, unknown>);

        console.log('[GrueneJugendGenerator] Sende Formular mit Daten:', formDataToSubmit);
        const content = await submitForm(formDataToSubmit);
        console.log('[GrueneJugendGenerator] API Antwort erhalten:', content);
        if (content) {
          const contentString = typeof content === 'string' ? content : String(content);
          console.log(
            '[GrueneJugendGenerator] Setze generierten Content:',
            contentString.substring(0, 100) + '...'
          );
          setGeneratedText(componentName, contentString);
          setTimeout(resetSuccess, 3000);
        }
      } catch (err) {
        console.error('[GrueneJugendGenerator] Fehler beim Formular-Submit:', err);
      } finally {
        setStoreIsLoading(false);
      }
    },
    [submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, componentName, builder]
  );

  const handleGeneratedContentChange = useCallback(
    (content: string) => {
      setGeneratedText(componentName, content);
    },
    [setGeneratedText, componentName]
  );

  const isCrawlingRef = useRef(isCrawling);
  isCrawlingRef.current = isCrawling;

  const handleUrlsDetected = useCallback(
    async (urls: string[]) => {
      if (!isCrawlingRef.current && urls.length > 0) {
        await detectAndCrawlUrls(urls.join(' '), usePrivacyMode);
      }
    },
    [detectAndCrawlUrls, usePrivacyMode]
  );

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
        tabIndex={
          (form.generator.baseFormTabIndex as Record<string, number>)?.platformSelectorTabIndex
        }
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
      <div className="container with-header">
        <BaseForm
          {...baseFormProps}
          title={<span className="gradient-title">Grüne Jugend</span>}
          onSubmit={() => {
            const submitHandler = handleSubmit(async (data: unknown) => {
              await onSubmitRHF(data as unknown as Record<string, unknown>);
            });
            return submitHandler();
          }}
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

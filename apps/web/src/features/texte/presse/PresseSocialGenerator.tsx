import React, { useState, useCallback, useEffect, useMemo, ReactNode } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { motion, AnimatePresence } from 'motion/react';
import ReactSelect from 'react-select';
import BaseForm from '../../../components/common/BaseForm';
import FormFieldWrapper from '../../../components/common/Form/Input/FormFieldWrapper';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import apiClient from '../../../components/utils/apiClient';
import { useSharedContent } from '../../../components/hooks/useSharedContent';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useAuthStore } from '../../../stores/authStore';
import { HiInformationCircle } from 'react-icons/hi';
import { FormInput, FormTextarea } from '../../../components/common/Form/Input';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';
import { useShallow } from 'zustand/react/shallow';
import { useUserInstructions } from '../../../hooks/useUserInstructions';
import { TabIndexHelpers } from '../../../utils/tabIndexConfig';
import useSharepicGeneration from '../../../hooks/useSharepicGeneration';
import FileUpload from '../../../components/common/FileUpload';
import Icon from '../../../components/common/Icon';
import PlatformSelector from '../../../components/common/PlatformSelector';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import SmartInput from '../../../components/common/Form/SmartInput';
import { getIcon } from '../../../config/icons';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { prepareFilesForSubmission } from '../../../utils/fileAttachmentUtils';
import usePlatformAutoDetect from '../../../hooks/usePlatformAutoDetect';
import useFormTips from '../../../hooks/useFormTips';
import useIsMobile from '../../../hooks/useIsMobile';
import SharepicConfigPopup from './SharepicConfigPopup';

interface PlatformOption {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface SharepicTypeOption {
  value: string;
  label: string;
}

interface LocalExamplePrompt {
  icon: string | ReactNode;
  label: string;
  prompt: string;
  platforms: string[];
}

interface PresseSocialGeneratorProps {
  showHeaderFooter?: boolean;
}

interface FormValues {
  inhalt: string;
  zitatgeber: string;
  presseabbinder: string;
  platforms: string[];
  sharepicType: string;
  zitatAuthor: string;
}

interface CombinedResults {
  sharepic?: unknown[];
  social?: {
    content: string;
    metadata?: Record<string, unknown>;
  };
}

interface GeneratedContentResult {
  sharepic?: unknown[];
  social?: {
    content: string;
    metadata?: Record<string, unknown>;
  };
  content: string;
  metadata: Record<string, unknown>;
  selectedPlatforms: string[];
  onEditSharepic: (sharepicData: unknown) => Promise<void>;
}

const PresseSocialGenerator: React.FC<PresseSocialGeneratorProps> = ({ showHeaderFooter = true }) => {
  const componentName = 'presse-social';
  const { initialContent } = useSharedContent();
  const { isAuthenticated, user } = useOptimizedAuth();
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';
  const canUseSharepic = isAuthenticated && !isAustrian;
  const isMobile = useIsMobile();

  const firstName = useMemo(() => {
    const displayName = user?.display_name || user?.name || '';
    return displayName.split(' ')[0] || '';
  }, [user]);

  const platformOptions = useMemo(() => {
    const options = [
      { id: 'pressemitteilung', label: 'Pressemitteilung', icon: <Icon category="platforms" name="pressemitteilung" size={16} /> },
      { id: 'instagram', label: 'Instagram', icon: <Icon category="platforms" name="instagram" size={16} /> },
      { id: 'facebook', label: 'Facebook', icon: <Icon category="platforms" name="facebook" size={16} /> },
      { id: 'twitter', label: 'Twitter/X, Mastodon & Bsky', icon: <Icon category="platforms" name="twitter" size={16} /> },
      { id: 'linkedin', label: 'LinkedIn', icon: <Icon category="platforms" name="linkedin" size={16} /> },
      { id: 'sharepic', label: 'Sharepic', icon: <Icon category="platforms" name="sharepic" size={16} /> },
      { id: 'actionIdeas', label: 'Aktionsideen', icon: <Icon category="platforms" name="actionIdeas" size={16} /> },
      { id: 'reelScript', label: 'Skript für Reels & Tiktoks', icon: <Icon category="platforms" name="reelScript" size={16} /> }
    ];
    return canUseSharepic ? options : options.filter(opt => opt.id !== 'sharepic');
  }, [canUseSharepic]);

  const sharepicTypeOptions = [
    { value: 'default', label: 'Standard (3 Sharepics automatisch)' },
    { value: 'dreizeilen', label: '3-Zeilen Slogan (mit Bild)' },
    { value: 'quote', label: 'Zitat mit Bild' },
    { value: 'quote_pure', label: 'Zitat ohne Bild' },
    { value: 'info', label: 'Infopost' },
  ];

  // Optimization: Memoize defaultPlatforms to prevent recalculation on every render
  const defaultPlatforms = useMemo(() => {
    // Determine default platforms based on initial content
    let selectedPlatforms = [];
    if (initialContent?.platforms) {
      selectedPlatforms = Object.keys(initialContent.platforms).filter(
        key => initialContent.platforms[key]
      );
      if (selectedPlatforms.length > 0) {
        return canUseSharepic ? selectedPlatforms : selectedPlatforms.filter(p => p !== 'sharepic');
      }
    }

    // Default for sharepic content
    if (initialContent?.isFromSharepic) {
      selectedPlatforms = ['instagram'];
    }

    return canUseSharepic ? selectedPlatforms : selectedPlatforms.filter(p => p !== 'sharepic');
  }, [initialContent, canUseSharepic]);

  // Use useBaseForm to get automatic document/text fetching
  const form = useBaseForm({
    defaultValues: {
      inhalt: initialContent?.inhalt || initialContent?.thema || '',
      zitatgeber: initialContent?.zitatgeber || '',
      presseabbinder: '',
      platforms: defaultPlatforms,
      sharepicType: 'default',
      zitatAuthor: ''
    },
    shouldUnregister: false,  // Preserve field values when conditionally rendered
    generatorType: 'presse-social',
    componentName: 'presse-social',
    endpoint: '/claude_social',
    instructionType: 'social',
    features: ['webSearch', 'privacyMode', 'proMode'],
    tabIndexKey: 'PRESS_SOCIAL',
    defaultMode: 'balanced',
    disableKnowledgeSystem: false  // Enable knowledge system for document/text fetching
  });

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    errors
  } = form;
  // Cast getValues to typed version
  const getValues = form.getValues as (name?: string) => unknown;

  // Type control as any for useWatch compatibility with useBaseForm
  const typedControl = control as unknown as import('react-hook-form').Control<FormValues>;
  const watchPlatforms: string[] = useWatch({ control: typedControl, name: 'platforms' }) ?? defaultPlatforms;
  const watchSharepicType: string = useWatch({ control: typedControl, name: 'sharepicType' }) ?? 'default';
  const watchInhalt: string = useWatch({ control: typedControl, name: 'inhalt' }) ?? '';

  const watchPressemitteilung = Array.isArray(watchPlatforms) && watchPlatforms.includes('pressemitteilung');
  const watchSharepic = canUseSharepic && Array.isArray(watchPlatforms) && watchPlatforms.includes('sharepic');

  // Auto-detect platforms from content text (respects user removals)
  usePlatformAutoDetect({
    content: watchInhalt,
    currentPlatforms: watchPlatforms,
    validPlatformIds: platformOptions.map(p => p.id),
    onPlatformsDetected: (newPlatforms) => setValue('platforms', newPlatforms)
  });

  // Ensure sharepic is not selected when user cannot use it
  useEffect(() => {
    if (!canUseSharepic && Array.isArray(watchPlatforms) && watchPlatforms.includes('sharepic')) {
      const filtered = watchPlatforms.filter(p => p !== 'sharepic');
      setValue('platforms', filtered);
    }
  }, [canUseSharepic, watchPlatforms, setValue]);

  const handleImageChange = useCallback((file: File | null) => {
    setUploadedImage(file);
  }, []);

  const [socialMediaContent, setSocialMediaContent] = useState<string | GeneratedContentResult>('');
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [processedAttachments, setProcessedAttachments] = useState<unknown[]>([]);
  const [showSharepicConfig, setShowSharepicConfig] = useState(false);

  // Get selection store state (batched with useShallow for optimal performance)
  // This reduces 5 subscriptions to 1, preventing cascade re-renders
  const {
    selectedDocumentIds,
    selectedTextIds,
    isInstructionsActive,
    getFeatureState,
    usePrivacyMode
  } = useGeneratorSelectionStore(useShallow(state => ({
    selectedDocumentIds: state.selectedDocumentIds,
    selectedTextIds: state.selectedTextIds,
    isInstructionsActive: state.isInstructionsActive,
    getFeatureState: state.getFeatureState,
    usePrivacyMode: state.usePrivacyMode
  })));

  // Fetch user's custom instructions
  const customPrompt = useUserInstructions('social', isInstructionsActive);

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

  // Handle URL detection and crawling
  const handleUrlsDetected = useCallback(async (urls: string[]) => {
    // Only crawl if not already crawling and URLs are detected
    if (!isCrawling && urls.length > 0) {
      await detectAndCrawlUrls(urls.join(' '), usePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, usePrivacyMode]);

  // Handle URL retry
  const handleRetryUrl = useCallback(async (url: string) => {
    await retryUrl(url, usePrivacyMode);
  }, [retryUrl, usePrivacyMode]);

  // Get generator utilities from useBaseForm
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_social');
  const { generateSharepic, loading: sharepicLoading } = useSharepicGeneration();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));

  const hasGeneratedContent = !!(storeGeneratedText || socialMediaContent);
  const isStartMode = !hasGeneratedContent;

  // Contextual tips based on form state
  const { activeTip } = useFormTips(
    { hasPressemitteilung: watchPressemitteilung },
    {
      hasPressemitteilung: {
        icon: '💡',
        text: 'Tipp: Nenne im Text, wer zitiert werden soll (z.B. "Laut Maria Müller...")'
      }
    }
  );

  const onSubmitRHF = useCallback(async (rhfData: FormValues) => {
    setStoreIsLoading(true);

    try {
      // Get current feature toggle state from store
      const features = getFeatureState();

      // Use platforms array directly from multi-select
      const selectedPlatforms = rhfData.platforms || [];
      const hasSharepic = canUseSharepic && selectedPlatforms.includes('sharepic');

      // Combine file attachments with crawled URLs
      const allAttachments = [
        ...processedAttachments,
        ...crawledUrls
      ];

      const formDataToSubmit: Record<string, unknown> = {
        inhalt: rhfData.inhalt,
        platforms: selectedPlatforms,
        zitatgeber: rhfData.zitatgeber,
        ...features, // Add feature toggles from store: useWebSearchTool, usePrivacyMode, useBedrock
        attachments: allAttachments
      };

      // Extract search query from form data for intelligent document content
      const extractQueryFromFormData = (data: Record<string, unknown>) => {
        const queryParts: string[] = [];
        if (data.inhalt) queryParts.push(data.inhalt as string);
        if (data.zitatgeber) queryParts.push(data.zitatgeber as string);
        return queryParts.filter(part => part && (part as string).trim()).join(' ');
      };

      const searchQuery = extractQueryFromFormData(formDataToSubmit);

      // Add custom prompt from user instructions (simplified)
      formDataToSubmit.customPrompt = customPrompt;
      formDataToSubmit.selectedDocumentIds = selectedDocumentIds || [];
      formDataToSubmit.selectedTextIds = selectedTextIds || [];
      formDataToSubmit.searchQuery = searchQuery || '';

      const combinedResults: CombinedResults = {};
      const otherPlatforms = selectedPlatforms.filter(p => p !== 'sharepic');

      // Run sharepic and social generation in PARALLEL for better performance
      const generationPromises: Promise<{ type: string; result?: unknown; error?: unknown }>[] = [];

      // Prepare sharepic generation promise
      if (hasSharepic) {
        type SharepicType = 'default' | 'quote' | 'quote_pure' | 'info' | 'headline' | 'dreizeilen';
        generationPromises.push(
          generateSharepic(
            rhfData.inhalt,
            '', // details merged into inhalt
            uploadedImage,
            (rhfData.sharepicType || 'default') as SharepicType,
            rhfData.zitatAuthor,
            customPrompt,
            allAttachments,
            features.usePrivacyMode,
            null,
            features.useBedrock
          ).then(result => ({ type: 'sharepic' as const, result }))
           .catch(error => ({ type: 'sharepic' as const, error }))
        );
      }

      // Prepare social generation promise
      if (otherPlatforms.length > 0) {
        generationPromises.push(
          submitForm({
            ...formDataToSubmit,
            platforms: otherPlatforms
          }).then(result => ({ type: 'social', result }))
            .catch(error => ({ type: 'social', error }))
        );
      }

      // Execute all generations in parallel
      const results = await Promise.all(generationPromises);

      // Process results
      for (const outcome of results) {
        if (outcome.type === 'sharepic' && !outcome.error && outcome.result) {
          interface SharepicEntry {
            id?: string;
            createdAt?: string;
            [key: string]: unknown;
          }
          const sharepicResult = outcome.result as SharepicEntry | SharepicEntry[];
          const previousContent = useGeneratedTextStore.getState().generatedTexts?.[componentName] as GeneratedContentResult | undefined || socialMediaContent as GeneratedContentResult | undefined;
          const existingSharepics: unknown[] = Array.isArray(previousContent?.sharepic)
            ? previousContent.sharepic
            : previousContent?.sharepic
              ? [previousContent.sharepic]
              : [];

          let newSharepicEntries: SharepicEntry[];
          if (Array.isArray(sharepicResult)) {
            newSharepicEntries = sharepicResult.map((sharepic: SharepicEntry) => ({
              ...sharepic,
              id: sharepic.id || `sharepic-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              createdAt: sharepic.createdAt || new Date().toISOString()
            }));
          } else {
            newSharepicEntries = [{
              ...sharepicResult,
              id: `sharepic-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              createdAt: new Date().toISOString()
            }];
          }

          combinedResults.sharepic = [...newSharepicEntries, ...existingSharepics];
        } else if (outcome.type === 'sharepic' && outcome.error) {
          console.error('[PresseSocialGenerator] Sharepic generation failed:', outcome.error);
        }

        if (outcome.type === 'social' && !outcome.error && outcome.result) {
          const response = outcome.result as { content?: string; metadata?: Record<string, unknown> } | string;
          let content = typeof response === 'string' ? response : (response as { content?: string }).content || '';
          const metadata = typeof response === 'object' && response !== null ? (response as { metadata?: Record<string, unknown> }).metadata || {} : {};

          if (otherPlatforms.includes('pressemitteilung') && rhfData.presseabbinder?.trim()) {
            content = `${content}\n\n---\n\n${rhfData.presseabbinder.trim()}`;
          }

          combinedResults.social = { content, metadata };
        } else if (outcome.type === 'social' && outcome.error) {
          console.error('[PresseSocialGenerator] Social generation failed:', outcome.error);
        }
      }

      // Set combined content
      if (combinedResults.sharepic || combinedResults.social) {
        const finalContent: GeneratedContentResult = {
          ...combinedResults,
          // For backward compatibility, also set the main content
          content: combinedResults.social?.content || '',
          metadata: combinedResults.social?.metadata || {},
          // Add selected platforms for social sharing feature
          selectedPlatforms: otherPlatforms,
          // Add edit handler for sharepics
          onEditSharepic: handleEditSharepic
        };

        setSocialMediaContent(finalContent);
        setGeneratedText(componentName, finalContent, finalContent.metadata);
        setTimeout(resetSuccess, 3000);
      }
    } catch (submitError) {
      console.error('[PresseSocialGenerator] Error submitting form:', submitError);
    } finally {
      setStoreIsLoading(false);
    }
  }, [submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, customPrompt, generateSharepic, uploadedImage, processedAttachments, crawledUrls, socialMediaContent, selectedDocumentIds, selectedTextIds, getFeatureState, canUseSharepic]);

  const handleGeneratedContentChange = useCallback((content: any) => {
    setSocialMediaContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const handleAttachmentClick = useCallback(async (files) => {
    try {
      const processed = await prepareFilesForSubmission(files);

      setAttachedFiles(prevFiles => [...prevFiles, ...files]);
      setProcessedAttachments(prevProcessed => [...prevProcessed, ...processed]);
    } catch (error) {
      console.error('[PresseSocialGenerator] File processing error:', error);
    }
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
    setProcessedAttachments(prevProcessed => prevProcessed.filter((_, i) => i !== index));
  }, []);

  const handleEditSharepic = useCallback(async (sharepicData) => {
    // Clean up old edit sessions to prevent sessionStorage accumulation
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('sharepic-edit-')) {
        try {
          const data = JSON.parse(sessionStorage.getItem(key));
          if (data.timestamp && data.timestamp < fiveMinutesAgo) {
            sessionStorage.removeItem(key);
            console.log('[PresseSocialGenerator] Cleaned up old edit session:', key);
            i--; // Adjust index since we removed an item
          }
        } catch (e) {
          // Remove invalid data
          sessionStorage.removeItem(key);
          i--; // Adjust index since we removed an item
        }
      }
    }

    // Create unique editing session ID
    const editingSessionId = `sharepic-edit-${Date.now()}`;

    try {
      let imageSessionId = null;

      // Upload image to backend Redis storage if available
      if (sharepicData.image) {
        try {
          const imageResponse = await apiClient.post('/sharepic/edit-session', {
            imageData: sharepicData.image,
            originalImageData: sharepicData.originalImage, // Store original background
            metadata: {
              type: sharepicData.type,
              hasOriginalImage: !!sharepicData.originalImage,
              timestamp: Date.now()
            }
          });

          // Handle Axios response wrapper - extract data
          const result = imageResponse.data || imageResponse;
          imageSessionId = result.sessionId;
          console.log('[PresseSocialGenerator] Images stored in backend:', imageSessionId, 'hasOriginal:', !!sharepicData.originalImage);
        } catch (imageUploadError) {
          console.warn('[PresseSocialGenerator] Failed to store image in backend:', imageUploadError);
        }
      }

      // Store minimal data in sessionStorage for cross-tab access
      const sessionData = {
        text: sharepicData.text,
        type: sharepicData.type,
        // Remove alternatives arrays - they're not needed for editing and can be large
        hasImage: !!sharepicData.image,
        imageSessionId: imageSessionId, // Store session ID instead of image
        hasOriginalImage: !!sharepicData.originalImage
      };

      // Add size check before storing in sessionStorage
      const dataToStore = JSON.stringify({
        source: 'presseSocial',
        data: sessionData,
        timestamp: Date.now()
      });

      // Check size (sessionStorage typically has 5-10MB limit)
      if (dataToStore.length > 1000000) { // 1MB safety limit
        console.error('[PresseSocialGenerator] Session data too large:', dataToStore.length, 'bytes');
        throw new Error('Session data too large for storage');
      }

      sessionStorage.setItem(editingSessionId, dataToStore);
    } catch (error) {
      console.error('[PresseSocialGenerator] Error preparing edit session:', error);
      // Fallback: store without image
      sessionStorage.setItem(editingSessionId, JSON.stringify({
        source: 'presseSocial',
        data: {
          text: sharepicData.text,
          type: sharepicData.type,
          // Remove alternatives arrays - they're not needed for editing and can be large
          hasImage: false
        },
        timestamp: Date.now()
      }));
    }

    // Open Image Studio in new tab with editing session
    const url = new URL(window.location.origin + '/image-studio/templates');
    url.searchParams.append('editSession', editingSessionId);
    window.open(url.toString(), '_blank');
  }, []);

  const helpContent = {
    content: "Erstelle professionelle Pressemitteilungen und Social Media Inhalte",
    tips: [
      "Beschreibe dein Thema und alle relevanten Details im Inhalt-Feld",
      "Wähle die gewünschten Formate aus",
      "Bei Pressemitteilungen: Angabe von Zitatgeber erforderlich",
      "Bei Sharepics: Standard erstellt automatisch 3 verschiedene Sharepics. Weitere Formate: 3-Zeilen Slogan, Zitat mit/ohne Bild, Infopost"
    ],
    features: [
      {
        title: "Multi-Format",
        description: "Erstelle gleichzeitig Pressemitteilungen, Social Posts und Sharepics"
      },
      {
        title: "Plattform-optimiert",
        description: "Automatisch angepasst für Instagram, Facebook, Twitter, LinkedIn & mehr"
      },
      {
        title: "Sharepics inklusive",
        description: "Professionelle Grafiken mit passenden Headlines direkt zum Download"
      }
    ]
  };

  const examplePrompts = [
    {
      icon: "🎉",
      label: "Erfolg im Gemeinderat",
      prompt: "Unser Antrag für mehr Stadtbäume wurde heute im Gemeinderat mit großer Mehrheit angenommen! 50 neue Bäume werden noch dieses Jahr in der Innenstadt gepflanzt. Danke an alle, die unterschrieben und sich eingesetzt haben. Grüne Politik wirkt - auch vor Ort.",
      platforms: ["instagram", "facebook"]
    },
    {
      icon: "🚨",
      label: "Gegen Flächenversiegelung",
      prompt: "Der geplante Parkplatz am Stadtpark würde 2000m² Grünfläche zerstören. Wir fordern stattdessen: Ausbau des P+R-Parkplatzes am Bahnhof und bessere Busanbindung. Die Innenstadt braucht mehr Grün, nicht mehr Beton. Kommt zur Infoveranstaltung am Donnerstag!",
      platforms: ["twitter", "facebook"]
    },
    {
      icon: "✊",
      label: "Tempo 30 vor Schulen",
      prompt: "Vor der Grundschule Waldstraße rasen täglich Autos mit 50 km/h vorbei. Wir sammeln Unterschriften für Tempo 30 in allen Schulzonen. Schon 847 Bürger*innen haben unterschrieben. Unterschreibt auch: [Link]. Nächste Woche bringen wir den Antrag ein.",
      platforms: ["instagram", "twitter"]
    }
  ];

  const mobileExamplePrompts = [
    {
      icon: <Icon category="platforms" name="pressemitteilung" size={16} color="#005437" />,
      label: "Pressemitteilung",
      prompt: "Schreibe eine Pressemitteilung zu folgendem Thema:",
      platforms: ["pressemitteilung"]
    },
    {
      icon: <Icon category="platforms" name="instagram" size={16} color="#E4405F" />,
      label: "Instagram",
      prompt: "Erstelle einen Instagram Post für:",
      platforms: ["instagram"]
    },
    {
      icon: <Icon category="platforms" name="facebook" size={16} color="#1877F2" />,
      label: "Facebook",
      prompt: "Erstelle einen Facebook Post für:",
      platforms: ["facebook"]
    },
    {
      icon: <Icon category="platforms" name="twitter" size={16} color="#000000" />,
      label: "Twitter/X",
      prompt: "Erstelle einen Tweet zu:",
      platforms: ["twitter"]
    },
    {
      icon: <Icon category="platforms" name="linkedin" size={16} color="#0A66C2" />,
      label: "LinkedIn",
      prompt: "Erstelle einen LinkedIn Post zu:",
      platforms: ["linkedin"]
    },
    {
      icon: <Icon category="platforms" name="instagram" size={16} color="#E4405F" />,
      label: "Instagram + Facebook",
      prompt: "Erstelle Posts für Instagram und Facebook zu:",
      platforms: ["instagram", "facebook"]
    },
    {
      icon: <Icon category="platforms" name="pressemitteilung" size={16} color="#005437" />,
      label: "Presse + Social",
      prompt: "Schreibe eine Pressemitteilung und Social Media Posts zu:",
      platforms: ["pressemitteilung", "instagram", "facebook"]
    },
    {
      icon: <Icon category="platforms" name="sharepic" size={16} color="#005437" />,
      label: "Sharepic",
      prompt: "Erstelle ein Sharepic zu:",
      platforms: ["sharepic"]
    }
  ];

  const handleExamplePromptClick = useCallback((example: LocalExamplePrompt) => {
    setValue('inhalt', example.prompt || '');
    if (example.platforms) {
      setValue('platforms', example.platforms);
    }
  }, [setValue]);

  const renderPlatformSection = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xsmall)' }}>
      <PlatformSelector
        name="platforms"
        control={control}
        platformOptions={platformOptions}
        label=""
        placeholder="Formate"
        required={true}
        tabIndex={form.generator?.baseFormTabIndex?.platformSelectorTabIndex}
        enableAutoSelect={true}
      />
      {watchSharepic && (
        <button
          type="button"
          onClick={() => setShowSharepicConfig(true)}
          className="sharepic-config-button"
          title="Sharepic konfigurieren"
        >
          <Icon category="platforms" name="sharepic" size={18} />
        </button>
      )}
    </div>
  );

  const renderFormInputs = () => (
    <>
      <FormTextarea
        name="inhalt"
        control={control}
        placeholder={FORM_PLACEHOLDERS.INHALT}
        rules={{ required: 'Inhalt ist ein Pflichtfeld' }}
        minRows={5}
        maxRows={15}
        className="form-textarea-large"
        tabIndex={form.generator?.tabIndex?.inhalt}
        enableUrlDetection={true}
        onUrlsDetected={handleUrlsDetected}
        enableTextAutocomplete={false}
        autocompleteAddHashtag={false}
      />

      <AnimatePresence>
        {watchPressemitteilung && !isStartMode && (
          <motion.div
            className={`press-release-fields ${watchSharepic ? 'has-preceding-section' : ''}`.trim()}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 25,
              duration: 0.25
            }}
          >
            <h4>Pressemitteilung:</h4>
            <SmartInput
              fieldType="zitatgeber"
              formName="presseSocial"
              name="zitatgeber"
              control={control}
              setValue={setValue}
              getValues={getValues}
              label={FORM_LABELS.WHO_QUOTE}
              subtext="Mehrere Personen können genannt werden."
              placeholder={FORM_PLACEHOLDERS.WHO_QUOTE}
              rules={{}}
              tabIndex={TabIndexHelpers.getConditional(form.generator?.tabIndex?.zitatgeber, watchPressemitteilung)}
              onSubmitSuccess={success ? String(getValues('zitatgeber') || '') : null}
              shouldSave={success}
            />
            <SmartInput
              fieldType="presseabbinder"
              formName="presseSocial"
              name="presseabbinder"
              control={control}
              setValue={setValue}
              getValues={getValues}
              label="Presseabbinder (optional)"
              subtext="Standard-Abbinder, der an die Pressemitteilung angehängt wird (z.B. Kontaktdaten, Vereinsinformationen)."
              placeholder="z.B. Kontakt: Max Mustermann, presse@gruene-example.de"
              tabIndex={TabIndexHelpers.getConditional(form.generator?.tabIndex?.presseabbinder, watchPressemitteilung)}
              onSubmitSuccess={success ? String(getValues('presseabbinder') || '') : null}
              shouldSave={success}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          useStartPageLayout={true}
          startPageDescription="Erstelle professionelle Texte für Social Media und Presse. Wähle deine Plattformen und lass dich von KI unterstützen."
          title={firstName ? `Hallo ${firstName}! Welche Botschaft willst du heute grünerieren?` : "Welche Botschaft willst du heute grünerieren?"}
          onSubmit={() => handleSubmit(onSubmitRHF)()}
          loading={loading || sharepicLoading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || socialMediaContent}
          enableEditMode={true}
          enableKnowledgeSelector={true}
          helpContent={helpContent}
          componentName={componentName}
          useFeatureIcons={true}
          onAttachmentClick={handleAttachmentClick}
          onRemoveFile={handleRemoveFile}
          attachedFiles={attachedFiles}
          featureIconsTabIndex={{
            webSearch: form.generator?.tabIndex?.webSearch,
            privacyMode: form.generator?.tabIndex?.privacyMode,
            attachment: form.generator?.tabIndex?.attachment
          }}
          knowledgeSelectorTabIndex={form.generator?.baseFormTabIndex?.knowledgeSelectorTabIndex}
          knowledgeSourceSelectorTabIndex={form.generator?.baseFormTabIndex?.knowledgeSourceSelectorTabIndex}
          submitButtonTabIndex={form.generator?.baseFormTabIndex?.submitButtonTabIndex}
          firstExtrasChildren={renderPlatformSection()}
          examplePrompts={(isMobile ? mobileExamplePrompts : examplePrompts) as import('../../../types/baseform').ExamplePrompt[]}
          onExamplePromptClick={handleExamplePromptClick as (prompt: import('../../../types/baseform').ExamplePrompt) => void}
          contextualTip={activeTip}
        >
          {renderFormInputs()}
        </BaseForm>

        <SharepicConfigPopup
          isOpen={showSharepicConfig}
          onClose={() => setShowSharepicConfig(false)}
          control={control}
          setValue={setValue}
          getValues={getValues}
          sharepicTypeOptions={sharepicTypeOptions}
          watchSharepicType={watchSharepicType}
          uploadedImage={uploadedImage}
          handleImageChange={handleImageChange}
          loading={loading || sharepicLoading}
          success={success}
        />
      </div>
    </ErrorBoundary>
  );
};

export default PresseSocialGenerator;

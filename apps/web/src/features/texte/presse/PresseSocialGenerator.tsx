import React, { useState, useCallback, useEffect, useMemo, ReactNode, lazy, Suspense } from 'react';
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
import { isDesktopApp } from '../../../utils/platform';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { prepareFilesForSubmission } from '../../../utils/fileAttachmentUtils';
import usePlatformAutoDetect from '../../../hooks/usePlatformAutoDetect';
import useFormTips from '../../../hooks/useFormTips';
import SharepicConfigPopup from './SharepicConfigPopup';
import type { SharepicDataItem } from '../../../components/common/ImageDisplay';

const SharepicMasterEditorModal = lazy(() => import('../../../components/SharepicMasterEditorModal'));

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
  prompt?: string;
  platforms: string[];
  text?: string;
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

  const platformTags = useMemo(() => {
    const tags = [
      { icon: <Icon category="platforms" name="pressemitteilung" size={16} />, label: "Pressemitteilung", platforms: ["pressemitteilung"] },
      { icon: <Icon category="platforms" name="instagram" size={16} />, label: "Instagram", platforms: ["instagram"] },
      { icon: <Icon category="platforms" name="facebook" size={16} />, label: "Facebook", platforms: ["facebook"] },
      { icon: <Icon category="platforms" name="twitter" size={16} />, label: "X/bsky/Mastodon", platforms: ["twitter"] },
      { icon: <Icon category="platforms" name="linkedin" size={16} />, label: "LinkedIn", platforms: ["linkedin"] },
      { icon: <Icon category="platforms" name="sharepic" size={16} />, label: "Sharepic", platforms: ["sharepic"] },
      { icon: <Icon category="platforms" name="actionIdeas" size={16} />, label: "Aktionen", platforms: ["actionIdeas"] },
      { icon: <Icon category="platforms" name="reelScript" size={16} />, label: "Reel", platforms: ["reelScript"] }
    ];
    return canUseSharepic ? tags : tags.filter(t => !t.platforms.includes('sharepic'));
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
    let selectedPlatforms: string[] = [];
    const typedInitialContent = initialContent as { platforms?: Record<string, boolean>; isFromSharepic?: boolean } | undefined;
    if (typedInitialContent?.platforms) {
      selectedPlatforms = Object.keys(typedInitialContent.platforms).filter(
        key => typedInitialContent.platforms?.[key]
      );
      if (selectedPlatforms.length > 0) {
        return canUseSharepic ? selectedPlatforms : selectedPlatforms.filter(p => p !== 'sharepic');
      }
    }

    // Default for sharepic content
    if (typedInitialContent?.isFromSharepic) {
      selectedPlatforms = ['instagram'];
    }

    return canUseSharepic ? selectedPlatforms : selectedPlatforms.filter(p => p !== 'sharepic');
  }, [initialContent, canUseSharepic]);

  // Use useBaseForm to get automatic document/text fetching
  const typedInitialContent = initialContent as { inhalt?: string; thema?: string; zitatgeber?: string } | undefined;
  const form = useBaseForm({
    defaultValues: {
      inhalt: typedInitialContent?.inhalt || typedInitialContent?.thema || '',
      zitatgeber: typedInitialContent?.zitatgeber || '',
      presseabbinder: '',
      platforms: defaultPlatforms,
      sharepicType: 'default',
      zitatAuthor: ''
    } as Record<string, unknown>,
    shouldUnregister: false,  // Preserve field values when conditionally rendered
    generatorType: 'presse-social' as any,
    componentName: 'presse-social' as any,
    endpoint: '/claude_social' as any,
    instructionType: 'social' as any,
    features: ['webSearch', 'privacyMode', 'proMode'] as any,
    tabIndexKey: 'PRESS_SOCIAL' as any,
    defaultMode: 'balanced' as any,
    disableKnowledgeSystem: false  // Enable knowledge system for document/text fetching
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
    };
    [key: string]: unknown;
  };

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
  const watchPlatformsValue = useWatch({ control: typedControl, name: 'platforms' }) as unknown;
  const watchPlatforms: string[] = (Array.isArray(watchPlatformsValue) ? watchPlatformsValue : defaultPlatforms) as string[];
  const watchSharepicType: string = (useWatch({ control: typedControl, name: 'sharepicType' }) as unknown ?? 'default') as string;
  const watchInhalt: string = (useWatch({ control: typedControl, name: 'inhalt' }) as unknown ?? '') as string;

  const watchPressemitteilung = Array.isArray(watchPlatforms) && watchPlatforms.includes('pressemitteilung');
  const watchSharepic = canUseSharepic && Array.isArray(watchPlatforms) && watchPlatforms.includes('sharepic');

  // Auto-detect platforms from content text (respects user removals)
  usePlatformAutoDetect({
    content: watchInhalt,
    currentPlatforms: watchPlatforms,
    validPlatformIds: [...platformOptions.map(p => p.id)],
    onPlatformsDetected: (newPlatforms: string[]) => setValue('platforms', newPlatforms)
  } as Parameters<typeof usePlatformAutoDetect>[0]);

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
  const [editingSharepic, setEditingSharepic] = useState<SharepicDataItem | null>(null);
  const [editingSharepicIndex, setEditingSharepicIndex] = useState<number>(-1);

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

  const onSubmitRHF = useCallback(async (rhfData: Record<string, unknown>) => {
    const typedRhfData = rhfData as unknown as FormValues;
    setStoreIsLoading(true);

    try {
      // Get current feature toggle state from store
      const features = getFeatureState();

      // Use platforms array directly from multi-select
      const selectedPlatforms = (typedRhfData.platforms || []) as string[];
      const hasSharepic = canUseSharepic && selectedPlatforms.includes('sharepic');

      // Combine file attachments with crawled URLs
      const allAttachments: unknown[] = [
        ...processedAttachments,
        ...crawledUrls
      ];

      const formDataToSubmit: Record<string, unknown> = {
        inhalt: typedRhfData.inhalt,
        platforms: selectedPlatforms,
        zitatgeber: typedRhfData.zitatgeber,
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
        interface SharepicAttachment {
          type: string;
          data: string;
          [key: string]: unknown;
        }
        generationPromises.push(
          generateSharepic(
            typedRhfData.inhalt,
            '', // details merged into inhalt
            uploadedImage,
            (typedRhfData.sharepicType || 'default') as SharepicType,
            typedRhfData.zitatAuthor,
            customPrompt,
            allAttachments as SharepicAttachment[],
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

          if (otherPlatforms.includes('pressemitteilung') && typedRhfData.presseabbinder?.trim()) {
            content = `${content}\n\n---\n\n${typedRhfData.presseabbinder.trim()}`;
          }

          combinedResults.social = { content, metadata };
        } else if (outcome.type === 'social' && outcome.error) {
          console.error('[PresseSocialGenerator] Social generation failed:', outcome.error);
        }
      }

      // Set combined content
      if (combinedResults.sharepic || combinedResults.social) {
        // Fix: Only include content field if there are text platforms, otherwise MDXEditor crashes on empty string
        const hasTextContent = otherPlatforms.length > 0 && combinedResults.social?.content;
        const finalContent: GeneratedContentResult = {
          ...combinedResults,
          // Only set content if there's actual text to display, prevents MDXEditor crash
          content: hasTextContent ? combinedResults.social!.content : '',
          metadata: combinedResults.social?.metadata || {},
          // Add selected platforms for social sharing feature
          selectedPlatforms: otherPlatforms,
          // Note: onEditSharepic is added dynamically when passing to BaseForm to avoid re-render loops
          onEditSharepic: async () => {}
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

  const handleAttachmentClick = useCallback((files?: File[]) => {
    if (!files || files.length === 0) return;

    (async () => {
      try {
        const processed = await prepareFilesForSubmission(files);

        setAttachedFiles(prevFiles => [...prevFiles, ...files]);
        setProcessedAttachments(prevProcessed => [...prevProcessed, ...processed]);
      } catch (error) {
        console.error('[PresseSocialGenerator] File processing error:', error);
      }
    })();
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
    setProcessedAttachments(prevProcessed => prevProcessed.filter((_, i) => i !== index));
  }, []);

  const handleOpenInlineEditor = useCallback((sharepicData: SharepicDataItem, index: number) => {
    setEditingSharepic(sharepicData);
    setEditingSharepicIndex(index);
  }, []);

  const handleEditorExport = useCallback((base64Image: string) => {
    const currentContent = storeGeneratedText || socialMediaContent;
    if (currentContent && typeof currentContent === 'object' && 'sharepic' in currentContent && editingSharepicIndex >= 0) {
      const sharepics = [...(currentContent.sharepic as SharepicDataItem[] || [])];
      if (sharepics[editingSharepicIndex]) {
        sharepics[editingSharepicIndex] = {
          ...sharepics[editingSharepicIndex],
          image: base64Image
        };
        const updatedContent = { ...currentContent, sharepic: sharepics };
        setSocialMediaContent(updatedContent as GeneratedContentResult);
        setGeneratedText(componentName, updatedContent, (updatedContent as GeneratedContentResult).metadata);
      }
    }
    setEditingSharepic(null);
    setEditingSharepicIndex(-1);
  }, [editingSharepicIndex, storeGeneratedText, socialMediaContent, setGeneratedText, componentName]);

  const handleEditorCancel = useCallback(() => {
    setEditingSharepic(null);
    setEditingSharepicIndex(-1);
  }, []);

  const handleEditSharepic = useCallback((sharepicData: unknown) => {
    const currentContent = storeGeneratedText || socialMediaContent;
    if (currentContent && typeof currentContent === 'object' && 'sharepic' in currentContent) {
      const sharepics = currentContent.sharepic as SharepicDataItem[];
      const index = sharepics.findIndex(s => s === sharepicData || s.id === (sharepicData as SharepicDataItem).id);
      handleOpenInlineEditor(sharepicData as SharepicDataItem, index >= 0 ? index : 0);
    } else {
      handleOpenInlineEditor(sharepicData as SharepicDataItem, 0);
    }
  }, [storeGeneratedText, socialMediaContent, handleOpenInlineEditor]);

  // Memoize generated content with handler to avoid re-render loops
  const generatedContentWithHandler = useMemo(() => {
    let content = storeGeneratedText || socialMediaContent;

    // Fix: Handle case where store returns JSON string instead of object
    if (typeof content === 'string' && content.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
          content = parsed;
        }
      } catch {
        // Not valid JSON, use as-is
      }
    }

    if (content && typeof content === 'object') {
      return { ...content, onEditSharepic: handleEditSharepic };
    }
    return content;
  }, [storeGeneratedText, socialMediaContent, handleEditSharepic]);

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

  const handlePlatformTagClick = useCallback((tag: LocalExamplePrompt) => {
    const platformId = tag.platforms?.[0];
    if (!platformId) return;

    const currentPlatforms = watchPlatforms || [];
    const isSelected = currentPlatforms.includes(platformId);

    if (isSelected) {
      setValue('platforms', currentPlatforms.filter(p => p !== platformId));
    } else {
      setValue('platforms', [...currentPlatforms, platformId]);
    }
  }, [watchPlatforms, setValue]);

  const renderPlatformSection = (): React.ReactElement => (
    <>
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
    </>
  );

  const renderFormInputs = (): React.ReactElement => (
    <>
      {/* Hidden Controller to register platforms field with react-hook-form */}
      <Controller
        name="platforms"
        control={control}
        render={() => <></>}
      />
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
              tabIndex={TabIndexHelpers.getConditional(((form.generator?.tabIndex as Record<string, number> | undefined)?.zitatgeber) || 0, watchPressemitteilung)}
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
              tabIndex={TabIndexHelpers.getConditional(((form.generator?.tabIndex as Record<string, number> | undefined)?.presseabbinder) || 0, watchPressemitteilung)}
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
          useStartPageLayout={false}
          title={firstName ? `Hallo ${firstName}! Welche Botschaft willst du heute grünerieren?` : "Welche Botschaft willst du heute grünerieren?"}
          onSubmit={() => void handleSubmit(onSubmitRHF)()}
          loading={loading || sharepicLoading}
          success={success}
          error={error}
          generatedContent={generatedContentWithHandler}
          enableEditMode={true}
          enableKnowledgeSelector={true}
          helpContent={helpContent}
          componentName={componentName}
          useFeatureIcons={true}
          onAttachmentClick={handleAttachmentClick}
          onRemoveFile={handleRemoveFile}
          attachedFiles={attachedFiles}
          featureIconsTabIndex={{
            webSearch: (form.generator?.tabIndex as Record<string, number> | undefined)?.webSearch,
            privacyMode: (form.generator?.tabIndex as Record<string, number> | undefined)?.privacyMode,
            attachment: (form.generator?.tabIndex as Record<string, number> | undefined)?.attachment
          }}
          knowledgeSelectorTabIndex={(form.generator?.baseFormTabIndex as Record<string, number> | undefined)?.knowledgeSelectorTabIndex}
          knowledgeSourceSelectorTabIndex={(form.generator?.baseFormTabIndex as Record<string, number> | undefined)?.knowledgeSourceSelectorTabIndex}
          submitButtonTabIndex={(form.generator?.baseFormTabIndex as Record<string, number> | undefined)?.submitButtonTabIndex}
          firstExtrasChildren={renderPlatformSection()}
          contextualTip={activeTip}
          examplePrompts={platformTags as import('../../../types/baseform').ExamplePrompt[]}
          onExamplePromptClick={handlePlatformTagClick as (prompt: import('../../../types/baseform').ExamplePrompt) => void}
          selectedPlatforms={watchPlatforms}
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

        {editingSharepic && (
          <Suspense fallback={<div className="loading-overlay">Lade Editor...</div>}>
            <SharepicMasterEditorModal
              sharepic={editingSharepic}
              isOpen={!!editingSharepic}
              onExport={handleEditorExport}
              onCancel={handleEditorCancel}
            />
          </Suspense>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default PresseSocialGenerator;

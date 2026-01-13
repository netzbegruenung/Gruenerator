import React, { useState, useCallback, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useWatch } from 'react-hook-form';
import { AnimatePresence } from 'motion/react';
import BaseForm from '../../../components/common/BaseForm';
import { useSharedContent } from '../../../components/hooks/useSharedContent';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useAuthStore } from '../../../stores/authStore';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { prepareFilesForSubmission } from '../../../utils/fileAttachmentUtils';
import usePlatformAutoDetect from '../../../hooks/usePlatformAutoDetect';
import useFormTips from '../../../hooks/useFormTips';
import type { SharepicDataItem } from '../../../components/common/ImageDisplay';
import ContentRenderer from '../../../components/common/Form/BaseForm/ContentRenderer';
import Icon from '../../../components/common/Icon';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import PlatformSelector from '../../../components/common/PlatformSelector';

// New foundation hooks
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';

// Child form components
import SocialMediaForm, { type SocialMediaFormRef } from './components/SocialMediaForm';
import PressemitteilungForm, { type PressemitteilungFormRef } from './components/PressemitteilungForm';
import SharepicForm, { type SharepicFormRef } from './components/SharepicForm';

// Custom submission hook
import { usePresseSocialSubmit, type PresseSocialFormData } from './hooks/usePresseSocialSubmit';

import './presse-social.css';

const SharepicMasterEditorModal = lazy(() => import('../../../components/SharepicMasterEditorModal').then(m => ({ default: m.SharepicMasterEditorModal })));

interface PresseSocialGeneratorProps {
  showHeaderFooter?: boolean;
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

  // Platform options
  const platformOptions = useMemo(() => {
    const options = [
      { id: 'automatisch', label: 'Automatisch', icon: <Icon category="platforms" name="automatisch" size={16} /> },
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

  // Default platforms from initial content
  const defaultPlatforms = useMemo(() => {
    let selectedPlatforms: string[] = ['automatisch']; // Default to 'automatisch'
    const typedInitialContent = initialContent as { platforms?: Record<string, boolean>; isFromSharepic?: boolean } | undefined;
    if (typedInitialContent?.platforms) {
      selectedPlatforms = Object.keys(typedInitialContent.platforms).filter(
        key => typedInitialContent.platforms?.[key]
      );
      if (selectedPlatforms.length > 0) {
        return canUseSharepic ? selectedPlatforms : selectedPlatforms.filter(p => p !== 'sharepic');
      }
    }

    if (typedInitialContent?.isFromSharepic) {
      selectedPlatforms = ['instagram'];
    }

    return canUseSharepic ? selectedPlatforms : selectedPlatforms.filter(p => p !== 'sharepic');
  }, [initialContent, canUseSharepic]);

  // Form setup with useBaseForm
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
    shouldUnregister: false,
    generatorType: 'presse-social' as never,
    componentName: 'presse-social' as never,
    endpoint: '/claude_social' as never,
    instructionType: 'social' as never,
    features: ['webSearch', 'privacyMode', 'proMode'] as never,
    tabIndexKey: 'PRESS_SOCIAL' as never,
    defaultMode: 'balanced' as never,
    disableKnowledgeSystem: false
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

  const { control, handleSubmit, setValue, getValues } = form;

  // Watch form values for conditional rendering
  const typedControl = control as unknown as import('react-hook-form').Control<{ platforms: string[]; inhalt: string }>;
  const watchPlatformsValue = useWatch({ control: typedControl, name: 'platforms' }) as unknown;
  const watchPlatforms: string[] = (Array.isArray(watchPlatformsValue) ? watchPlatformsValue : defaultPlatforms) as string[];
  const watchInhalt: string = (useWatch({ control: typedControl, name: 'inhalt' }) as unknown ?? '') as string;

  const watchPressemitteilung = Array.isArray(watchPlatforms) && watchPlatforms.includes('pressemitteilung');
  const watchSharepic = canUseSharepic && Array.isArray(watchPlatforms) && watchPlatforms.includes('sharepic');

  // Auto-detect platforms from content text
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

  // Child form refs
  const socialMediaFormRef = useRef<SocialMediaFormRef>(null);
  const pressemitteilungFormRef = useRef<PressemitteilungFormRef>(null);
  const sharepicFormRef = useRef<SharepicFormRef>(null);

  // State
  const [socialMediaContent, setSocialMediaContent] = useState<string | GeneratedContentResult>('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [processedAttachments, setProcessedAttachments] = useState<unknown[]>([]);
  const [editingSharepic, setEditingSharepic] = useState<SharepicDataItem | null>(null);
  const [editingSharepicIndex, setEditingSharepicIndex] = useState<number>(-1);

  // PR Agent workflow state
  const [approvalContent, setApprovalContent] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    'instagram', 'facebook', 'pressemitteilung'
  ]);

  const AVAILABLE_PLATFORMS = useMemo(() => [
    { id: 'instagram', label: 'Instagram', icon: '📷' },
    { id: 'facebook', label: 'Facebook', icon: '👥' },
    { id: 'pressemitteilung', label: 'Pressemitteilung', icon: '📰' },
    { id: 'linkedin', label: 'LinkedIn', icon: '💼' }
  ], []);

  // New hooks - foundation pattern
  const setup = useGeneratorSetup({
    instructionType: 'social',
    componentName: 'presse-social'
  });

  // URL crawler hook
  const {
    crawledUrls,
    detectAndCrawlUrls,
    removeCrawledUrl,
    retryUrl,
    isCrawling
  } = useUrlCrawler();

  // Combine attachments
  const allAttachments = useMemo(() => [
    ...processedAttachments,
    ...crawledUrls
  ], [processedAttachments, crawledUrls]);

  // Form data builder
  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: ['inhalt', 'zitatgeber'] as const
  });

  // Submission hook
  const submitHandler = usePresseSocialSubmit({
    features: setup.features,
    customPrompt: setup.customPrompt,
    selectedDocumentIds: setup.selectedDocumentIds,
    selectedTextIds: setup.selectedTextIds,
    attachments: allAttachments,
    canUseSharepic
  });

  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));

  const hasGeneratedContent = !!(storeGeneratedText || socialMediaContent);

  // URL detection handler
  const handleUrlsDetected = useCallback(async (urls: string[]) => {
    if (!isCrawling && urls.length > 0) {
      await detectAndCrawlUrls(urls.join(' '), setup.features.usePrivacyMode);
    }
  }, [detectAndCrawlUrls, isCrawling, setup.features.usePrivacyMode]);

  // Form submission
  const onSubmitRHF = useCallback(async (rhfData: Record<string, unknown>) => {
    setStoreIsLoading(true);

    try {
      // Collect data from child form refs
      const socialData = socialMediaFormRef.current?.getFormData();
      const presseData = pressemitteilungFormRef.current?.getFormData();
      const sharepicData = sharepicFormRef.current?.getFormData();

      // Get platforms from react-hook-form data (managed by parent)
      const platforms = Array.isArray(rhfData.platforms) ? rhfData.platforms as string[] : [];

      if (platforms.length === 0) {
        console.error('[PresseSocialGenerator] No platforms selected');
        setStoreIsLoading(false);
        return;
      }

      const combinedFormData: PresseSocialFormData = {
        inhalt: socialData.inhalt,
        platforms: platforms,
        zitatgeber: presseData?.zitatgeber || '',
        presseabbinder: presseData?.presseabbinder || '',
        sharepicType: sharepicData?.sharepicType || 'default',
        zitatAuthor: sharepicData?.zitatAuthor || '',
        uploadedImage: sharepicData?.uploadedImage || null
      };

      // Check if "automatisch" platform is selected (PR-Paket workflow)
      if (combinedFormData.platforms.includes('automatisch')) {
        const result = await submitHandler.submitPRWorkflow(combinedFormData);
        if (result?.content) {
          // Backend returns pre-formatted markdown - just store it directly
          console.log('[PresseSocialGenerator] Setting approvalContent:', {
            contentLength: result.content.length,
            firstChars: result.content.substring(0, 200),
            lastChars: result.content.substring(result.content.length - 200),
            hasRecherchierteArgumente: result.content.includes('Recherchierte Argumente'),
            hasDetailliertArgumente: result.content.includes('Detaillierte Argumente'),
          });
          setApprovalContent(result.content);
        }
        setStoreIsLoading(false);
        return;
      }

      // Standard social media generation
      const result = await submitHandler.submitStandard(combinedFormData);

      if (result && (result.sharepic || result.social)) {
        const hasTextContent = combinedFormData.platforms.some(p => p !== 'sharepic') && result.social?.content;
        const finalContent: GeneratedContentResult = {
          ...result,
          content: hasTextContent ? result.social!.content : '',
          metadata: result.social?.metadata || {},
          selectedPlatforms: combinedFormData.platforms.filter(p => p !== 'sharepic'),
          onEditSharepic: async () => {}
        };

        setSocialMediaContent(finalContent);
        setGeneratedText(componentName, finalContent, finalContent.metadata);
      }
    } catch (error) {
      console.error('[PresseSocialGenerator] Error submitting form:', error);
    } finally {
      setStoreIsLoading(false);
    }
  }, [submitHandler, setStoreIsLoading, setGeneratedText, componentName]);

  // File attachment handlers
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

  // Sharepic editor handlers
  const handleOpenInlineEditor = useCallback((sharepicData: SharepicDataItem, index: number) => {
    setEditingSharepic(sharepicData);
    setEditingSharepicIndex(index);
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

  // PR Agent handlers
  const handlePlatformToggle = useCallback((platformId: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platformId)
        ? prev.filter(p => p !== platformId)
        : [...prev, platformId]
    );
  }, []);

  const handlePRApproval = useCallback(async (platforms: string[]) => {
    if (!submitHandler.prWorkflow.state.workflowId) return;

    setStoreIsLoading(true);
    try {
      const result = await submitHandler.generateProduction(
        submitHandler.prWorkflow.state.workflowId,
        platforms
      );

      if (result) {
        const finalContent: GeneratedContentResult = {
          content: result.content?.instagram || result.content?.facebook || result.content?.pressemitteilung || '',
          metadata: result.metadata || {},
          selectedPlatforms: platforms,
          sharepic: result.sharepics || [],
          onEditSharepic: async () => {}
        };

        setSocialMediaContent(finalContent);
        setGeneratedText(componentName, finalContent, finalContent.metadata);
        setApprovalContent(null);
      }
    } catch (error) {
      console.error('[PresseSocialGenerator] Production generation failed:', error);
    } finally {
      setStoreIsLoading(false);
    }
  }, [submitHandler, setStoreIsLoading, setGeneratedText, componentName]);

  const handlePRReject = useCallback(() => {
    submitHandler.prWorkflow.reset();
    setApprovalContent(null);
  }, [submitHandler.prWorkflow]);

  // Platform selection UI for PR approval mode - rendered in FormExtrasSection
  const approvalPlatformSelector = useMemo(() => {
    if (!approvalContent) return null;

    return (
      <div className="pr-platform-selection">
        <div className="pr-section">
          <h3>Plattformen auswählen</h3>
          <p className="section-description">
            Welche Inhalte sollen auf Basis dieser Strategie generiert werden?
          </p>
          <div className="platform-grid">
            {AVAILABLE_PLATFORMS.map(platform => (
              <button
                key={platform.id}
                type="button"
                className={`platform-chip ${selectedPlatforms.includes(platform.id) ? 'selected' : ''}`}
                onClick={() => handlePlatformToggle(platform.id)}
              >
                <span className="platform-icon">{platform.icon}</span>
                <span className="platform-label">{platform.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="approval-actions">
          <button
            className="btn btn-secondary"
            onClick={handlePRReject}
            disabled={submitHandler.loading}
            type="button"
          >
            Ablehnen
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handlePRApproval(selectedPlatforms)}
            disabled={submitHandler.loading || selectedPlatforms.length === 0}
            type="button"
          >
            {submitHandler.loading ? 'Wird generiert...' : `Genehmigen & Generieren (${selectedPlatforms.length})`}
          </button>
        </div>
      </div>
    );
  }, [approvalContent, selectedPlatforms, handlePlatformToggle, handlePRApproval, handlePRReject, submitHandler.loading, AVAILABLE_PLATFORMS]);

  // Memoize generated content with handler
  const generatedContentWithHandler = useMemo(() => {
    let content = storeGeneratedText || socialMediaContent;

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

  // Contextual tips
  const { activeTip } = useFormTips(
    { hasPressemitteilung: watchPressemitteilung },
    {
      hasPressemitteilung: {
        icon: '💡',
        text: 'Tipp: Nenne im Text, wer zitiert werden soll (z.B. "Laut Maria Müller...")'
      }
    }
  );

  const handlePlatformTagClick = useCallback((tag: { platforms?: string[] }) => {
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

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          useStartPageLayout={false}
          title={firstName ? `Hallo ${firstName}! Welche Botschaft willst du heute grünerieren?` : "Welche Botschaft willst du heute grünerieren?"}
          onSubmit={() => void handleSubmit(onSubmitRHF)()}
          loading={submitHandler.loading}
          success={false}
          error={submitHandler.error}
          showNextButton={!approvalContent}
          generatedContent={approvalContent || generatedContentWithHandler}
          useMarkdown={!!approvalContent}
          enableEditMode={!approvalContent}
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
          contextualTip={activeTip}
          examplePrompts={platformTags as import('../../../types/baseform').ExamplePrompt[]}
          onExamplePromptClick={handlePlatformTagClick as (prompt: import('../../../types/baseform').ExamplePrompt) => void}
          selectedPlatforms={watchPlatforms}
          firstExtrasChildren={
            approvalContent ? (
              // PR Approval mode: Show platform selection for approval
              approvalPlatformSelector
            ) : (
              // Normal mode: Show regular platform selector + format options
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
                  <SharepicForm
                    ref={sharepicFormRef}
                    isVisible={watchSharepic}
                    sharepicTypeOptions={sharepicTypeOptions}
                    loading={submitHandler.loading}
                    success={false}
                    control={control}
                    setValue={setValue}
                    getValues={getValues}
                  />
                )}

                <AnimatePresence>
                  {watchPressemitteilung && !hasGeneratedContent && (
                    <PressemitteilungForm
                      ref={pressemitteilungFormRef}
                      defaultValues={{
                        zitatgeber: typedInitialContent?.zitatgeber || '',
                        presseabbinder: ''
                      }}
                      tabIndex={{
                        zitatgeber: (form.generator?.tabIndex as Record<string, number> | undefined)?.zitatgeber,
                        presseabbinder: (form.generator?.tabIndex as Record<string, number> | undefined)?.presseabbinder
                      }}
                      isVisible={watchPressemitteilung}
                      success={false}
                    />
                  )}
                </AnimatePresence>
              </>
            )
          }
        >
          {/* Main form inputs - show in FormSection (left side) */}
          <SocialMediaForm
            ref={socialMediaFormRef}
            defaultValues={{
              inhalt: typedInitialContent?.inhalt || typedInitialContent?.thema || ''
            }}
            tabIndex={{
              inhalt: form.generator?.tabIndex?.inhalt
            }}
            onUrlsDetected={handleUrlsDetected}
          />
        </BaseForm>

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

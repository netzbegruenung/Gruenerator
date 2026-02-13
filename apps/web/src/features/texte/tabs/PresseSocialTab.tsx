import { AnimatePresence } from 'motion/react';
import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  lazy,
  Suspense,
  memo,
} from 'react';
import { useWatch, type Control } from 'react-hook-form';

import BaseForm from '../../../components/common/BaseForm';
import CorrectionSection from '../../../components/common/Form/BaseForm/CorrectionSection';
import QuestionAnswerSection from '../../../components/common/Form/BaseForm/QuestionAnswerSection';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import Icon from '../../../components/common/Icon';
import PlatformSelector from '../../../components/common/PlatformSelector';
import { useSharedContent } from '../../../components/hooks/useSharedContent';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';
import useFormTips from '../../../hooks/useFormTips';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import usePlatformAutoDetect from '../../../hooks/usePlatformAutoDetect';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import { useAuthStore } from '../../../stores/authStore';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { prepareFilesForSubmission } from '../../../utils/fileAttachmentUtils';
import { usePlanModeWorkflow } from '../antrag/hooks/usePlanModeWorkflow';
import PressemitteilungForm, {
  type PressemitteilungFormRef,
} from '../presse/components/PressemitteilungForm';
import SharepicForm, { type SharepicFormRef } from '../presse/components/SharepicForm';
import SocialMediaForm, { type SocialMediaFormRef } from '../presse/components/SocialMediaForm';
import {
  usePresseSocialSubmit,
  type PresseSocialFormData,
} from '../presse/hooks/usePresseSocialSubmit';

import type { SharepicDataItem } from '../../../components/common/ImageDisplay';
import type { GeneratedContent, ExamplePrompt } from '../../../types/baseform';

import '../presse/presse-social.css';

const AutomatischIcon = memo(() => <Icon category="platforms" name="automatisch" size={16} />);
AutomatischIcon.displayName = 'AutomatischIcon';

const PressemitteilungIcon = memo(() => (
  <Icon category="platforms" name="pressemitteilung" size={16} />
));
PressemitteilungIcon.displayName = 'PressemitteilungIcon';

const InstagramIcon = memo(() => <Icon category="platforms" name="instagram" size={16} />);
InstagramIcon.displayName = 'InstagramIcon';

const FacebookIcon = memo(() => <Icon category="platforms" name="facebook" size={16} />);
FacebookIcon.displayName = 'FacebookIcon';

const TwitterIcon = memo(() => <Icon category="platforms" name="twitter" size={16} />);
TwitterIcon.displayName = 'TwitterIcon';

const LinkedInIcon = memo(() => <Icon category="platforms" name="linkedin" size={16} />);
LinkedInIcon.displayName = 'LinkedInIcon';

const SharepicIcon = memo(() => <Icon category="platforms" name="sharepic" size={16} />);
SharepicIcon.displayName = 'SharepicIcon';

const ActionIdeasIcon = memo(() => <Icon category="platforms" name="actionIdeas" size={16} />);
ActionIdeasIcon.displayName = 'ActionIdeasIcon';

const ReelScriptIcon = memo(() => <Icon category="platforms" name="reelScript" size={16} />);
ReelScriptIcon.displayName = 'ReelScriptIcon';

const SharepicMasterEditorModal = lazy(() =>
  import('../../../components/SharepicMasterEditorModal').then((m) => ({
    default: m.SharepicMasterEditorModal,
  }))
);

interface PresseSocialTabProps {
  isActive: boolean;
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

const PresseSocialTab: React.FC<PresseSocialTabProps> = memo(({ isActive }) => {
  const componentName = 'presse-social';
  const { initialContent } = useSharedContent();
  const { isAuthenticated } = useOptimizedAuth();
  const locale = useAuthStore((state) => state.locale);
  const userDisplayName = useAuthStore((state) => state.user?.display_name || '');
  const isAustrian = locale === 'de-AT';
  // Sharepic temporarily disabled — will return in a future update
  const canUseSharepic = false; // was: isAuthenticated && !isAustrian
  const { getBetaFeatureState } = useBetaFeatures();
  const canUseAutomatischPlanMode = getBetaFeatureState('automatischPlanMode');

  const platformOptions = useMemo(() => {
    const options = [
      { id: 'automatisch', label: 'Automatisch', icon: <AutomatischIcon /> },
      { id: 'pressemitteilung', label: 'Pressemitteilung', icon: <PressemitteilungIcon /> },
      { id: 'instagram', label: 'Instagram', icon: <InstagramIcon /> },
      { id: 'facebook', label: 'Facebook', icon: <FacebookIcon /> },
      { id: 'twitter', label: 'Twitter/X, Mastodon & Bsky', icon: <TwitterIcon /> },
      { id: 'linkedin', label: 'LinkedIn', icon: <LinkedInIcon /> },
      // Sharepic temporarily disabled — will return in a future update
      // { id: 'sharepic', label: 'Sharepic', icon: <SharepicIcon /> },
      { id: 'actionIdeas', label: 'Aktionsideen', icon: <ActionIdeasIcon /> },
      { id: 'reelScript', label: 'Skript für Reels & Tiktoks', icon: <ReelScriptIcon /> },
    ];
    let filtered = options;
    if (!canUseAutomatischPlanMode) {
      filtered = filtered.filter((opt) => opt.id !== 'automatisch');
    }
    return filtered;
  }, [canUseAutomatischPlanMode]);

  const platformTags = useMemo(() => {
    const tags = [
      {
        icon: <PressemitteilungIcon />,
        label: 'Pressemitteilung',
        platforms: ['pressemitteilung'],
      },
      { icon: <InstagramIcon />, label: 'Instagram', platforms: ['instagram'] },
      { icon: <FacebookIcon />, label: 'Facebook', platforms: ['facebook'] },
      { icon: <TwitterIcon />, label: 'X/bsky/Mastodon', platforms: ['twitter'] },
      { icon: <LinkedInIcon />, label: 'LinkedIn', platforms: ['linkedin'] },
      // Sharepic temporarily disabled
      // { icon: <SharepicIcon />, label: 'Sharepic', platforms: ['sharepic'] },
      { icon: <ActionIdeasIcon />, label: 'Aktionen', platforms: ['actionIdeas'] },
      { icon: <ReelScriptIcon />, label: 'Reel', platforms: ['reelScript'] },
    ];
    return tags;
  }, []);

  const sharepicTypeOptions = useMemo(
    () => [
      { value: 'default', label: 'Standard (3 Sharepics automatisch)' },
      { value: 'dreizeilen', label: '3-Zeilen Slogan (mit Bild)' },
      { value: 'quote', label: 'Zitat mit Bild' },
      { value: 'quote_pure', label: 'Zitat ohne Bild' },
      { value: 'info', label: 'Infopost' },
    ],
    []
  );

  const defaultPlatforms = useMemo(() => {
    let selectedPlatforms: string[] = canUseAutomatischPlanMode ? ['automatisch'] : ['instagram'];
    const typedInitialContent = initialContent as
      | { platforms?: Record<string, boolean>; isFromSharepic?: boolean }
      | undefined;
    if (typedInitialContent?.platforms) {
      selectedPlatforms = Object.keys(typedInitialContent.platforms).filter(
        (key) => typedInitialContent.platforms?.[key]
      );
      if (selectedPlatforms.length > 0) {
        let filtered = selectedPlatforms.filter((p) => p !== 'sharepic');
        if (!canUseAutomatischPlanMode) {
          filtered = filtered.filter((p) => p !== 'automatisch');
        }
        return filtered;
      }
    }
    if (typedInitialContent?.isFromSharepic) {
      selectedPlatforms = ['instagram'];
    }
    let filtered = selectedPlatforms;
    if (!canUseAutomatischPlanMode) {
      filtered = filtered.filter((p) => p !== 'automatisch');
    }
    return filtered;
  }, [initialContent, canUseAutomatischPlanMode]);

  const typedInitialContent = initialContent as
    | { inhalt?: string; thema?: string; zitatgeber?: string }
    | undefined;
  const form = useBaseForm({
    defaultValues: {
      inhalt: typedInitialContent?.inhalt || typedInitialContent?.thema || '',
      zitatgeber: typedInitialContent?.zitatgeber || '',
      platforms: defaultPlatforms,
      sharepicType: 'default',
      zitatAuthor: '',
    } as Record<string, unknown>,
    shouldUnregister: false,
    generatorType: 'presse-social' as never,
    componentName: 'presse-social' as never,
    endpoint: '/claude_social' as never,
    instructionType: 'social' as never,
    features: ['webSearch', 'privacyMode', 'proMode'] as never,
    tabIndexKey: 'PRESS_SOCIAL' as never,
    defaultMode: 'balanced' as never,
    disableKnowledgeSystem: false,
  }) as unknown as {
    control: Control<Record<string, unknown>>;
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

  const typedControl = control as unknown as Control<{
    platforms: string[];
    inhalt: string;
  }>;
  const watchPlatformsValue = useWatch({ control: typedControl, name: 'platforms' }) as unknown;
  const watchPlatforms: string[] = (
    Array.isArray(watchPlatformsValue) ? watchPlatformsValue : defaultPlatforms
  ) as string[];
  const watchInhalt: string = ((useWatch({ control: typedControl, name: 'inhalt' }) as unknown) ??
    '') as string;

  const watchPressemitteilung =
    Array.isArray(watchPlatforms) && watchPlatforms.includes('pressemitteilung');

  usePlatformAutoDetect({
    content: watchInhalt,
    currentPlatforms: watchPlatforms,
    validPlatformIds: [...platformOptions.map((p) => p.id)],
    onPlatformsDetected: (newPlatforms: string[]) => setValue('platforms', newPlatforms),
  } as Parameters<typeof usePlatformAutoDetect>[0]);

  const socialMediaFormRef = useRef<SocialMediaFormRef>(null);
  const pressemitteilungFormRef = useRef<PressemitteilungFormRef>(null);
  const sharepicFormRef = useRef<SharepicFormRef>(null);

  const [socialMediaContent, setSocialMediaContent] = useState<string | GeneratedContentResult>('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [processedAttachments, setProcessedAttachments] = useState<unknown[]>([]);
  const [editingSharepic, setEditingSharepic] = useState<SharepicDataItem | null>(null);
  const [editingSharepicIndex, setEditingSharepicIndex] = useState<number>(-1);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string | string[]>>({});

  const planMode = usePlanModeWorkflow();

  const setup = useGeneratorSetup({
    instructionType: 'social',
    componentName: 'presse-social',
  });

  const { crawledUrls, detectAndCrawlUrls, isCrawling } = useUrlCrawler();

  const allAttachments = useMemo(
    () => [...processedAttachments, ...crawledUrls],
    [processedAttachments, crawledUrls]
  );

  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: ['inhalt', 'zitatgeber'],
  });

  const submitHandler = usePresseSocialSubmit({
    features: setup.features,
    selectedDocumentIds: setup.selectedDocumentIds,
    selectedTextIds: setup.selectedTextIds,
    attachments: allAttachments,
    canUseSharepic,
  });

  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();
  const storeGeneratedText = useGeneratedTextStore((state) =>
    state.getGeneratedText(componentName)
  );

  const hasGeneratedContent = !!(storeGeneratedText || socialMediaContent);

  const handleUrlsDetected = useCallback(
    async (urls: string[]) => {
      if (!isCrawling && urls.length > 0) {
        await detectAndCrawlUrls(urls.join(' '), setup.features.usePrivacyMode);
      }
    },
    [detectAndCrawlUrls, isCrawling, setup.features.usePrivacyMode]
  );

  const onSubmitRHF = useCallback(
    async (rhfData: Record<string, unknown>) => {
      setStoreIsLoading(true);

      try {
        const socialData = socialMediaFormRef.current?.getFormData();
        const presseData = pressemitteilungFormRef.current?.getFormData();

        if (!socialData) {
          setStoreIsLoading(false);
          return;
        }

        const platforms = (
          Array.isArray(rhfData.platforms) ? (rhfData.platforms as string[]) : []
        ).filter((p) => p !== 'sharepic');

        if (platforms.length === 0) {
          setStoreIsLoading(false);
          return;
        }

        const combinedFormData: PresseSocialFormData = {
          inhalt: socialData.inhalt,
          platforms: platforms,
          zitatgeber: presseData?.zitatgeber || '',
          sharepicType: 'default',
          zitatAuthor: '',
          uploadedImage: null,
        };

        if (combinedFormData.platforms.includes('automatisch')) {
          await planMode.initiatePlan({
            generatorType: 'pr' as 'antrag',
            inhalt: combinedFormData.inhalt,
            useWebSearch: setup.features.useWebSearchTool,
            usePrivacyMode: setup.features.usePrivacyMode,
            selectedDocumentIds: Array.from(setup.selectedDocumentIds || []),
            selectedTextIds: Array.from(setup.selectedTextIds || []),
          });
          setStoreIsLoading(false);
          return;
        }

        const result = await submitHandler.submitStandard(combinedFormData);

        if (result && (result.sharepic || result.social)) {
          const hasTextContent =
            combinedFormData.platforms.some((p: string) => p !== 'sharepic') &&
            result.social?.content;

          // Create simplified serializable version for store (no functions, no redundant social wrapper)
          const serializableContent = {
            content: hasTextContent ? result.social!.content : '',
            metadata: result.social?.metadata || {},
            selectedPlatforms: combinedFormData.platforms.filter((p: string) => p !== 'sharepic'),
            ...(result.sharepic ? { sharepic: result.sharepic } : {}),
          };

          // Full object with handler for local state only
          const finalContent: GeneratedContentResult = {
            ...serializableContent,
            onEditSharepic: async () => {},
          };

          setSocialMediaContent(finalContent);
          setGeneratedText(componentName, serializableContent, serializableContent.metadata);
        }
      } catch (error) {
        console.error('[PresseSocialTab] Error submitting form:', error);
      } finally {
        setStoreIsLoading(false);
      }
    },
    [
      submitHandler,
      setStoreIsLoading,
      setGeneratedText,
      componentName,
      planMode,
      setup.features,
      setup.selectedDocumentIds,
      setup.selectedTextIds,
    ]
  );

  const handleAttachmentClick = useCallback((files?: File[]) => {
    if (!files || files.length === 0) return;

    (async () => {
      try {
        const processed = await prepareFilesForSubmission(files);
        setAttachedFiles((prevFiles) => [...prevFiles, ...files]);
        setProcessedAttachments((prevProcessed) => [...prevProcessed, ...processed]);
      } catch (error) {
        console.error('[PresseSocialTab] File processing error:', error);
      }
    })();
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
    setProcessedAttachments((prevProcessed) => prevProcessed.filter((_, i) => i !== index));
  }, []);

  const handleOpenInlineEditor = useCallback((sharepicData: SharepicDataItem, index: number) => {
    setEditingSharepic(sharepicData);
    setEditingSharepicIndex(index);
  }, []);

  const handleEditSharepic = useCallback(
    (sharepicData: unknown) => {
      const currentContent = storeGeneratedText || socialMediaContent;
      if (currentContent && typeof currentContent === 'object' && 'sharepic' in currentContent) {
        const sharepics = currentContent.sharepic as SharepicDataItem[];
        const index = sharepics.findIndex(
          (s) => s === sharepicData || s.id === (sharepicData as SharepicDataItem).id
        );
        handleOpenInlineEditor(sharepicData as SharepicDataItem, index >= 0 ? index : 0);
      } else {
        handleOpenInlineEditor(sharepicData as SharepicDataItem, 0);
      }
    },
    [storeGeneratedText, socialMediaContent, handleOpenInlineEditor]
  );

  const handleEditorExport = useCallback(
    (base64Image: string) => {
      const currentContent = storeGeneratedText || socialMediaContent;
      if (
        currentContent &&
        typeof currentContent === 'object' &&
        'sharepic' in currentContent &&
        editingSharepicIndex >= 0
      ) {
        const sharepics = [...((currentContent.sharepic as SharepicDataItem[]) || [])];
        if (sharepics[editingSharepicIndex]) {
          sharepics[editingSharepicIndex] = {
            ...sharepics[editingSharepicIndex],
            image: base64Image,
          };
          const updatedContent = { ...currentContent, sharepic: sharepics };
          setSocialMediaContent(updatedContent as GeneratedContentResult);
          setGeneratedText(
            componentName,
            updatedContent,
            (updatedContent as GeneratedContentResult).metadata
          );
        }
      }
      setEditingSharepic(null);
      setEditingSharepicIndex(-1);
    },
    [editingSharepicIndex, storeGeneratedText, socialMediaContent, setGeneratedText, componentName]
  );

  const handleEditorCancel = useCallback(() => {
    setEditingSharepic(null);
    setEditingSharepicIndex(-1);
  }, []);

  const handleAnswerChange = useCallback((questionId: string, answer: string | string[]) => {
    setQuestionAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }, []);

  const handleQuestionSubmit = useCallback(async () => {
    if (planMode.state.workflowId) {
      await planMode.submitAnswers(planMode.state.workflowId, questionAnswers);
    }
  }, [planMode, questionAnswers]);

  const handleGenerateProduction = useCallback(async () => {
    if (planMode.state.workflowId) {
      const result = await planMode.generateProduction(planMode.state.workflowId);
      if (result?.production_data?.content) {
        setSocialMediaContent(result.production_data.content);
        setGeneratedText(componentName, result.production_data.content, {});
      }
    }
  }, [planMode, setGeneratedText, componentName]);

  const handleRequestQuestions = useCallback(() => {
    planMode.startAnswering();
  }, [planMode]);

  const handlePlanModeReset = useCallback(() => {
    planMode.reset();
    setQuestionAnswers({});
    setSocialMediaContent('');
  }, [planMode]);

  const handleStartCorrections = useCallback(() => {
    planMode.startCorrections();
  }, [planMode]);

  const handleSubmitCorrections = useCallback(
    async (corrections: string) => {
      if (planMode.state.workflowId) {
        await planMode.submitCorrections(planMode.state.workflowId, corrections);
      }
    },
    [planMode]
  );

  const handleCancelCorrections = useCallback(() => {
    planMode.cancelCorrections();
  }, [planMode]);

  const watchAutomatisch = Array.isArray(watchPlatforms) && watchPlatforms.includes('automatisch');
  const isPlanModeActive = watchAutomatisch && planMode.state.status !== 'idle';
  const showFormInputs = !isPlanModeActive || planMode.state.status === 'error';

  const displayContent = useMemo(() => {
    if (watchAutomatisch && planMode.state.status !== 'idle') {
      const { status, plan, revisedPlan, correctedPlan, production } = planMode.state;

      if (status === 'completed' && production) {
        return {
          content: production,
          title: null,
          metadata: {},
          useMarkdown: false,
        };
      }

      const showPlanStates = ['plan_generated', 'answering_questions', 'providing_corrections'];
      if (showPlanStates.includes(status) && (plan || revisedPlan || correctedPlan)) {
        const displayPlan = correctedPlan || revisedPlan || plan;
        let planTitle = '📋 Strategischer Plan';
        if (correctedPlan) {
          planTitle = '✏️ Korrigierter Plan';
        } else if (revisedPlan) {
          planTitle = '📝 Verfeinerter Plan';
        }
        return {
          content: `## ${planTitle}\n\n${displayPlan}`,
          title: null,
          metadata: {},
          useMarkdown: true,
        };
      }
    }
    return null;
  }, [watchAutomatisch, planMode.state]);

  const getSubmitButtonText = useCallback(() => {
    if (!watchAutomatisch || planMode.state.status === 'idle') return 'Grünerieren';

    switch (planMode.state.status) {
      case 'generating_plan':
        return 'Plan wird erstellt...';
      case 'revising_plan':
        return 'Plan wird verfeinert...';
      case 'generating_production':
        return 'Wird generiert...';
      default:
        return 'Grünerieren';
    }
  }, [watchAutomatisch, planMode.state.status]);

  const generatedContentWithHandler = useMemo((): GeneratedContentResult | string | null => {
    let content: unknown = storeGeneratedText || socialMediaContent;

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
      return {
        ...(content as GeneratedContentResult),
        onEditSharepic: async (data: unknown) => {
          handleEditSharepic(data);
        },
      };
    }
    return content as string | null;
  }, [storeGeneratedText, socialMediaContent, handleEditSharepic]);

  const { activeTip } = useFormTips({ hasPressemitteilung: watchPressemitteilung }, {});

  const handlePlatformTagClick = useCallback(
    (tag: { platforms?: string[] }) => {
      const platformId = tag.platforms?.[0];
      if (!platformId) return;

      const currentPlatforms = watchPlatforms || [];
      const isSelected = currentPlatforms.includes(platformId);

      if (isSelected) {
        setValue(
          'platforms',
          currentPlatforms.filter((p) => p !== platformId)
        );
      } else {
        setValue('platforms', [...currentPlatforms, platformId]);
      }
    },
    [watchPlatforms, setValue]
  );

  const renderPlanModeContent = () => {
    const { status, plan, revisedPlan, correctedPlan, questions, correctionSummary } =
      planMode.state;

    if (status === 'plan_generated' && (plan || revisedPlan || correctedPlan)) {
      const hasQuestions = questions && questions.length > 0;

      let statusMessage = 'Dein strategischer Plan wurde erstellt. Wie möchtest du fortfahren?';
      if (correctedPlan) {
        statusMessage = correctionSummary
          ? `Der Plan wurde korrigiert (${correctionSummary}). Wie möchtest du fortfahren?`
          : 'Der Plan wurde korrigiert. Wie möchtest du fortfahren?';
      } else if (revisedPlan) {
        statusMessage = 'Der Plan wurde verfeinert. Wie möchtest du fortfahren?';
      }

      return (
        <div className="plan-mode-actions">
          <p style={{ marginBottom: '1rem', color: 'var(--font-color-secondary)' }}>
            {statusMessage}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-primary size-m"
              onClick={handleGenerateProduction}
              disabled={planMode.isLoading}
            >
              Jetzt generieren
            </button>
            <button
              type="button"
              className="btn-secondary size-m"
              onClick={handleStartCorrections}
              disabled={planMode.isLoading}
            >
              Plan korrigieren
            </button>
            {hasQuestions && (
              <button
                type="button"
                className="btn-secondary size-m"
                onClick={handleRequestQuestions}
                disabled={planMode.isLoading}
              >
                Fragen beantworten
              </button>
            )}
            <button
              type="button"
              className="btn-ghost size-m"
              onClick={handlePlanModeReset}
              disabled={planMode.isLoading}
            >
              Neu starten
            </button>
          </div>
        </div>
      );
    }

    if (status === 'providing_corrections') {
      return (
        <CorrectionSection
          onSubmit={handleSubmitCorrections}
          onCancel={handleCancelCorrections}
          loading={false}
        />
      );
    }

    if (status === 'answering_questions' && questions && questions.length > 0) {
      return (
        <QuestionAnswerSection
          questions={questions}
          answers={questionAnswers}
          onAnswerChange={handleAnswerChange}
          onSubmit={handleQuestionSubmit}
          loading={planMode.state.status === 'revising_plan'}
          submitButtonProps={{ defaultText: 'Plan verfeinern' }}
        />
      );
    }

    if (
      [
        'generating_plan',
        'revising_plan',
        'applying_corrections',
        'generating_production',
      ].includes(status)
    ) {
      let loadingText = getSubmitButtonText();
      if (status === 'applying_corrections') {
        loadingText = 'Korrekturen werden angewendet...';
      }
      return (
        <div className="plan-mode-loading" style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="loading-spinner" />
          <p style={{ marginTop: '1rem', color: 'var(--font-color-secondary)' }}>{loadingText}</p>
        </div>
      );
    }

    return null;
  };

  const helpContent = useMemo(
    () => ({
      content: 'Erstelle professionelle Pressemitteilungen und Social Media Inhalte',
      tips: [
        'Beschreibe dein Thema und alle relevanten Details im Inhalt-Feld',
        'Wähle die gewünschten Formate aus',
        'Bei Pressemitteilungen: Angabe von Zitatgeber erforderlich',
      ],
      features: [
        {
          title: 'Multi-Format',
          description: 'Erstelle gleichzeitig Pressemitteilungen und Social Posts',
        },
        {
          title: 'Plattform-optimiert',
          description: 'Automatisch angepasst für Instagram, Facebook, Twitter, LinkedIn & mehr',
        },
      ],
    }),
    []
  );

  return (
    <>
      <BaseForm
        useStartPageLayout={false}
        onSubmit={() => void handleSubmit(onSubmitRHF)()}
        loading={submitHandler.loading || planMode.isLoading}
        success={false}
        error={planMode.state.error || submitHandler.error}
        showNextButton={!isPlanModeActive || planMode.state.status === 'idle'}
        generatedContent={
          displayContent?.content || (generatedContentWithHandler as GeneratedContent)
        }
        useMarkdown={displayContent?.useMarkdown ?? false}
        enableKnowledgeSelector={true}
        helpContent={helpContent}
        componentName={componentName}
        useFeatureIcons={true}
        onAttachmentClick={handleAttachmentClick}
        onRemoveFile={handleRemoveFile}
        attachedFiles={attachedFiles}
        featureIconsTabIndex={{
          webSearch: (form.generator?.tabIndex as Record<string, number> | undefined)?.webSearch,
          privacyMode: (form.generator?.tabIndex as Record<string, number> | undefined)
            ?.privacyMode,
          attachment: (form.generator?.tabIndex as Record<string, number> | undefined)?.attachment,
        }}
        knowledgeSelectorTabIndex={
          (form.generator?.baseFormTabIndex as Record<string, number> | undefined)
            ?.knowledgeSelectorTabIndex
        }
        knowledgeSourceSelectorTabIndex={
          (form.generator?.baseFormTabIndex as Record<string, number> | undefined)
            ?.knowledgeSourceSelectorTabIndex
        }
        submitButtonTabIndex={
          (form.generator?.baseFormTabIndex as Record<string, number> | undefined)
            ?.submitButtonTabIndex
        }
        contextualTip={activeTip}
        examplePrompts={platformTags as ExamplePrompt[]}
        onExamplePromptClick={handlePlatformTagClick as (prompt: ExamplePrompt) => void}
        selectedPlatforms={watchPlatforms}
        nextButtonText={getSubmitButtonText()}
        hideFormExtras={isPlanModeActive && planMode.state.status !== 'idle'}
        firstExtrasChildren={
          isPlanModeActive && planMode.state.status !== 'idle' ? (
            renderPlanModeContent()
          ) : (
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
            </>
          )
        }
      >
        {showFormInputs ? (
          <>
            <SocialMediaForm
              ref={socialMediaFormRef}
              defaultValues={{
                inhalt: typedInitialContent?.inhalt || typedInitialContent?.thema || '',
              }}
              tabIndex={{
                inhalt: form.generator?.tabIndex?.inhalt,
              }}
              onUrlsDetected={handleUrlsDetected}
            />
            <AnimatePresence>
              {watchPressemitteilung && !hasGeneratedContent && (
                <PressemitteilungForm
                  ref={pressemitteilungFormRef}
                  defaultValues={{
                    zitatgeber: typedInitialContent?.zitatgeber || userDisplayName,
                  }}
                  tabIndex={{
                    zitatgeber: (form.generator?.tabIndex as Record<string, number> | undefined)
                      ?.zitatgeber,
                  }}
                  isVisible={watchPressemitteilung}
                  success={false}
                />
              )}
            </AnimatePresence>
            {/* Sharepic temporarily disabled */}
          </>
        ) : (
          renderPlanModeContent()
        )}
      </BaseForm>

      {/* SharepicMasterEditorModal temporarily disabled */}
    </>
  );
});

PresseSocialTab.displayName = 'PresseSocialTab';

export default PresseSocialTab;

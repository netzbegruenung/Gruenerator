import { useCallback } from 'react';
import useSharepicGeneration from '../../../../hooks/useSharepicGeneration';
import useApiSubmit from '../../../../components/hooks/useApiSubmit';
import { usePRWorkflow } from '../../../pr-agent/hooks/usePRWorkflow';
import type { SocialMediaFormData } from '../components/SocialMediaForm';
import type { PressemitteilungFormData } from '../components/PressemitteilungForm';
import type { SharepicFormData } from '../components/SharepicForm';
import type { FeatureState } from '../../../../hooks/useGeneratorSetup';

/**
 * Combined form data from all child forms
 */
export interface PresseSocialFormData
  extends SocialMediaFormData,
    Partial<PressemitteilungFormData>,
    Partial<SharepicFormData> {}

/**
 * Configuration for submission hook
 */
interface SubmissionConfig {
  /**
   * Feature state flags
   */
  features: FeatureState;

  /**
   * User's custom prompt
   */
  customPrompt: string | null;

  /**
   * Selected document IDs
   */
  selectedDocumentIds: readonly string[];

  /**
   * Selected text IDs
   */
  selectedTextIds: readonly string[];

  /**
   * File attachments and crawled URLs
   */
  attachments: readonly unknown[];

  /**
   * Whether user can use sharepic feature
   */
  canUseSharepic: boolean;
}

/**
 * Result from parallel generation
 */
interface GenerationResult {
  sharepic?: unknown[];
  social?: {
    content: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Return value from submission hook
 */
interface SubmitReturn {
  /**
   * Submit handler for "automatisch" PR-Paket workflow
   * Returns strategy for approval
   */
  submitPRWorkflow: (
    formData: PresseSocialFormData
  ) => Promise<{ strategy: unknown } | null>;

  /**
   * Submit handler for standard social media generation
   * Executes sharepic and social content in parallel
   */
  submitStandard: (
    formData: PresseSocialFormData
  ) => Promise<GenerationResult | null>;

  /**
   * Generate production content after PR approval
   */
  generateProduction: (
    workflowId: string,
    platforms: string[]
  ) => Promise<{
    content: Record<string, string>;
    metadata: Record<string, unknown>;
    sharepics: unknown[];
  } | null>;

  /**
   * Whether any generation is in progress
   */
  loading: boolean;

  /**
   * Error from generation
   */
  error: { message: string } | null;

  /**
   * PR workflow state
   */
  prWorkflow: ReturnType<typeof usePRWorkflow>;
}

/**
 * Custom hook for PresseSocial submission logic
 *
 * Consolidates all submission handlers:
 * - PR-Paket workflow (automatisch mode)
 * - Parallel sharepic + social generation
 * - Production content generation after approval
 *
 * Extracted from PresseSocialGenerator for separation of concerns.
 *
 * @example
 * ```typescript
 * const submit = usePresseSocialSubmit({
 *   features,
 *   customPrompt,
 *   selectedDocumentIds,
 *   selectedTextIds,
 *   attachments,
 *   canUseSharepic
 * });
 *
 * const handleSubmit = async (formData: PresseSocialFormData) => {
 *   if (formData.platforms.includes('automatisch')) {
 *     const result = await submit.submitPRWorkflow(formData);
 *     // Handle approval UI
 *   } else {
 *     const result = await submit.submitStandard(formData);
 *     // Handle generated content
 *   }
 * };
 * ```
 */
export function usePresseSocialSubmit(
  config: SubmissionConfig
): SubmitReturn {
  const { submitForm, loading: socialLoading, error: socialError } = useApiSubmit('/claude_social');
  const { generateSharepic, loading: sharepicLoading } = useSharepicGeneration();
  const prWorkflow = usePRWorkflow();

  /**
   * Submit PR-Paket workflow
   * Phase 1: Generate strategy for approval
   */
  const submitPRWorkflow = useCallback(
    async (formData: PresseSocialFormData) => {
      try {
        const result = await prWorkflow.generateStrategy({
          inhalt: formData.inhalt,
          useWebSearchTool: config.features.useWebSearchTool,
          selectedDocumentIds: Array.from(config.selectedDocumentIds),
          selectedTextIds: Array.from(config.selectedTextIds)
        });

        return result;
      } catch (error) {
        console.error('[usePresseSocialSubmit] PR workflow failed:', error);
        return null;
      }
    },
    [prWorkflow, config.features, config.selectedDocumentIds, config.selectedTextIds]
  );

  /**
   * Submit standard social media generation
   * Executes sharepic and social content in PARALLEL
   */
  const submitStandard = useCallback(
    async (formData: PresseSocialFormData): Promise<GenerationResult | null> => {
      try {
        const hasSharepic = config.canUseSharepic && formData.platforms.includes('sharepic');
        const otherPlatforms = formData.platforms.filter((p: string) => p !== 'sharepic');

        // Build submission data
        const submissionData = {
          inhalt: formData.inhalt,
          platforms: otherPlatforms,
          zitatgeber: formData.zitatgeber || '',
          ...config.features,
          attachments: config.attachments,
          customPrompt: config.customPrompt,
          selectedDocumentIds: Array.from(config.selectedDocumentIds),
          selectedTextIds: Array.from(config.selectedTextIds),
          searchQuery: buildSearchQuery(formData)
        };

        const combinedResults: GenerationResult = {};
        const generationPromises: Promise<{
          type: string;
          result?: unknown;
          error?: unknown;
        }>[] = [];

        // Prepare sharepic generation promise
        if (hasSharepic) {
          type SharepicType = 'default' | 'quote' | 'quote_pure' | 'info' | 'headline' | 'dreizeilen';

          generationPromises.push(
            generateSharepic(
              formData.inhalt,
              '', // details merged into inhalt
              formData.uploadedImage || null,
              (formData.sharepicType || 'default') as SharepicType,
              formData.zitatAuthor || '',
              config.customPrompt,
              config.attachments as Array<{ type: string; data: string }>,
              config.features.usePrivacyMode,
              null,
              config.features.useBedrock
            )
              .then(result => ({ type: 'sharepic' as const, result }))
              .catch(error => ({ type: 'sharepic' as const, error }))
          );
        }

        // Prepare social generation promise
        if (otherPlatforms.length > 0) {
          generationPromises.push(
            submitForm(submissionData)
              .then(result => ({ type: 'social', result }))
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
            let newSharepicEntries: SharepicEntry[];

            if (Array.isArray(sharepicResult)) {
              newSharepicEntries = sharepicResult.map((sharepic: SharepicEntry) => ({
                ...sharepic,
                id: sharepic.id || `sharepic-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                createdAt: sharepic.createdAt || new Date().toISOString()
              }));
            } else {
              newSharepicEntries = [
                {
                  ...sharepicResult,
                  id: `sharepic-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                  createdAt: new Date().toISOString()
                }
              ];
            }

            combinedResults.sharepic = newSharepicEntries;
          } else if (outcome.type === 'sharepic' && outcome.error) {
            console.error('[usePresseSocialSubmit] Sharepic generation failed:', outcome.error);
          }

          if (outcome.type === 'social' && !outcome.error && outcome.result) {
            const response = outcome.result as
              | { content?: string; metadata?: Record<string, unknown> }
              | string;
            let content =
              typeof response === 'string'
                ? response
                : (response as { content?: string }).content || '';
            const metadata =
              typeof response === 'object' && response !== null
                ? (response as { metadata?: Record<string, unknown> }).metadata || {}
                : {};

            // Append presseabbinder if provided
            if (otherPlatforms.includes('pressemitteilung') && formData.presseabbinder?.trim()) {
              content = `${content}\n\n---\n\n${formData.presseabbinder.trim()}`;
            }

            combinedResults.social = { content, metadata };
          } else if (outcome.type === 'social' && outcome.error) {
            console.error('[usePresseSocialSubmit] Social generation failed:', outcome.error);
          }
        }

        return combinedResults;
      } catch (error) {
        console.error('[usePresseSocialSubmit] Standard submission failed:', error);
        return null;
      }
    },
    [
      submitForm,
      generateSharepic,
      config.canUseSharepic,
      config.features,
      config.attachments,
      config.customPrompt,
      config.selectedDocumentIds,
      config.selectedTextIds
    ]
  );

  /**
   * Generate production content after PR approval
   * Phase 2: Generate platform-specific content
   */
  const generateProduction = useCallback(
    async (workflowId: string, platforms: string[]) => {
      try {
        const result = await prWorkflow.generateProduction(workflowId, platforms);
        return result;
      } catch (error) {
        console.error('[usePresseSocialSubmit] Production generation failed:', error);
        return null;
      }
    },
    [prWorkflow]
  );

  return {
    submitPRWorkflow,
    submitStandard,
    generateProduction,
    loading: socialLoading || sharepicLoading || prWorkflow.state.status === 'generating_strategy',
    error: (socialError as unknown as { message: string } | null) || (prWorkflow.state.error ? { message: prWorkflow.state.error } : null),
    prWorkflow
  };
}

/**
 * Helper: Build search query from form data
 */
function buildSearchQuery(formData: PresseSocialFormData): string {
  const queryParts: string[] = [];

  if (formData.inhalt) queryParts.push(formData.inhalt);
  if (formData.zitatgeber) queryParts.push(formData.zitatgeber);

  return queryParts.filter(part => part && part.trim()).join(' ');
}

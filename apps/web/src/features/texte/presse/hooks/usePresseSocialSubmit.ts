import { useCallback } from 'react';

import useApiSubmit from '../../../../components/hooks/useApiSubmit';

import type { FeatureState } from '../../../../hooks/useGeneratorSetup';

/**
 * Combined form data from all child forms
 */
export interface PresseSocialFormData {
  inhalt: string;
  platforms: string[];
  zitatgeber?: string;
}

interface SubmissionConfig {
  features: FeatureState;
  selectedDocumentIds: readonly string[];
  selectedTextIds: readonly string[];
  attachments: readonly unknown[];
  externalSubmitForm?: (formData: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

interface GenerationResult {
  social?: {
    content: string;
    metadata?: Record<string, unknown>;
  };
}

interface SubmitReturn {
  submitStandard: (formData: PresseSocialFormData) => Promise<GenerationResult | null>;
  submitAgentMode: (formData: PresseSocialFormData) => Promise<GenerationResult | null>;
  loading: boolean;
  error: { message: string } | null;
}

/**
 * Custom hook for PresseSocial submission logic.
 *
 * Handles two submission paths:
 * - Standard: direct social media content generation
 * - Agent Mode: research → strategy → platform generation
 */
export function usePresseSocialSubmit(config: SubmissionConfig): SubmitReturn {
  const internalApi = useApiSubmit('/claude_social');
  const agentApi = useApiSubmit('/claude_social/agent');
  const socialSubmitForm = config.externalSubmitForm || internalApi.submitForm;
  const socialLoading = config.externalSubmitForm ? false : internalApi.loading;
  const socialError = config.externalSubmitForm ? null : internalApi.error;

  const submitStandard = useCallback(
    async (formData: PresseSocialFormData): Promise<GenerationResult | null> => {
      try {
        const submissionData = {
          inhalt: formData.inhalt,
          platforms: formData.platforms,
          zitatgeber: formData.zitatgeber || '',
          ...config.features,
          attachments: config.attachments,
          selectedDocumentIds: Array.from(config.selectedDocumentIds),
          selectedTextIds: Array.from(config.selectedTextIds),
          searchQuery: buildSearchQuery(formData),
        };

        const result = await socialSubmitForm(submissionData);
        return parseSocialResult(result);
      } catch (error) {
        console.error('[usePresseSocialSubmit] Standard submission failed:', error);
        return null;
      }
    },
    [
      socialSubmitForm,
      config.features,
      config.attachments,
      config.selectedDocumentIds,
      config.selectedTextIds,
    ]
  );

  const submitAgentMode = useCallback(
    async (formData: PresseSocialFormData): Promise<GenerationResult | null> => {
      try {
        if (formData.platforms.length === 0) return null;

        const submissionData = {
          inhalt: formData.inhalt,
          platforms: formData.platforms,
          zitatgeber: formData.zitatgeber || '',
          ...config.features,
          attachments: config.attachments,
          selectedDocumentIds: Array.from(config.selectedDocumentIds),
          selectedTextIds: Array.from(config.selectedTextIds),
          searchQuery: buildSearchQuery(formData),
          agentMode: true,
        };

        const result = await agentApi.submitForm(submissionData);
        return parseSocialResult(result);
      } catch (error) {
        console.error('[usePresseSocialSubmit] Agent mode failed:', error);
        return null;
      }
    },
    [
      agentApi,
      config.features,
      config.attachments,
      config.selectedDocumentIds,
      config.selectedTextIds,
    ]
  );

  return {
    submitStandard,
    submitAgentMode,
    loading: socialLoading || agentApi.loading,
    error: socialError as unknown as { message: string } | null,
  };
}

function parseSocialResult(result: unknown): GenerationResult {
  const response = result as { content?: string; metadata?: Record<string, unknown> } | string;
  const content =
    typeof response === 'string' ? response : (response as { content?: string }).content || '';
  const metadata =
    typeof response === 'object' && response !== null
      ? (response as { metadata?: Record<string, unknown> }).metadata || {}
      : {};
  return { social: { content, metadata } };
}

function buildSearchQuery(formData: PresseSocialFormData): string {
  const queryParts: string[] = [];
  if (formData.inhalt) queryParts.push(formData.inhalt);
  if (formData.zitatgeber) queryParts.push(formData.zitatgeber);
  return queryParts.filter((part) => part && part.trim()).join(' ');
}

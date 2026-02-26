import { useCallback } from 'react';

import useApiSubmit from '../../../../components/hooks/useApiSubmit';

import type { FeatureState } from '../../../../hooks/useGeneratorSetup';

export interface AntragFormData {
  inhalt: string;
  gliederung?: string;
  requestType: string;
}

interface AntragSubmitConfig {
  features: FeatureState;
  selectedDocumentIds: readonly string[];
  selectedTextIds: readonly string[];
  attachments: readonly unknown[];
  externalSubmitForm?: (formData: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

interface AntragSubmitReturn {
  submitStandard: (formData: AntragFormData) => Promise<{ content: string } | null>;
  submitAgentMode: (formData: AntragFormData) => Promise<{ content: string } | null>;
  loading: boolean;
  error: { message: string } | null;
}

export function useAntragSubmit(config: AntragSubmitConfig): AntragSubmitReturn {
  const agentApi = useApiSubmit('/antraege/agent');
  const standardSubmitForm = config.externalSubmitForm;

  const submitStandard = useCallback(
    async (formData: AntragFormData): Promise<{ content: string } | null> => {
      if (!standardSubmitForm) return null;

      try {
        const submissionData = {
          inhalt: formData.inhalt,
          gliederung: formData.gliederung || '',
          requestType: formData.requestType,
          ...config.features,
          attachments: config.attachments,
          selectedDocumentIds: Array.from(config.selectedDocumentIds),
          selectedTextIds: Array.from(config.selectedTextIds),
          searchQuery: [formData.inhalt, formData.gliederung].filter(Boolean).join(' '),
        };

        const result = await standardSubmitForm(submissionData);

        const content =
          typeof result === 'string' ? result : (result as { content?: string }).content || '';

        return { content };
      } catch (error) {
        console.error('[useAntragSubmit] Standard submission failed:', error);
        return null;
      }
    },
    [
      standardSubmitForm,
      config.features,
      config.attachments,
      config.selectedDocumentIds,
      config.selectedTextIds,
    ]
  );

  const submitAgentMode = useCallback(
    async (formData: AntragFormData): Promise<{ content: string } | null> => {
      try {
        const submissionData = {
          inhalt: formData.inhalt,
          gliederung: formData.gliederung || '',
          requestType: formData.requestType,
          ...config.features,
          attachments: config.attachments,
          selectedDocumentIds: Array.from(config.selectedDocumentIds),
          selectedTextIds: Array.from(config.selectedTextIds),
          searchQuery: [formData.inhalt, formData.gliederung].filter(Boolean).join(' '),
          agentMode: true,
        };

        const result = await agentApi.submitForm(submissionData);

        const content =
          typeof result === 'string' ? result : (result as { content?: string }).content || '';

        return { content };
      } catch (error) {
        console.error('[useAntragSubmit] Agent mode failed:', error);
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
    loading: agentApi.loading,
    error: agentApi.error ? { message: agentApi.error } : null,
  };
}

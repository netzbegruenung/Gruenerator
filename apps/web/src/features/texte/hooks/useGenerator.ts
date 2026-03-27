import { useState, useCallback, useMemo, useRef } from 'react';

import useFormAttachments from '../../../components/common/Form/hooks/useFormAttachments';
import useStreamingFormSubmission from '../../../components/common/Form/hooks/useStreamingFormSubmission';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';
import { useGeneratorSetup, type GeneratorSetupConfig } from '../../../hooks/useGeneratorSetup';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';

export interface UseGeneratorOptions {
  componentName: string;
  endpoint: string;
  instructionType: GeneratorSetupConfig['instructionType'];
  defaultMode?: 'balanced' | 'pro' | 'privacy' | null;
  searchQueryFields?: readonly string[];
}

export interface UseGeneratorReturn {
  prompt: string;
  setPrompt: (value: string) => void;
  submit: (extraFields?: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  abortStreaming: () => void;
  hasContent: boolean;
  attachedFiles: unknown[];
  handleAttachmentClick: (files: File[]) => Promise<void>;
  handleRemoveFile: (index: number) => void;
  crawledUrls: unknown[];
  detectAndCrawlUrls: (text: string, usePrivacyMode?: boolean) => Promise<unknown[]>;
}

const ERROR_MESSAGES: Record<string, string> = {
  '400':
    'Deine Eingabe konnte nicht verarbeitet werden. Bitte überprüfe deine Eingaben und versuche es erneut.',
  '401': 'Es gibt ein Problem mit der Verbindung zum Server. Bitte lade die Seite neu.',
  '403': 'Du hast leider keine Berechtigung für diese Aktion.',
  '413': 'Deine Eingabe ist zu lang. Bitte kürze deinen Text etwas.',
  '429':
    'Unser System wird gerade von zu vielen Nutzer*innen verwendet. Bitte warte einen Moment und versuche es dann erneut.',
  '500': 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.',
  '529':
    'Die Server unseres KI-Anbieters sind momentan überlastet. Bitte versuche es in einigen Minuten erneut.',
};

const getErrorMessage = (error: unknown): string | null => {
  if (!error) return null;
  const s =
    typeof error === 'string' ? error : error instanceof Error ? error.message : String(error);
  for (const [code, msg] of Object.entries(ERROR_MESSAGES)) {
    if (s.includes(code)) return `[Fehler ${code}] ${msg}`;
  }
  return 'Ein Fehler ist aufgetreten. Bitte versuche es später erneut.';
};

export function useGenerator({
  componentName,
  endpoint,
  instructionType,
  defaultMode = 'balanced',
  searchQueryFields = ['inhalt'],
}: UseGeneratorOptions): UseGeneratorReturn {
  const [prompt, setPrompt] = useState('');

  const activatedRef = useRef(false);
  const setActiveComponent = useGeneratorSelectionStore((s) => s.setActiveComponent);

  const setup = useGeneratorSetup({ instructionType, componentName });
  const submission = useStreamingFormSubmission(endpoint, componentName, true);
  const attachments = useFormAttachments(componentName);
  const { crawledUrls, detectAndCrawlUrls } = useUrlCrawler();

  const allAttachments = useMemo(
    () => [...attachments.processedAttachments, ...crawledUrls],
    [attachments.processedAttachments, crawledUrls]
  );

  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields,
  });

  // Use refs for values consumed at submit time — keeps the submit callback stable
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const builderRef = useRef(builder);
  builderRef.current = builder;
  const submissionRef = useRef(submission);
  submissionRef.current = submission;

  const submit = useCallback(
    async (extraFields?: Record<string, unknown>) => {
      if (!activatedRef.current) {
        setActiveComponent(componentName, defaultMode);
        activatedRef.current = true;
      }

      const sub = submissionRef.current;
      sub.setStoreIsLoading(true);
      try {
        const formData = { inhalt: promptRef.current, ...extraFields };
        const formDataToSubmit = builderRef.current.buildSubmissionData(formData);

        const response = await sub.submitForm(
          formDataToSubmit as unknown as Record<string, unknown>
        );

        if (response && componentName) {
          const content =
            typeof response === 'string' ? response : (response as Record<string, unknown>).content;
          const metadata =
            typeof response === 'object'
              ? ((response as Record<string, unknown>).metadata as
                  | Record<string, unknown>
                  | undefined)
              : undefined;
          if (content) {
            sub.setGeneratedText(componentName, content as string, metadata);
            setTimeout(sub.resetSuccess, 3000);
          }
        }
      } catch (error) {
        console.error(`[useGenerator:${componentName}] Submit error:`, error);
      } finally {
        submissionRef.current.setStoreIsLoading(false);
      }
    },
    [componentName, defaultMode, setActiveComponent]
  );

  const hasContent = useMemo(() => {
    const content = submission.generatedContent;
    if (!content) return false;
    if (typeof content === 'string') return content.trim().length > 0;
    return Object.keys(content).length > 0;
  }, [submission.generatedContent]);

  const errorMessage = useMemo(() => getErrorMessage(submission.error), [submission.error]);

  return {
    prompt,
    setPrompt,
    submit,
    isLoading: submission.loading,
    isStreaming: submission.isStreaming,
    error: errorMessage,
    abortStreaming: submission.abortStreaming,
    hasContent,
    attachedFiles: attachments.attachedFiles,
    handleAttachmentClick: attachments.handleAttachmentClick,
    handleRemoveFile: attachments.handleRemoveFile,
    crawledUrls,
    detectAndCrawlUrls,
  };
}

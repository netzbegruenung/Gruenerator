import { useCallback, useEffect, useMemo } from 'react';

import useStreamingSubmit from '../../../../hooks/useStreamingSubmit';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import useApiSubmit from '../../../hooks/useApiSubmit';

interface UseStreamingFormSubmissionReturn {
  submitForm: (formData: Record<string, unknown>) => Promise<Record<string, unknown>>;
  loading: boolean;
  success: boolean;
  error: unknown;
  resetSuccess: () => void;
  isStreaming: boolean;
  streamingText: string;
  streamingProgress: { stage: string; message: string };
  abortStreaming: () => void;
  setGeneratedText: (
    componentName: string,
    content: string | Record<string, unknown>,
    metadata?: unknown
  ) => void;
  setStoreIsLoading: (loading: boolean) => void;
  generatedContent: string | Record<string, unknown>;
  handleGeneratedContentChange: (content: string) => void;
}

const useStreamingFormSubmission = (
  endpoint: string,
  componentName: string,
  hasEndpoint: boolean
): UseStreamingFormSubmissionReturn => {
  const nonStreamingApi = useApiSubmit(hasEndpoint ? endpoint : '');
  const streamingApi = useStreamingSubmit(hasEndpoint ? endpoint : '', componentName);

  const submitForm = hasEndpoint ? streamingApi.submitForm : nonStreamingApi.submitForm;
  const loading = hasEndpoint ? streamingApi.loading : nonStreamingApi.loading;
  const success = hasEndpoint ? streamingApi.success : nonStreamingApi.success;
  const resetSuccess = hasEndpoint ? streamingApi.resetSuccess : nonStreamingApi.resetSuccess;
  const error = hasEndpoint ? streamingApi.error : nonStreamingApi.error;
  const {
    progress: streamingProgress,
    streamingText,
    isStreaming,
    abort: abortStreaming,
  } = streamingApi;

  const {
    setGeneratedText,
    setIsLoading: setStoreIsLoading,
    setIsStreaming: setStoreIsStreaming,
  } = useGeneratedTextStore();

  // Sync streaming state to store
  useEffect(() => {
    setStoreIsStreaming(isStreaming);
  }, [isStreaming, setStoreIsStreaming]);

  // Sync streaming text to store during streaming
  useEffect(() => {
    if (isStreaming && streamingText && componentName) {
      setGeneratedText(componentName, streamingText);
    }
  }, [isStreaming, streamingText, componentName, setGeneratedText]);

  // Read generated content from store — narrow selector: only re-renders when THIS component's content changes
  const generatedContent = useGeneratedTextStore(
    (state) => state.generatedTexts[componentName] ?? ''
  ) as string | Record<string, unknown>;

  const handleGeneratedContentChange = useCallback(
    (content: string) => {
      if (componentName) {
        setGeneratedText(componentName, content);
      }
    },
    [setGeneratedText, componentName]
  );

  return useMemo(
    () => ({
      submitForm,
      loading,
      success,
      error,
      resetSuccess,
      isStreaming,
      streamingText,
      streamingProgress,
      abortStreaming,
      setGeneratedText,
      setStoreIsLoading,
      generatedContent,
      handleGeneratedContentChange,
    }),
    [
      submitForm,
      loading,
      success,
      error,
      resetSuccess,
      isStreaming,
      streamingText,
      streamingProgress,
      abortStreaming,
      setGeneratedText,
      setStoreIsLoading,
      generatedContent,
      handleGeneratedContentChange,
    ]
  );
};

export default useStreamingFormSubmission;

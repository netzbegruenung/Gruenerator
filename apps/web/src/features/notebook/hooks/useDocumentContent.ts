import { useState, useCallback } from 'react';

import apiClient from '../../../components/utils/apiClient';

interface UseDocumentContentResult {
  content: string | null;
  isLoading: boolean;
  error: string | null;
  fetchContent: (documentId: string) => Promise<void>;
  reset: () => void;
}

const MAX_DISPLAY_LENGTH = 50_000;

export function useDocumentContent(): UseDocumentContentResult {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async (documentId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/auth/documents/${documentId}/content`);
      const text = response.data?.ocr_text || response.data?.content || '';
      setContent(
        text.length > MAX_DISPLAY_LENGTH
          ? text.slice(0, MAX_DISPLAY_LENGTH) + '\n\n[… Dokument gekürzt]'
          : text
      );
    } catch {
      setError('Dokument konnte nicht geladen werden');
      setContent(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setContent(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { content, isLoading, error, fetchContent, reset };
}

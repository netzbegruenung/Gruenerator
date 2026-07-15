import { getContractsClient } from '@gruenerator/shared/api';
import { useState, useCallback } from 'react';

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
      const res = await getContractsClient().documents.getContent({ params: { id: documentId } });
      if (res.status !== 200) {
        setError('Dokument konnte nicht geladen werden');
        setContent(null);
        return;
      }
      const text = res.body.data.ocr_text ?? '';
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

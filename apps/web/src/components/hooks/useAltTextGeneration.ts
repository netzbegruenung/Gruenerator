import { getContractsClient } from '@gruenerator/shared/api';
import { useCallback, useState } from 'react';

/**
 * Alt-Text-Erzeugung über den typisierten Vertragsclient.
 *
 * Vorher lief der Aufruf durch `useApiSubmit('/texte/alttext')` — einen
 * generischen Formular-Sender, dessen Antwort als `Record<string, unknown>`
 * zurückkam und beim Aufrufer per `typeof response.altText === 'string'`
 * nachgeprüft werden musste. Über den Vertrag ist `altText` ein `string`, und
 * der Fehlerfall hat einen Status statt einer geworfenen Ausnahme.
 */
export interface UseAltTextGeneration {
  loading: boolean;
  error: string | null;
  /** Liefert den Alt-Text, oder `null` wenn der Server ihn nicht erzeugen konnte. */
  generateAltTextForImage: (
    imageBase64: string,
    imageDescription?: string | null
  ) => Promise<string | null>;
  reset: () => void;
}

export function useAltTextGeneration(): UseAltTextGeneration {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateAltTextForImage = useCallback(
    async (imageBase64: string, imageDescription: string | null = null): Promise<string | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await getContractsClient().texte.generateAltText({
          body: { imageBase64, imageDescription },
        });
        if (result.status === 200) return result.body.altText;

        // Randcast: ts-rest engt `body` nur für die im Vertrag aufgeführten
        // Status ein — ein 502 vom Reverse-Proxy landet hier als `unknown`.
        const body = result.body as { error?: string } | null;
        setError(body?.error ?? `Alt-Text fehlgeschlagen (HTTP ${result.status}).`);
        return null;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Alt-Text konnte nicht erzeugt werden.');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setError(null);
    setLoading(false);
  }, []);

  return { loading, error, generateAltTextForImage, reset };
}

export default useAltTextGeneration;

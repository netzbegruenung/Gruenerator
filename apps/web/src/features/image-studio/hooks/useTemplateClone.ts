import { getContractsClient } from '@gruenerator/shared/api';
import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// ── API response shapes ────────────────────────────────────────────────

interface TemplateMetadata {
  content?: Record<string, unknown>;
  styling?: Record<string, unknown>;
}

interface Template {
  image_type?: string;
  template_creator_name?: string;
  image_metadata?: TemplateMetadata;
}

interface TemplateCloneResult {
  cloneTemplate: (shareToken: string) => Promise<void>;
  isCloning: boolean;
  error: string | null;
}

/** Map a non-200 template response status to the user-facing German message. */
function templateErrorMessage(status: number): string {
  if (status === 404) return 'Vorlage nicht gefunden';
  if (status === 403) return 'Kein Zugriff auf diese Vorlage';
  if (status === 401) return 'Bitte melde dich an, um diese Vorlage zu verwenden';
  return 'Vorlage konnte nicht geladen werden.';
}

export function useTemplateClone(): TemplateCloneResult {
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const cloneInProgressRef = useRef<string | null>(null);

  const cloneTemplate = useCallback(
    async (shareToken: string) => {
      if (cloneInProgressRef.current === shareToken) {
        return;
      }
      cloneInProgressRef.current = shareToken;

      setIsCloning(true);
      setError(null);

      try {
        const client = getContractsClient();
        const templateResponse = await client.sharesRead.getTemplate({ params: { shareToken } });
        if (templateResponse.status !== 200) {
          throw new Error(templateErrorMessage(templateResponse.status));
        }
        // Contract types `template` as unknown (templates are heterogeneous);
        // narrow to the fields this clone flow reads.
        const template = (templateResponse.body.template ?? {}) as Template;

        const cloneResponse = await client.sharesRead.cloneTemplate({
          params: { shareToken },
          body: {},
        });
        if (cloneResponse.status !== 200) {
          throw new Error(templateErrorMessage(cloneResponse.status));
        }
        const share = cloneResponse.body.share;

        const imageType = template.image_type ?? '';
        const normalizedType = imageType.toLowerCase().replace(/_/g, '-');

        const routeMap: Record<string, string> = {
          dreizeilen: '/studio/templates/dreizeilen',
          zitat: '/studio/templates/zitat',
          'zitat-pure': '/studio/templates/zitat-pure',
          info: '/studio/templates/info',
          headline: '/studio/templates/headline',
          veranstaltung: '/studio/templates/veranstaltung',
          simple: '/studio/templates/simple',
          slider: '/studio/templates/slider',
          freeform: '/studio/templates/freeform',
        };

        const route = routeMap[normalizedType] ?? '/studio/templates';

        void navigate(route, {
          replace: true,
          state: {
            templateMode: true,
            templateCreator: template.template_creator_name,
            sharepicType: normalizedType,
            content: {
              ...template.image_metadata?.content,
              sharepicType: normalizedType,
            },
            styling: {
              ...template.image_metadata?.styling,
              sharepicType: normalizedType,
            },
            shareToken: share.shareToken,
          },
        });
      } catch (err: unknown) {
        // Non-200 responses throw a status-mapped message above; genuine
        // network errors surface their own message. (ts-rest resolves 4xx/5xx
        // to { status, body } rather than throwing an axios error, so there is
        // no `err.response.status` to branch on here anymore.)
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
        cloneInProgressRef.current = null;
      } finally {
        setIsCloning(false);
      }
    },
    [navigate]
  );

  return { cloneTemplate, isCloning, error };
}

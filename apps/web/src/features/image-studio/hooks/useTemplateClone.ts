import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import apiClient from '../../../components/utils/apiClient';

interface TemplateCloneResult {
  cloneTemplate: (shareToken: string) => Promise<void>;
  isCloning: boolean;
  error: string | null;
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
        const templateResponse = await apiClient.get(`/share/templates/${shareToken}`);
        const { template } = templateResponse.data;

        const cloneResponse = await apiClient.post(`/share/templates/${shareToken}/clone`);
        const { share } = cloneResponse.data;

        const routeMap: Record<string, string> = {
          dreizeilen: '/studio/templates/dreizeilen',
          zitat: '/studio/templates/zitat',
          'zitat-pure': '/studio/templates/zitat-pure',
          info: '/studio/templates/info',
          headline: '/studio/templates/headline',
          Dreizeilen: '/studio/templates/dreizeilen',
          Zitat: '/studio/templates/zitat',
          Zitat_Pure: '/studio/templates/zitat-pure',
          Info: '/studio/templates/info',
          Headline: '/studio/templates/headline',
        };

        const route = routeMap[template.image_type] || '/studio/templates';
        const normalizedType = template.image_type?.toLowerCase().replace('_', '-');

        navigate(route, {
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
        let errorMessage = 'Unbekannter Fehler';
        if (err && typeof err === 'object') {
          const axiosErr = err as {
            response?: { status?: number; data?: { error?: string } };
            message?: string;
          };
          if (axiosErr.response?.status === 404) {
            errorMessage = 'Vorlage nicht gefunden';
          } else if (axiosErr.response?.status === 403) {
            errorMessage = 'Kein Zugriff auf diese Vorlage';
          } else if (axiosErr.response?.status === 401) {
            errorMessage = 'Bitte melde dich an, um diese Vorlage zu verwenden';
          } else if (axiosErr.response?.data?.error) {
            errorMessage = axiosErr.response.data.error;
          } else if (axiosErr.message) {
            errorMessage = axiosErr.message;
          }
        }
        setError(errorMessage);
        cloneInProgressRef.current = null;
      } finally {
        setIsCloning(false);
      }
    },
    [navigate]
  );

  return { cloneTemplate, isCloning, error };
}

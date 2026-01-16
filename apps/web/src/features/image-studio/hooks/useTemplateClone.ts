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

  const cloneTemplate = useCallback(async (shareToken: string) => {
    if (cloneInProgressRef.current === shareToken) {
      console.log('[useTemplateClone] Clone already in progress for token:', shareToken);
      return;
    }
    cloneInProgressRef.current = shareToken;

    setIsCloning(true);
    setError(null);
    console.log('[useTemplateClone] Starting clone for token:', shareToken);

    try {
      console.log('[useTemplateClone] Fetching template details...');
      const templateResponse = await apiClient.get(`/share/templates/${shareToken}`);
      console.log('[useTemplateClone] Template response status:', templateResponse.status);
      const { template } = templateResponse.data;
      console.log('[useTemplateClone] Template data:', {
        id: template.id,
        image_type: template.image_type,
        hasMetadata: !!template.image_metadata
      });

      console.log('[useTemplateClone] Cloning template...');
      const cloneResponse = await apiClient.post(`/share/templates/${shareToken}/clone`);
      console.log('[useTemplateClone] Clone response status:', cloneResponse.status);
      const { share } = cloneResponse.data;
      console.log('[useTemplateClone] Clone successful, new shareToken:', share.shareToken);

      const routeMap: Record<string, string> = {
        'dreizeilen': '/image-studio/templates/dreizeilen',
        'zitat': '/image-studio/templates/zitat',
        'zitat-pure': '/image-studio/templates/zitat-pure',
        'info': '/image-studio/templates/info',
        'headline': '/image-studio/templates/headline',
        'Dreizeilen': '/image-studio/templates/dreizeilen',
        'Zitat': '/image-studio/templates/zitat',
        'Zitat_Pure': '/image-studio/templates/zitat-pure',
        'Info': '/image-studio/templates/info',
        'Headline': '/image-studio/templates/headline',
      };

      const route = routeMap[template.image_type] || '/image-studio/templates';
      const normalizedType = template.image_type?.toLowerCase().replace('_', '-');

      console.log('[useTemplateClone] Navigating to:', route, 'with sharepicType:', normalizedType);
      navigate(route, {
        replace: true,
        state: {
          templateMode: true,
          templateCreator: template.template_creator_name,
          sharepicType: normalizedType,
          content: {
            ...template.image_metadata?.content,
            sharepicType: normalizedType
          },
          styling: {
            ...template.image_metadata?.styling,
            sharepicType: normalizedType
          },
          shareToken: share.shareToken
        }
      });

    } catch (err: unknown) {
      let errorMessage = 'Unbekannter Fehler';
      if (err && typeof err === 'object') {
        const axiosErr = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
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
  }, [navigate]);

  return { cloneTemplate, isCloning, error };
}

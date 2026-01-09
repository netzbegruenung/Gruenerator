import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface TemplateCloneResult {
  cloneTemplate: (shareToken: string) => Promise<void>;
  isCloning: boolean;
  error: string | null;
}

export function useTemplateClone(): TemplateCloneResult {
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const cloneTemplate = async (shareToken: string) => {
    setIsCloning(true);
    setError(null);

    try {
      // 1. Fetch template details
      const templateResponse = await fetch(
        `/api/share/templates/${shareToken}`
      );

      if (!templateResponse.ok) {
        throw new Error('Vorlage nicht gefunden oder nicht zugänglich');
      }

      const { template } = await templateResponse.json();

      // 2. Clone template
      const cloneResponse = await fetch(
        `/api/share/templates/${shareToken}/clone`,
        { method: 'POST' }
      );

      if (!cloneResponse.ok) {
        throw new Error('Fehler beim Kopieren der Vorlage');
      }

      const { share } = await cloneResponse.json();

      // 3. Navigate to editor with cloned template data
      const routeMap: Record<string, string> = {
        'Dreizeilen': '/sharepic/dreizeilen',
        'Zitat': '/sharepic/zitat',
        'Simple': '/sharepic/simple',
        'Info': '/sharepic/info',
        'Veranstaltung': '/sharepic/veranstaltung',
        'Profilbild': '/sharepic/profilbild'
      };

      const route = routeMap[template.image_type] || '/sharepic';

      navigate(route, {
        state: {
          templateMode: true,
          templateCreator: template.template_creator_name,
          content: template.image_metadata?.content || {},
          styling: template.image_metadata?.styling || {},
          shareToken: share.shareToken
        }
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      console.error('Template clone error:', err);
    } finally {
      setIsCloning(false);
    }
  };

  return { cloneTemplate, isCloning, error };
}

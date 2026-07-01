import { getContractsClient } from '@gruenerator/shared/api';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

/** Read the snapshot canvas id out of a Grünerator-Vorlage's content_data. */
export const grueneratorCanvasId = (
  contentData: Record<string, unknown> | null | undefined
): string | undefined => {
  const id = contentData?.canvasId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
};

/**
 * "Use" a Grünerator-Vorlage: clone its frozen snapshot canvas into a fresh,
 * editable copy owned by the current user and open it in the studio. Mirrors
 * the group `canvas_template` cloneOnOpen flow (see useCloneCanvasTemplate).
 */
export const useGrueneratorVorlage = () => {
  const navigate = useNavigate();
  // Guards against double-clicks while the clone is in flight.
  const [usingId, setUsingId] = useState<string | null>(null);

  const openVorlage = useCallback(
    async (vorlage: {
      id: string;
      content_data?: Record<string, unknown> | null;
    }): Promise<void> => {
      const canvasId = grueneratorCanvasId(vorlage.content_data);
      if (!canvasId) {
        toast.error('Diese Vorlage ist nicht mehr verfügbar.');
        return;
      }
      if (usingId) return;
      setUsingId(vorlage.id);
      try {
        const result = await getContractsClient().canvas.clone({
          params: { id: canvasId },
          body: {},
        });
        if (result.status !== 201) {
          throw new Error(`Failed to clone canvas (HTTP ${result.status})`);
        }
        void navigate(`/studio/canvas/${result.body.newCanvasId}`);
      } catch (e) {
        toast.error(
          'Vorlage konnte nicht geöffnet werden: ' + (e instanceof Error ? e.message : String(e))
        );
      } finally {
        setUsingId(null);
      }
    },
    [navigate, usingId]
  );

  return { openVorlage, usingId };
};

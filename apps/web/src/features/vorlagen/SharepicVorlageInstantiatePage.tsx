import { CanvasEditorSkeleton } from '@gruenerator/canvas-editor/skeleton';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { Button } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type JSX } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { seedCanvasQuery } from '../image-studio/canvasQuery';
import { composeCreatorSharepic } from '../image-studio/freitext/composeForRender';
import { mintCreatorCanvas } from '../image-studio/freitext/useSharepicCreator';

/**
 * `/studio/vorlage/:id` — copies a Grünerator-Vorlage into a new canvas of the
 * viewer's own and opens it in the editor.
 *
 * Composing needs a browser (fonts, text measuring), so this one page does it
 * for every client: the web gallery links here, the mobile app opens it in its
 * web viewer.
 */
export default function SharepicVorlageInstantiatePage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // StrictMode runs effects twice; one Vorlage, one copy.
  const started = useRef(false);

  useEffect(() => {
    if (!id || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const res = await getContractsClient().sharepicVorlagen.get({ params: { id } });
        if (res.status === 404) throw new Error('Diese Vorlage gibt es nicht (mehr).');
        if (res.status !== 200) {
          throw new ApiError(
            res.status,
            `Vorlage konnte nicht geladen werden (HTTP ${res.status}).`
          );
        }
        const vorlage = res.body;
        const composed = await composeCreatorSharepic(vorlage.spec, vorlage.attributions);
        const canvas = await mintCreatorCanvas(composed, vorlage.titel, {
          base: vorlage.spec,
          tweaks: {},
          attributions: vorlage.attributions,
        });
        seedCanvasQuery(queryClient, canvas);
        void navigate(`/studio/canvas/${canvas.id}`, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Die Vorlage ließ sich nicht öffnen.');
      }
    })();
  }, [id, navigate, queryClient]);

  if (!error) return <CanvasEditorSkeleton />;

  return (
    <div className="mx-auto flex max-w-[28rem] flex-col items-center gap-4 px-md py-16 text-center">
      <p className="text-lg font-semibold text-foreground-heading">Vorlage nicht geöffnet</p>
      <p className="text-sm text-foreground">{error}</p>
      <Button asChild variant="brand-outline" size="brand">
        <Link to="/vorlagen">Zu den Vorlagen</Link>
      </Button>
    </div>
  );
}

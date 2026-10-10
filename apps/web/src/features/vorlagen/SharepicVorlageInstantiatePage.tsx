import { CanvasEditorSkeleton } from '@gruenerator/canvas-editor/skeleton';
import { takeVorlageBeitrag } from '@gruenerator/chat';
import { type SharepicVorlage } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { Button } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type JSX } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useHostAwareBack } from '../../hooks/useHostAwareBack';
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
 *
 * `?mitBeitrag=1` (from the chat's Vorlagen gallery): the post the chat stashed
 * goes into the Vorlage first, as a change request on its spec. If that draft
 * fails, the plain copy opens — the person still gets the Vorlage.
 */
export default function SharepicVorlageInstantiatePage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const withBeitrag = searchParams.get('mitBeitrag') === '1';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // In the mobile web viewer there is no gallery to go back to — close instead.
  const back = useHostAwareBack('/vorlagen');
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
        const beitrag = withBeitrag ? takeVorlageBeitrag(id) : null;
        const { spec, attributions } = (beitrag && (await fillWithBeitrag(vorlage, beitrag))) || {
          spec: vorlage.spec,
          attributions: vorlage.attributions,
        };
        const composed = await composeCreatorSharepic(spec, attributions);
        const canvas = await mintCreatorCanvas(composed, vorlage.titel, {
          base: spec,
          tweaks: {},
          attributions,
        });
        seedCanvasQuery(queryClient, canvas);
        void navigate(`/studio/canvas/${canvas.id}`, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Die Vorlage ließ sich nicht öffnen.');
      }
    })();
  }, [id, navigate, queryClient, withBeitrag]);

  if (!error) return <CanvasEditorSkeleton />;

  return (
    <div className="mx-auto flex max-w-[28rem] flex-col items-center gap-4 px-md py-16 text-center">
      <p className="text-lg font-semibold text-foreground-heading">Vorlage nicht geöffnet</p>
      <p className="text-sm text-foreground">{error}</p>
      <Button variant="brand-outline" size="brand" onClick={back}>
        Zu den Vorlagen
      </Button>
    </div>
  );
}

/** The Vorlage's spec with the post's content, or null when the draft fails. */
async function fillWithBeitrag(
  vorlage: SharepicVorlage,
  beitrag: string
): Promise<Pick<SharepicVorlage, 'spec' | 'attributions'> | null> {
  const draft = await getContractsClient()
    .sharepicCreator.draft({
      body: {
        current: vorlage.spec,
        prompt: `Übertrage den Inhalt dieses Beitrags in das Sharepic. Behalte Form, Layout, Farben und Seitenzahl bei, ersetze nur die Texte (und passende Fotos), kürze auf das Wesentliche:\n\n${beitrag}`,
      },
    })
    .catch(() => null);
  return draft?.status === 200
    ? { spec: draft.body.spec, attributions: draft.body.attributions }
    : null;
}

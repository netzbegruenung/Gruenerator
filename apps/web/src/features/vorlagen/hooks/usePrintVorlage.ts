import { type PrintVorlage } from '@gruenerator/canvas-editor/print-vorlagen';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { seedCanvasQuery } from '../../image-studio/canvasQuery';

/**
 * "Use" a print Vorlage: compose its placeholder spec into a canvas in the
 * print format and open it in the editor. Composing needs the brand fonts
 * (text measuring), so it runs here in the browser.
 */
export const usePrintVorlage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openingId, setOpeningId] = useState<string | null>(null);
  // Guards against double-clicks while the canvas is being created.
  const busy = useRef(false);

  const openPrintVorlage = useCallback(
    async (vorlage: PrintVorlage): Promise<void> => {
      if (busy.current) return;
      busy.current = true;
      setOpeningId(vorlage.id);
      try {
        // The composer is heavy; the gallery only loads it when someone opens a Vorlage.
        const { composePrint, ensureFontsReady } =
          await import('@gruenerator/canvas-editor/composer');
        await ensureFontsReady();
        const composed = composePrint(vorlage.spec);
        const pages = composed.slides.map((state, i) => ({
          id: `seed-${i}`,
          configId: composed.templateType,
          state,
        }));
        const res = await getContractsClient().canvas.create({
          body: {
            title: vorlage.titel,
            template_type: composed.templateType,
            initial_state: { ...composed.slides[0], pages },
            format: composed.format,
            page_count: pages.length,
          },
        });
        if (res.status !== 201) {
          throw new ApiError(
            res.status,
            `Canvas konnte nicht erstellt werden (HTTP ${res.status}).`
          );
        }
        seedCanvasQuery(queryClient, res.body);
        void navigate(`/studio/canvas/${res.body.id}`);
      } catch (e) {
        toast.error(
          'Vorlage konnte nicht geöffnet werden: ' + (e instanceof Error ? e.message : String(e))
        );
      } finally {
        busy.current = false;
        setOpeningId(null);
      }
    },
    [navigate, queryClient]
  );

  return { openPrintVorlage, openingId };
};

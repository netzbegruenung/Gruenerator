/**
 * `bild_ansehen` — how the agentic loop reads image attachments (#3841).
 *
 * The loop never puts image bytes into its model messages: its planner lanes are
 * not listed as vision-capable, and pixels in the history would be re-sent on
 * every step. Instead the model asks one question about one attached image and a
 * vision model answers it. When the image carries text (receipt, screenshot,
 * poster), `analyzeWithOcr` runs Mistral OCR alongside and the text comes back
 * verbatim, so amounts and names come from OCR rather than from a paraphrase.
 *
 * Mounted only when `imageVisibility(state, { loop: true })` says `'tool'` — the
 * same answer that makes the system prompt point here.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { visionService, type VisionService } from '../../../services/vision/VisionService.js';
import { createLogger } from '../../../utils/logger.js';

import type { ImageAttachment } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('imageTools');

export interface ImageToolCtx {
  images: readonly ImageAttachment[];
  /** Injected in tests; defaults to the shared service. */
  vision?: Pick<VisionService, 'analyzeWithOcr'>;
}

export function makeBildAnsehenTool(ctx: ImageToolCtx): Tool {
  const { images } = ctx;
  const vision = ctx.vision ?? visionService;
  return tool({
    description: `Sieht sich ein Bild an, das der*die Nutzer*in an DIESE Nachricht angehängt hat, und beantwortet eine Frage dazu. Enthält das Bild Text (Beleg, Screenshot, Plakat), kommt der erkannte Text wörtlich mit.

NUTZE WENN: du für die Aufgabe wissen musst, was auf einem angehängten Bild zu sehen ist oder steht — bevor du etwas über seinen Inhalt sagst. Frag gezielt nach dem, was du brauchst (z. B. „Welche Personen sind zu sehen, und steht ihr Name dabei?“, „Betrag, Datum und Anbieter des Belegs“).

Die Bilder sind im Systemprompt nummeriert (Bild 1, Bild 2, …).`,
    inputSchema: z.object({
      bild: z
        .number()
        .int()
        .min(1)
        .max(Math.max(images.length, 1))
        .describe('Nummer des Bildes, beginnend bei 1'),
      frage: z.string().min(1).max(1000).describe('Was du über das Bild wissen musst'),
    }),
    execute: async ({ bild, frage }) => {
      const image = images[bild - 1];
      if (!image) {
        return { error: `Es gibt kein Bild ${bild} — angehängt sind ${images.length}.` };
      }
      try {
        const result = await vision.analyzeWithOcr(
          `data:${image.type};base64,${image.data}`,
          frage
        );
        return {
          bild: image.name,
          antwort: result.description,
          ...(result.extractedText && { text: result.extractedText }),
        };
      } catch (err) {
        log.warn(
          `[bild_ansehen] vision call failed for "${image.name}": ${err instanceof Error ? err.message : String(err)}`
        );
        return {
          error: `„${image.name}“ konnte gerade nicht gelesen werden. Sag das offen und rate den Inhalt nicht.`,
        };
      }
    },
  });
}

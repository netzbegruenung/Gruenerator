/**
 * `vertonen`: turn text from the chat into a downloadable audio file.
 *
 * The same engine as the Grünerator Voice tool (`services/voice/speechService`),
 * so a file made here is a real Mediathek row with a share link — not a
 * throwaway. What the chat adds is the path: the text usually IS the answer the
 * model just wrote, and asking the person to copy it into another tool to hear
 * it is the friction this removes.
 *
 * Surfaced through the EXISTING compute card, exactly like `fill_pdf_form`: the
 * payload goes to `state.computedResult` (persisted as message metadata by
 * postResponseService) and streams as a `compute` event, whose `fileAssets` the
 * card already renders. Unlike run_python exports the bytes are NOT copied into
 * uploads/compute-assets — they already live in the Mediathek, so the asset URL
 * points at the share route and the 90-day compute-asset cleanup never applies.
 */
import { SPEECH_MAX_TEXT_CHARS, speechOutputFormatSchema } from '@gruenerator/contracts';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import {
  TreeBudgetExceededError,
  TreeBudgetUnavailableError,
} from '../../../services/trees/index.js';
import { generateSpeechFiles } from '../../../services/voice/speechService.js';
import { toUserFacingMessage } from '../../../utils/errors/index.js';
import { createLogger } from '../../../utils/logger.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const log = createLogger('VertonenTool');

export interface VertonenToolCtx {
  state: ChatGraphState;
  sse: SSEWriter;
  /** The voice from the person's settings; null uses the product default. */
  voiceId: string | null;
}

const FORMAT_LABEL: Record<'mp3' | 'wav_phone', string> = {
  mp3: 'MP3',
  wav_phone: 'Telefon-WAV (8 kHz)',
};

/** "1:23 Minuten" — the card shows length, not byte count. */
function spokenLength(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes === 0) return `${rest} Sekunden`;
  return `${minutes}:${String(rest).padStart(2, '0')} Minuten`;
}

export function makeVertonenTool(ctx: VertonenToolCtx): Tool {
  // Per turn: the catalog is rebuilt for every turn, so this closure is the
  // turn's memory. The model cannot HEAR the file it made and asks again —
  // the same failure mode `generate_image` guards against, except here a
  // second call also spends the person's daily speech budget twice.
  let produced: { fileName: string; laenge: string } | null = null;

  return tool({
    description: `Vertont einen Text: erzeugt eine Audiodatei, die der*die Nutzer*in herunterladen kann, und legt sie in der Mediathek ab.

NUTZE WENN jemand ausdrücklich eine Audiodatei, eine Vertonung, eine Sprachausgabe zum Herunterladen oder eine Ansage für den Anrufbeantworter möchte ("vertone das", "lies das als Audiodatei vor", "mach eine MP3 daraus").
NICHT für das Vorlesen im Chat selbst — dafür gibt es in der Oberfläche einen eigenen Knopf.

Übergib den FERTIGEN Text, der gesprochen werden soll, ohne Markdown, Aufzählungszeichen oder Links.`,
    inputSchema: z.object({
      text: z
        .string()
        .min(1)
        .max(SPEECH_MAX_TEXT_CHARS)
        .describe('Der Text, der gesprochen werden soll. Reiner Fließtext.'),
      titel: z
        .string()
        .max(120)
        .optional()
        .describe('Kurzer Name für die Datei in der Mediathek, z.B. "Ansage Bürgerbüro".'),
      format: speechOutputFormatSchema
        .optional()
        .describe(
          'mp3 (Standard, für alles) oder wav_phone (nur für Telefonanlagen wie Fritz!Box).'
        ),
    }),
    // The loop's abort signal (step timeout, abandoned turn) reaches the
    // provider. Without it an abandoned synthesis runs to the end: the seconds
    // are spent, a Mediathek row appears, and a `compute` event fires into a
    // turn that already gave up.
    execute: async ({ text, titel, format }, { abortSignal }) => {
      if (produced) {
        return {
          ok: true,
          ...produced,
          note: 'In diesem Turn wurde bereits eine Audiodatei erzeugt und dem*der Nutzer*in angezeigt. Rufe vertonen NICHT erneut auf.',
        };
      }

      const userId = ctx.state.agentConfig?.userId ?? null;
      if (!userId)
        return { error: 'Keine Sitzung — die Audiodatei kann nicht gespeichert werden.' };

      const chosen = format ?? 'mp3';
      let result;
      try {
        result = await generateSpeechFiles(userId, {
          // The read-aloud preset: it only decides the fallback title, and
          // `titel` overrides that whenever the model names the file.
          preset: 'vorlesefassung',
          text,
          formats: [chosen],
          voiceId: ctx.voiceId,
          speed: null,
          signal: abortSignal ?? null,
          title: titel ?? null,
        });
      } catch (error) {
        if (
          error instanceof TreeBudgetExceededError ||
          error instanceof TreeBudgetUnavailableError
        ) {
          // The budget message is written for people, so the classifier keeps it
          // as it is — the model repeats a true reason instead of inventing one.
          return { error: toUserFacingMessage(error) };
        }
        log.error(`[Vertonen] failed: ${error instanceof Error ? error.message : String(error)}`);
        return { error: 'Die Vertonung ist fehlgeschlagen.' };
      }

      const file = result.files[0];
      if (!file) return { error: 'Die Vertonung hat keine Datei erzeugt.' };

      const { slugifyName } = await import('@gruenerator/shared/utils');
      const fileName = `${slugifyName(titel ?? 'vertonung', 'vertonung')}.${
        file.mimeType === 'audio/wav' ? 'wav' : 'mp3'
      }`;
      const laenge = spokenLength(result.durationSeconds);

      const payload = {
        operation: 'Text vertont',
        entries: [
          { label: 'Länge', value: laenge },
          { label: 'Format', value: FORMAT_LABEL[chosen] },
        ],
        summary: `Die Audiodatei liegt in der Mediathek und steht zum Download bereit.`,
        // The file lives in the Mediathek; the asset URL is the public share
        // download route, so nothing is copied and nothing expires after 90 days.
        fileAssets: [{ name: fileName, url: `/api/share/${file.shareToken}/download` }],
      };

      ctx.state.computedResult = payload;
      ctx.state.computedResultFresh = true;
      ctx.sse.send('compute', { compute: payload });

      produced = { fileName, laenge };
      log.info(`[Vertonen] ${fileName} (${laenge}) for user ${userId}`);
      return {
        ok: true,
        fileName,
        laenge,
        note: 'Die Audiodatei steht der*dem Nutzer*in bereits zum Anhören und Herunterladen bereit — erwähne das kurz und nenne die Länge. Gib KEINEN Link aus.',
      };
    },
  });
}

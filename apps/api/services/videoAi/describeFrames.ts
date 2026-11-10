/**
 * Gemma reads contact sheets and describes each cell: shot size, people,
 * where the main person stands, quality, burned-in text.
 *
 * Not asked: eyes closed or looking down — Gemma caught 1 of 6 in the spike
 * (2026-11-10, section 3), so no step may depend on it. Cuts follow word
 * boundaries anyway.
 *
 * At most CONCURRENCY sheets at a time: the Melious key (240 requests/min) is
 * shared with every other Gemma lane, chat included.
 */
import { z } from 'zod';

import { aiObject } from '../ai/generate.js';

import { type ContactSheet } from './contactSheet.js';

export const frameCellSchema = z.object({
  einstellung: z.enum(['nah', 'halbnah', 'total']),
  personen: z.number().int().min(0),
  position: z.enum(['links', 'mitte', 'rechts', 'keine']),
  angeschnitten: z.boolean(),
  qualitaet: z.enum(['ok', 'unscharf', 'dunkel', 'verwackelt']),
  text_im_bild: z.string(),
  beschreibung: z.string(),
});
export type FrameCell = z.infer<typeof frameCellSchema> & { t: number };

const answerSchema = z.object({ zellen: z.array(frameCellSchema) });

const CONCURRENCY = 3;

const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    zellen: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          einstellung: { type: 'string', enum: ['nah', 'halbnah', 'total'] },
          personen: { type: 'integer' },
          position: { type: 'string', enum: ['links', 'mitte', 'rechts', 'keine'] },
          angeschnitten: { type: 'boolean' },
          qualitaet: { type: 'string', enum: ['ok', 'unscharf', 'dunkel', 'verwackelt'] },
          text_im_bild: { type: 'string', description: 'Wörtlich, leer wenn keiner' },
          beschreibung: { type: 'string', description: 'Höchstens 15 Wörter' },
        },
      },
    },
  },
  required: ['zellen'],
};

function prompt(times: readonly number[]): string {
  return (
    `Das Bild ist ein Kontaktbogen: ${times.length} Standbilder aus EINEM Video im 3×3-Raster, ` +
    'zeilenweise von links oben nach rechts unten gelesen.\n' +
    `Zeitpunkte der Zellen in Sekunden, in derselben Reihenfolge: ${times.join(', ')}.\n` +
    'Beschreibe JEDE Zelle, genau eine Zelle pro Eintrag. "position" ist die horizontale Lage ' +
    'der Hauptperson im Bild (wichtig für einen schmaleren Bildausschnitt); "keine", wenn ' +
    'niemand zu sehen ist.'
  );
}

async function describeSheet(sheet: ContactSheet): Promise<FrameCell[]> {
  const result = await aiObject<z.infer<typeof answerSchema>>({
    lane: 'video_ai_frames',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { data: sheet.jpeg.toString('base64'), media_type: 'image/jpeg' },
          },
          { type: 'text', text: prompt(sheet.times) },
        ],
      },
    ],
    toolName: 'zellen_beschreiben',
    toolDescription: 'Beschreibt jede Zelle des Kontaktbogens.',
    schema: TOOL_SCHEMA,
    temperature: 0.2,
    timeoutMs: 60_000,
    label: 'video_ai_frames',
    validate: (raw) => {
      const parsed = answerSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: parsed.error.message };
      if (parsed.data.zellen.length !== sheet.times.length) {
        return {
          ok: false,
          error: `Genau ${sheet.times.length} Zellen beschreiben, nicht ${parsed.data.zellen.length}.`,
        };
      }
      return { ok: true, value: parsed.data };
    },
  });
  if (!result.ok) throw result.cause ?? new Error(result.error);
  return result.data.zellen.map((cell, i) => ({ ...cell, t: sheet.times[i] }));
}

export async function describeFrames(sheets: readonly ContactSheet[]): Promise<FrameCell[]> {
  const out: FrameCell[][] = new Array<FrameCell[]>(sheets.length);
  let next = 0;
  const worker = async () => {
    while (next < sheets.length) {
      const i = next++;
      out[i] = await describeSheet(sheets[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, sheets.length) }, worker));
  return out.flat();
}

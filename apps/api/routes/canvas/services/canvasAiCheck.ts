/**
 * Vision check after an AI edit on a canvas page: Gemma 4 on Melious looks at
 * the rendered page and reports what visibly went wrong. Fail-soft — a check
 * that cannot run must never block or alarm the person editing.
 */
import { type CanvasAiCheckResponse } from '@gruenerator/contracts';
import { z } from 'zod';

import { GEMMA_31B_ON_MELIOUS } from '../../../services/ai/gemmaHosts.js';
import { aiObject } from '../../../services/ai/generate.js';
import { toJpegBase64 } from '../../../services/sharepicCreator/toJpegBase64.js';
import { createLogger } from '../../../utils/logger.js';

import type { StructuredValidation } from '../../../services/ai/structuredParsing.js';

const log = createLogger('canvasAiCheck');

const PINNED = { provider: GEMMA_31B_ON_MELIOUS.provider, model: GEMMA_31B_ON_MELIOUS.model };

const CHECK_SYSTEM = `Du prüfst ein Sharepic, das gerade per KI-Anweisung geändert wurde. Du siehst das gerenderte Bild und die Zusammenfassung der Änderung.

Prüfe:
1. Ist Text abgeschnitten oder läuft er aus dem Bild?
2. Überlappt Text mit Text, Kreis, Logo oder Bild so, dass es stört?
3. Ist Text schlecht lesbar (zu wenig Kontrast zum Hintergrund)?
4. Ist die Änderung aus der Zusammenfassung sichtbar passiert?

Ist alles in Ordnung: ok = true und issues leer. Sonst ok = false und issues = höchstens 3 kurze deutsche Sätze für die Person, die das Sharepic bearbeitet. Melde nur, was man sieht. Erfinde nichts. Corporate-Design-Elemente (Farbflächen, Kreise, Logo, kleine Quellenzeile, das Schild „KI-Generiert …“) sind gewollt und kein Fehler.`;

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'issues'],
};

const rawCheckSchema = z.object({ ok: z.boolean(), issues: z.array(z.string()) });

export function validateCheck(input: unknown): StructuredValidation<CanvasAiCheckResponse> {
  const parsed = rawCheckSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  }
  const issues = parsed.data.issues
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((text) => ({ text }));
  return { ok: true, value: { ok: parsed.data.ok, issues } };
}

export async function checkCanvasEdit(
  image: string,
  instruction: string
): Promise<CanvasAiCheckResponse> {
  try {
    const result = await aiObject<CanvasAiCheckResponse>({
      lane: 'canvas_ai_check',
      pinned: PINNED,
      system: CHECK_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                data: await toJpegBase64(image, { width: 1536, height: 1536 }),
                media_type: 'image/jpeg',
              },
            },
            { type: 'text', text: `Zusammenfassung der Änderung:\n${instruction}` },
          ],
        },
      ],
      toolName: 'pruefung_abgeben',
      toolDescription: 'Gib das Prüfergebnis mit den sichtbaren Problemen ab.',
      schema: CHECK_SCHEMA,
      validate: validateCheck,
      maxOutputTokens: 500,
      label: 'canvas:ai-check',
    });
    if (result.ok) return result.data;
    log.warn(`check rejected: ${result.error}`);
  } catch (err) {
    log.warn(`check failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { ok: true, issues: [] };
}

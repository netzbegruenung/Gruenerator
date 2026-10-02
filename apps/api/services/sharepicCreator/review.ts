/**
 * Free-text sharepic creator — the vision check (experimental).
 *
 * Gemma 4 on Melious looks at the draft as the canvas editor rendered it and
 * answers with a short list of problems plus patch operations against the
 * spec. The patch vocabulary is deliberately small (text, zone, removal,
 * photo layout, colour): the review corrects a draft, it does not redesign it.
 */
import {
  type SharepicReviewResponse,
  type SharepicSpec,
  sharepicReviewResponseSchema,
  hasUnpairedAccentMark,
  tightenAccentMarksDeep,
} from '@gruenerator/contracts';
import sharp from 'sharp';

import { createLogger } from '../../utils/logger.js';
import { GEMMA_31B_ON_MELIOUS } from '../ai/gemmaHosts.js';
import { aiObject } from '../ai/generate.js';

import { basicsText } from './styleguide.js';

import type { StructuredValidation } from '../ai/structuredParsing.js';

const log = createLogger('sharepicCreator:review');

const PINNED = { provider: GEMMA_31B_ON_MELIOUS.provider, model: GEMMA_31B_ON_MELIOUS.model };

const REVIEW_SYSTEM = `Du bist Art Director für Sharepics (1080 × 1350). Du siehst das gerenderte Bild und den Entwurf, aus dem es gebaut ist. Ein Karussell siehst du als Kontaktbogen: die Slides nebeneinander in Wischreihenfolge, oben links jeweils ihre Nummer. Slides und ihre Textelemente (items) sind nummeriert, beides ab 0.

Prüfe in dieser Reihenfolge:
1. Fehler: Überlappt Text mit Text, Kreis oder Logo? Ist Text abgeschnitten oder läuft aus dem Bild? Ist jeder Text gut lesbar (Kontrast)? Stimmen Rechtschreibung und Grammatik?
2. Wirkung (so wie gute Partei-Posts): Ist die Botschaft in zwei Sekunden klar? Ist die Headline groß und kurz genug – sonst kürzen? Gibt es höchstens einen bis zwei Akzente pro Slide? Bilden die Texte einen kompakten Block? Ist zu viel Text drauf? Passt das Foto zum Thema, und liegt der Text auf einer ruhigen Stelle?
3. Nur bei Karussells: Sehen die Slides wie aus einem Guss aus (Hintergrund, Ausrichtung)? Ist die erste Slide ein starker Hook, die letzte ein klarer Schluss?

Ist alles gut: ok = true, issues und patch leer. Sonst issues = höchstens 3 kurze deutsche Sätze für die Person, die das Sharepic erstellt, und patch = die kleinsten Änderungen, die das beheben. Jede Änderung nennt mit "slide":N die Slide (ohne Angabe: Slide 0):
- {"op":"set_text","item":N,"text":…} – Text kürzen oder korrigieren (bei liste die Punkte mit \\n trennen)
- {"op":"set_headline","lines":[…],"akzent"?:N,"item"?:N} – Headline neu umbrechen oder kürzen; jede Zeile 1–3 Wörter, 2–4 Zeilen, je Zeile ein Eintrag (kein \\n in einer Zeile). Mit "item" wird dieses Element zur Headline (nur auf einer Slide ohne Headline).
- {"op":"remove_item","item":N} – zu viel Text weglassen
- {"op":"set_position","position":"oben"|"mitte"|"unten"}
- {"op":"set_align","align":"links"|"zentriert"}
- {"op":"set_text_side","textSeite":"unten"|"oben"|"links"|"rechts"} – Text auf eine ruhigere Bildseite
- {"op":"set_color","color":…} – Hintergrund- bzw. Flächenfarbe
- {"op":"remove_extra","extra":"stoerer"|"datum"|"ort"|"logo"|"quelle"}
- {"op":"use_color","color":…} – das Foto passt nicht zum Thema: stattdessen Markenfarbe
Diese Elemente SIND Corporate Design und kein Fehler: der Datumskreis (Deutschland himmelblau, Österreich magenta), der Störer-Kreis (magenta), der Lime-Marker hinter einer Headline-Zeile und lime Einzelwörter (Deutschland), weiße und grüne Zeilenboxen (Deutschland), gelbe kursive Wörter oder Zeilen (Österreich), der Farbverlauf über dem Foto, die Farbfläche, die ins Foto ausblendet, der Weiter-Pfeil unten rechts auf allen Slides außer der letzten, die kleine Quellenzeile.
In Karussells sind Slides ohne Headline gewollt: Geschichte, Kontext und Kritik stehen dort als Absätze (absatz), oft in Zeilenboxen. Mach daraus keine Headline – kürze höchstens den Text.
Erfinde keine neuen Inhalte. Ändere nichts, was gut ist. Melde nur, was man sieht. Schlage nichts vor, was du schon einmal vorgeschlagen hast.`;

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
    patch: { type: 'array', items: { type: 'object' } },
  },
  required: ['ok', 'issues', 'patch'],
};

/**
 * Gemma writes a headline's lines as `text` now and then — same meaning, other key.
 * Accent marks are tightened here too, so a patch cannot reintroduce a raw `==`.
 */
function normalizePatch(input: unknown): unknown {
  if (!input || typeof input !== 'object' || !Array.isArray((input as { patch?: unknown }).patch)) {
    return input;
  }
  const patch = (input as { patch: Record<string, unknown>[] }).patch.map((raw) => {
    const op = tightenAccentMarksDeep(raw);
    if (op?.op !== 'set_headline' || op.lines !== undefined || !Array.isArray(op.text)) return op;
    const { text, ...rest } = op;
    return { ...rest, lines: text };
  });
  return { ...input, patch };
}

export function validateReview(
  input: unknown,
  itemCounts: number[]
): StructuredValidation<SharepicReviewResponse> {
  const parsed = sharepicReviewResponseSchema.safeParse(normalizePatch(input));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; '),
    };
  }
  for (const op of parsed.data.patch) {
    const texts = op.op === 'set_text' ? [op.text] : op.op === 'set_headline' ? op.lines : [];
    if (texts.some(hasUnpairedAccentMark)) {
      return {
        ok: false,
        error:
          'Ein einzelnes == im Text – Hervorhebungen immer als ==Wort== paaren, ohne Leerzeichen innen.',
      };
    }
    const slide = op.slide ?? 0;
    const count = itemCounts[slide];
    if (count === undefined) {
      return { ok: false, error: `Es gibt nur die Slides 0 bis ${itemCounts.length - 1}.` };
    }
    if ('item' in op && op.item !== undefined && op.item >= count) {
      return { ok: false, error: `Slide ${slide} hat nur die items 0 bis ${count - 1}.` };
    }
  }
  return { ok: true, value: { ...parsed.data, issues: parsed.data.issues.slice(0, 3) } };
}

async function toJpegBase64(dataUrl: string): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const buffer = await sharp(Buffer.from(base64, 'base64'))
    // A contact sheet is wide; give it more pixels so text stays legible.
    .resize({ width: 2048, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return buffer.toString('base64');
}

/** A failed check is not a failed draft: the draft stands, unreviewed. */
export async function reviewSharepic(
  spec: SharepicSpec,
  prompt: string,
  image: string
): Promise<SharepicReviewResponse> {
  const slides = spec.slides
    .map((slide, s) => {
      const { items, ...frame } = slide;
      const lines = items.map((item, i) => `  ${i}: ${JSON.stringify(item)}`).join('\n');
      return `Slide ${s}: ${JSON.stringify(frame)}\n items:\n${lines}`;
    })
    .join('\n\n');
  try {
    const result = await aiObject<SharepicReviewResponse>({
      lane: 'sharepic_creator_review',
      pinned: PINNED,
      system: `${REVIEW_SYSTEM}\n\n${basicsText(spec.locale)}`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { data: await toJpegBase64(image), media_type: 'image/jpeg' },
            },
            {
              type: 'text',
              text: `Auftrag:\n${prompt}\n\nEntwurf (${spec.slides.length === 1 ? 'Einzelbild' : `Karussell, ${spec.slides.length} Slides`}):\n${slides}`,
            },
          ],
        },
      ],
      toolName: 'pruefung_abgeben',
      toolDescription: 'Gib das Prüfergebnis mit Problemen und Korrekturen ab.',
      schema: REVIEW_SCHEMA,
      validate: (input) =>
        validateReview(
          input,
          spec.slides.map((slide) => slide.items.length)
        ),
      maxOutputTokens: 1500,
      label: 'sharepicCreator:review',
    });
    if (result.ok) {
      log.info(
        `review ok=${result.data.ok} issues=${JSON.stringify(result.data.issues)} patch=${JSON.stringify(result.data.patch)}`
      );
      return result.data;
    }
    log.warn(`review rejected: ${result.error}`);
  } catch (err) {
    log.warn(`review failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return {
    ok: true,
    issues: ['Die automatische Prüfung war nicht erreichbar — bitte selbst ansehen.'],
    patch: [],
  };
}

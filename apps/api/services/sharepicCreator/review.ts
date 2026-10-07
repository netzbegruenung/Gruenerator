/**
 * Free-text sharepic creator — the vision check (experimental).
 *
 * Gemma 4 on Melious looks at the draft as the canvas editor rendered it and
 * answers with a short list of problems plus patch operations against the
 * spec. The patch vocabulary is deliberately small (text, zone, removal,
 * photo layout, colour): the review corrects a draft, it does not redesign it.
 */
import {
  type SharepicReviewMode,
  type SharepicReviewResponse,
  type SharepicSlide,
  type SharepicSpec,
  sharepicReviewResponseSchema,
  countMarkerPassages,
  hasUnpairedAccentMark,
  SHAREPIC_MARKER_PASSAGES,
  tightenAccentMarksDeep,
} from '@gruenerator/contracts';

import { createLogger } from '../../utils/logger.js';
import { GEMMA_31B_ON_MELIOUS } from '../ai/gemmaHosts.js';
import { aiObject } from '../ai/generate.js';

import { paletteHint, paletteSubstitutions, withPaletteColors } from './paletteColors.js';
import { basicsText } from './styleguide.js';
import { toJpegBase64 } from './toJpegBase64.js';

import type { StructuredValidation } from '../ai/structuredParsing.js';

const log = createLogger('sharepicCreator:review');

const PINNED = { provider: GEMMA_31B_ON_MELIOUS.provider, model: GEMMA_31B_ON_MELIOUS.model };

const REVIEW_SYSTEM = `Du bist Art Director für Sharepics im Instagram-Hochformat (4:5 oder 3:4). Du siehst das gerenderte Bild und den Entwurf, aus dem es gebaut ist. Ein Karussell siehst du als Kontaktbogen: die Slides nebeneinander in Wischreihenfolge, oben links jeweils ihre Nummer. Slides und ihre Textelemente (items) sind nummeriert, beides ab 0.

Prüfe in dieser Reihenfolge:
1. Fehler: Überlappt Text mit Text, Kreis oder Logo? Ist Text abgeschnitten oder läuft aus dem Bild? Ist jeder Text gut lesbar (Kontrast)? Stimmen Rechtschreibung und Grammatik?
2. Wirkung (so wie gute Partei-Posts): Ist die Botschaft in zwei Sekunden klar? Ist die Headline groß und kurz genug – sonst kürzen? Gibt es höchstens einen bis zwei Akzente pro Slide? Bilden die Texte einen kompakten Block? Ist zu viel Text drauf? Passt das Foto zum Thema, und liegt der Text auf einer ruhigen Stelle?
3. Nur bei Karussells: Sehen die Slides wie aus einem Guss aus (Hintergrund, Ausrichtung)? Ist die erste Slide ein starker Hook, die letzte ein klarer Schluss?

Ist alles gut: ok = true, issues und patch leer. Sonst issues = höchstens 3 kurze deutsche Sätze für die Person, die das Sharepic erstellt (dort heißt eine Slide „Folie“ und wird ab 1 gezählt: Slide 0 = Folie 1), und patch = die kleinsten Änderungen, die das beheben. Jede Änderung nennt mit "slide":N die Slide (ohne Angabe: Slide 0):
- {"op":"set_text","item":N,"text":…} – Text kürzen oder korrigieren, nie bei Zitat und Frage (bei liste die Punkte mit \\n trennen)
- {"op":"set_headline","lines":[…],"akzent"?:N,"item"?:N} – Headline neu umbrechen oder kürzen; jede Zeile 1–3 Wörter, 2–4 Zeilen, je Zeile ein Eintrag (kein \\n in einer Zeile). Mit "item" wird dieses Element zur Headline (nur auf einer Slide ohne Headline).
- {"op":"remove_item","item":N} – zu viel Text weglassen
- {"op":"set_position","position":"oben"|"mitte"|"unten"}
- {"op":"set_align","align":"links"|"zentriert"}
- {"op":"set_text_side","textSeite":"unten"|"oben"|"links"|"rechts"} – Text auf eine ruhigere Bildseite
- {"op":"set_color","color":…} – Hintergrund- bzw. Flächenfarbe
- {"op":"remove_extra","extra":"stoerer"|"datum"|"ort"|"logo"|"quelle"}
- {"op":"use_color","color":…} – das Foto passt nicht erkennbar zum Thema (Motiv und Auftrag haben nichts miteinander zu tun): stattdessen Markenfarbe – im Zweifel lieber Farbe als ein beliebiges Foto
Eigene Fotos (filename "upload:N") hat die Person selbst mitgebracht: nie durch eine Farbe ersetzen (kein use_color) – auch dann nicht, wenn das Motiv nicht zum Thema passt.
Diese Elemente SIND Corporate Design und kein Fehler: der Datumskreis (Deutschland Tanne oder grasgrün, Österreich magenta), der Störer-Kreis (Deutschland grasgrün mit dunkler Schrift, auf grasgrüner Fläche Tanne; Österreich magenta), der Lime-Marker hinter einer Headline-Zeile und lime Einzelwörter (Deutschland), weiße und grüne Zeilenboxen (Deutschland), gelbe kursive Wörter oder Zeilen (Österreich), der Farbverlauf über dem Foto, die Farbfläche, die ins Foto ausblendet, das einfarbig grün eingefärbte Foto über oder unter der Farbfläche (Österreich), der Weiter-Pfeil unten rechts (in einem Karussell, darf auch fehlen) mit einem kurzen Teaser daneben, die Seitenzahl oben („2/5“ oder eine Punktreihe), die kleine Quellenzeile, das dunkle Schild „KI-Generiert …“ unten links auf jeder Slide (Pflichtkennzeichnung, nie entfernen oder bemängeln).
In Karussells sind Slides ohne Headline gewollt: Geschichte, Kontext und Kritik stehen dort als Absätze (absatz), oft in Zeilenboxen. Mach daraus keine Headline – kürze höchstens den Text.
Ein Zitat (zitat) bleibt ein Zitat mit seinem Namen: mach es nie zur Headline und lass es nie weg.
Ein Diagramm (diagramm) auf der weißen Karte ist gewollt: kein set_text darauf, nicht weglassen; seine Werte stammen aus dem Auftrag.
Eine Infografik (infografik) ist gewollt: die kleinen gezeichneten Illustrationen (oder Icons in Kreisen), die Nummernkreise mit Linie und die Größenunterschiede bei Mengen gehören dazu. Kein set_text darauf, nicht weglassen; melde nur, wenn eine Illustration Text enthält oder offensichtlich nicht zu ihrem Titel passt.
Der Schluss-Aufruf (aufruf) auf der letzten Slide ist gewollt, in Deutschland wie in Österreich – das riesige „!“, der Satz mittig über dem Logo oder die Pille mit dem Hinweis gehören dazu. Er ist kein button – auch die Pille unter einem deutschen petition-Aufruf ist gewollt: nie weglassen, nie zur Headline machen, keine Headline dazusetzen; set_text nur zum Kürzen.
Schlagzeilen-Karte (schlagzeile, gerade oder leicht gedreht wie ein Zeitungsausriss), Bingo-Raster (bingo) und ein Zitat der Gegenseite auf blassem Feld mit ✗ (zitat mit seite gegner) sind gewollt: kein set_text darauf, nicht weglassen; der Wortlaut stammt aus dem Auftrag.
Große Zahl (zahl), Rechnung (rechnung) und Termine (termine) sind gewollt, auch die große Ziffer oder blasse Hintergrundziffer eines nummerierten Punkts und die Ziffern, Pfeile oder Häkchen vor Listenpunkten: kein set_text darauf, nicht zur Headline machen; ihre Zahlen und Daten stammen aus dem Auftrag.
Icon-Liste (iconliste) und Vergleich (vergleich) sind gewollt, die Icons und ✓/✗ gehören dazu: eine iconliste kürzt set_text nur mit genau einer Zeile je Punkt (\\n getrennt), die Icons bleiben; ein vergleich bekommt kein set_text und wird keine Headline.
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

/**
 * A quote that becomes a headline loses its speaker; one that is removed loses
 * the point of the slide; rewording a quote or question falsifies what was
 * said; a chart or comparison has no text to reword. All are dropped, silently, like any other bad op. `removed` collects
 * the quotes earlier ops of the same patch already take away, so two removals
 * cannot together leave none.
 */
function protectsZitat(
  op: SharepicReviewResponse['patch'][number],
  slides: SharepicSlide[],
  removed: Set<string>
): boolean {
  if (op.op !== 'set_text' && op.op !== 'set_headline' && op.op !== 'remove_item') return false;
  // The closing call carries its slide alone: no headline joins it.
  if (op.op === 'set_headline' && slides[op.slide ?? 0]?.items.some((i) => i.type === 'aufruf')) {
    return true;
  }
  if (op.item === undefined) return false;
  const target = slides[op.slide ?? 0]?.items[op.item];
  // A chart's values come from the request, a comparison has no single text:
  // no op turns either into text.
  if (
    target?.type === 'diagramm' ||
    target?.type === 'vergleich' ||
    target?.type === 'zahl' ||
    target?.type === 'rechnung' ||
    target?.type === 'termine' ||
    target?.type === 'schlagzeile' ||
    target?.type === 'bingo'
  ) {
    return op.op !== 'remove_item';
  }
  // The closing call stays one: shortened, never dropped or turned into a headline.
  if (target?.type === 'aufruf') return op.op !== 'set_text';
  if (op.op === 'set_text') return target?.type === 'zitat' || target?.type === 'frage';
  if (target?.type !== 'zitat') return false;
  if (op.op === 'set_headline') return true;
  const zitate = slides.flatMap((s, i) =>
    s.items.flatMap((item, j) => (item.type === 'zitat' ? [`${i}:${j}`] : []))
  );
  if (zitate.filter((key) => !removed.has(key)).length <= 1) return true;
  removed.add(`${op.slide ?? 0}:${op.item}`);
  return false;
}

/** `slides` (the draft the review looked at) lets the review protect its quotes. */
export function validateReview(
  input: unknown,
  itemCounts: number[],
  slides: SharepicSlide[] = []
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
          'Ein einzelnes == oder ++ im Text – Hervorhebungen immer als ==Wort== bzw. ++Passage++ paaren, ohne Leerzeichen innen.',
      };
    }
    // Same marker rules as a draft: at most two passages, and only where a
    // marker may stand (quote, paragraph, headline). Austria is checked by the composer.
    const passages = texts.reduce((n, t) => n + countMarkerPassages(t), 0);
    const target = op.op === 'set_text' ? slides[op.slide ?? 0]?.items[op.item ?? -1] : null;
    if (
      passages > SHAREPIC_MARKER_PASSAGES ||
      (passages > 0 &&
        target &&
        target.type !== 'zitat' &&
        target.type !== 'absatz' &&
        target.type !== 'headline')
    ) {
      return {
        ok: false,
        error: `++Passage++ steht nur in zitat, absatz und headline, höchstens ${SHAREPIC_MARKER_PASSAGES} pro Slide.`,
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
  const removed = new Set<string>();
  const patch = parsed.data.patch.filter((op) => !protectsZitat(op, slides, removed));
  return { ok: true, value: { ...parsed.data, issues: parsed.data.issues.slice(0, 3), patch } };
}

/** Live the review shrank a headline right after "Schrift größer" and rewrote one on a colour edit. */
const EDIT_RULE =
  'Das Sharepic wurde gerade auf diesen Änderungswunsch hin überarbeitet. Die Änderung ist gewollt: mach sie nie rückgängig und widersprich ihr nicht – weder in issues noch im patch (nach „Schrift größer“ keine Headline als zu groß bemängeln oder kürzen, nach einer Farbänderung die Farbe nicht zurücksetzen). Prüfe vor allem, ob dabei etwas kaputtgegangen ist (Überlappung, Abgeschnittenes, Kontrast), und schreib keine Texte um, die der Wunsch nicht betrifft.';

/** Issues reach the person: the model's 0-based "Slide N" becomes "Folie N+1". */
const folien = (issue: string) =>
  issue.replace(/\bSlides?\s+(\d+)\b/g, (_, n: string) => `Folie ${Number(n) + 1}`);

/** A failed check is not a failed draft: the draft stands, unreviewed. */
export async function reviewSharepic(
  spec: SharepicSpec,
  prompt: string,
  image: string,
  mode: SharepicReviewMode = 'draft'
): Promise<SharepicReviewResponse> {
  const slides = spec.slides
    .map((slide, s) => {
      const { items, ...frame } = slide;
      const lines = items.map((item, i) => `  ${i}: ${JSON.stringify(item)}`).join('\n');
      return `Slide ${s}: ${JSON.stringify(frame)}\n items:\n${lines}`;
    })
    .join('\n\n');
  // The draft already took the closest colour; a patch back to "sand" only retried.
  const palette = paletteSubstitutions(prompt, spec.locale);
  const colourHint = palette.length ? `\n\n${paletteHint(palette)}` : '';
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
              source: {
                data: await toJpegBase64(image, { width: 2048, height: 1024 }),
                media_type: 'image/jpeg',
              },
            },
            {
              type: 'text',
              text: `${mode === 'edit' ? `Änderungswunsch der Person:\n${prompt}\n\n${EDIT_RULE}` : `Auftrag:\n${prompt}`}${colourHint}\n\nEntwurf (${spec.slides.length === 1 ? 'Einzelbild' : `Karussell, ${spec.slides.length} Slides`}):\n${slides}`,
            },
          ],
        },
      ],
      toolName: 'pruefung_abgeben',
      toolDescription: 'Gib das Prüfergebnis mit Problemen und Korrekturen ab.',
      schema: REVIEW_SCHEMA,
      validate: (input) =>
        validateReview(
          withPaletteColors(input, spec.locale),
          spec.slides.map((slide) => slide.items.length),
          spec.slides
        ),
      maxOutputTokens: 1500,
      label: 'sharepicCreator:review',
    });
    if (result.ok) {
      log.info(
        `review ok=${result.data.ok} issues=${JSON.stringify(result.data.issues)} patch=${JSON.stringify(result.data.patch)}`
      );
      return { ...result.data, issues: result.data.issues.map(folien) };
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

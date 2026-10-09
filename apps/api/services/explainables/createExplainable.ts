/**
 * Creates an explainable: books the image budget up front, lets the model
 * re-tell the brief in einfache Sprache, stores the page and leaves the
 * illustrations to `explainableImageWorker`.
 *
 * The sources are the caller's (the turn's citations), never the model's: the
 * model only sees them to keep its [n] markers, and markers it invents are
 * dropped.
 */
import {
  EXPLAINABLE_MAX_IMAGES,
  explainableDraftSchema,
  type ExplainableContent,
  type ExplainableDraft,
  type ExplainableSource,
} from '@gruenerator/contracts';
import { IMAGE_MODEL_BY_ID } from '@gruenerator/shared/models';
import { generateSlugSuffix, slugifyName } from '@gruenerator/shared/utils';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { createLogger } from '../../utils/logger.js';
import { getUsageUserId, runWithUsageContext } from '../../utils/usageContext.js';
import { aiObject } from '../ai/generate.js';
import { type StructuredValidation } from '../ai/structuredParsing.js';
import { getTreeBudget, treeBudgetSpentMessage, treeCostForImage } from '../trees/index.js';

import { insertExplainable } from './explainableRepository.js';

const log = createLogger('createExplainable');

export interface CreateExplainableInput {
  userId: string;
  brief: string;
  sources: ExplainableSource[];
  threadId: string | null;
  sourceMessageId: string | null;
  locale: 'de-DE' | 'de-AT';
}

export type CreateExplainableResult =
  | { ok: true; id: string; slugSuffix: string; title: string; url: string; imageCount: number }
  | {
      ok: false;
      code: 'budget_exhausted' | 'budget_unavailable' | 'generation_failed';
      message: string;
    };

/** Explainable images always run on FLUX Klein: cheap, and a flat drawing needs no more. */
export const EXPLAINABLE_IMAGE_MODEL = IMAGE_MODEL_BY_ID['flux-klein'];

export function explainableImageUnits(): number {
  return treeCostForImage(EXPLAINABLE_IMAGE_MODEL.costMultiplier);
}

export function explainableUrl(title: string, slugSuffix: string): string {
  return `/erklaert/${slugifyName(title, 'erklaerung')}-${slugSuffix}`;
}

const BRIEF_MAX_CHARS = 24_000;

const DRAFT_TOOL_SCHEMA = zodToJsonSchema(explainableDraftSchema, {
  target: 'jsonSchema7',
  $refStrategy: 'none',
}) as Record<string, unknown>;

const AUSTRIA_BLOCK = `
## LÄNDERKONTEXT: ÖSTERREICH
Die Leser*innen leben in Österreich. Schreib österreichisches Deutsch (z. B. „Jänner“, „heuer“) und erkläre Einrichtungen aus dem österreichischen Zusammenhang (z. B. Nationalrat, Landtag, Gemeinderat). Übertrage keine Begriffe aus Deutschland, die in Österreich anders heißen oder nicht gelten.`;

export function buildSystemPrompt(locale: 'de-DE' | 'de-AT'): string {
  return `Du schreibst Erklärseiten in einfacher Sprache. Du bekommst einen Ausgangstext und machst daraus eine kurze, gut gegliederte Erklärung für Menschen ohne Vorwissen.

## SPRACHE
- Einfache Sprache (nicht „Leichte Sprache“): kurze Sätze, ein Gedanke pro Satz, aktive Formulierungen, keine Schachtelsätze.
- Fachbegriffe erklärst du beim ersten Vorkommen in einem Halbsatz und nimmst die wichtigsten ins Glossar auf.
- Sprich die Leser*innen nicht direkt an und bewerte nicht. Kein Werbeton.

## INHALT
- Verwende ausschließlich Fakten aus dem Ausgangstext. Erfinde keine Zahlen, Namen, Daten oder Zusammenhänge.
- Der Ausgangstext enthält Quellenmarker wie [1] oder [2]. Behalte sie an den Stellen, deren Aussage sie belegen. Verwende nur Nummern aus der Quellenliste, erfinde keine neuen.
- Gliederung: ein Titel, eine Zusammenfassung in zwei bis drei Sätzen, 2 bis 6 Abschnitte mit kurzer Überschrift und 1 bis 4 Absätzen, 2 bis 5 Kernaussagen („Das Wichtigste“), optional ein Glossar.

## BILDER
- Gib 2 bis ${EXPLAINABLE_MAX_IMAGES} Abschnitten ein \`image\` – Erklärbilder sind fester Bestandteil jeder Erklärseite. Wähle die Abschnitte, in denen eine Zeichnung den Inhalt am besten veranschaulicht (ein Ablauf, ein Aufbau, ein Vorher-Nachher).
- \`image.prompt\` schreibst du auf ENGLISCH: eine einfache, flache Erklärillustration der Kernidee des Abschnitts (Gegenstände, Symbole, Abläufe, Orte). Keine Schrift, keine Buchstaben, keine Zahlen, keine Logos. Keine realen oder erkennbaren Personen; wenn Menschen vorkommen, dann nur als neutrale, gesichtslose Figuren.
- \`image.alt\` schreibst du auf Deutsch: ein Satz, der beschreibt, was auf dem Bild zu sehen ist.
${locale === 'de-AT' ? AUSTRIA_BLOCK : ''}`;
}

function buildPrompt(brief: string, sources: ExplainableSource[]): string {
  const sourceList = sources.length
    ? sources.map((s) => `[${s.index}] ${s.title}`).join('\n')
    : '(keine Quellen – setze keine Quellenmarker)';
  return `## QUELLEN\n${sourceList}\n\n## AUSGANGSTEXT\n${brief.slice(0, BRIEF_MAX_CHARS)}`;
}

function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((v) => v !== null).map(dropNulls);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry !== null) out[key] = dropNulls(entry);
    }
    return out;
  }
  return value;
}

const MAX_SECTIONS = 6;
const MAX_PARAGRAPHS = 4;
const MAX_PARAGRAPH_CHARS = 1200;

function clipAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > max / 2 ? cut.slice(0, end + 1) : cut;
}

/**
 * Models overshoot list limits (measured: 5+ paragraphs in one section on
 * Mistral Medium, twice in a row despite the repair turn). Overflow is folded
 * in rather than rejected, so a usable draft never fails on a count.
 */
export function fitDraftToLimits(input: unknown): unknown {
  if (input === null || typeof input !== 'object') return input;
  const draft = { ...(input as Record<string, unknown>) };
  if (Array.isArray(draft.sections)) {
    let images = 0;
    draft.sections = draft.sections.slice(0, MAX_SECTIONS).map((raw: unknown) => {
      if (raw === null || typeof raw !== 'object') return raw;
      const section = { ...(raw as Record<string, unknown>) };
      const paragraphs = section.paragraphs;
      if (Array.isArray(paragraphs) && paragraphs.every((p) => typeof p === 'string')) {
        const kept = (paragraphs as string[]).slice(0, MAX_PARAGRAPHS);
        if (paragraphs.length > MAX_PARAGRAPHS) {
          const overflow = (paragraphs as string[]).slice(MAX_PARAGRAPHS - 1).join(' ');
          kept[MAX_PARAGRAPHS - 1] = overflow;
        }
        section.paragraphs = kept.map((p) => clipAtSentence(p, MAX_PARAGRAPH_CHARS));
      }
      if (section.image) {
        images += 1;
        if (images > EXPLAINABLE_MAX_IMAGES) delete section.image;
      }
      return section;
    });
  }
  if (Array.isArray(draft.keyTakeaways)) draft.keyTakeaways = draft.keyTakeaways.slice(0, 5);
  if (Array.isArray(draft.glossary)) draft.glossary = draft.glossary.slice(0, 8);
  return draft;
}

export function validateDraft(input: unknown): StructuredValidation<ExplainableDraft> {
  const parsed = explainableDraftSchema.safeParse(fitDraftToLimits(dropNulls(input)));
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return { ok: false, error: `Ungültige Erklärseite: ${issues}` };
}

/** Removes [n] markers that name no given source. */
export function keepKnownMarkers(text: string, known: ReadonlySet<number>): string {
  return text
    .replace(/\s?\[(\d+)\]/g, (match, n: string) => (known.has(Number(n)) ? match : ''))
    .trim();
}

export function toContent(
  draft: ExplainableDraft,
  sources: ExplainableSource[]
): ExplainableContent {
  const known = new Set(sources.map((s) => s.index));
  const clean = (text: string): string => keepKnownMarkers(text, known);
  let images = 0;
  return {
    title: clean(draft.title),
    summary: clean(draft.summary),
    sections: draft.sections.map((section) => {
      const image =
        section.image && images < EXPLAINABLE_MAX_IMAGES
          ? { ...section.image, status: 'pending' as const }
          : null;
      if (image) images++;
      return {
        heading: clean(section.heading),
        paragraphs: section.paragraphs.map(clean),
        ...(image && { image }),
      };
    }),
    keyTakeaways: draft.keyTakeaways.map(clean),
    ...(draft.glossary && draft.glossary.length > 0 ? { glossary: draft.glossary } : {}),
    sources,
  };
}

function withUsage<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  if (getUsageUserId()) return fn();
  return runWithUsageContext({ req: { user: { id: userId } }, feature: 'notebook' }, fn);
}

async function insertWithFreshSuffix(
  input: Omit<Parameters<typeof insertExplainable>[0], 'slugSuffix'>
): Promise<{ id: string; slugSuffix: string }> {
  for (let attempt = 1; ; attempt++) {
    const slugSuffix = generateSlugSuffix();
    try {
      const { id } = await insertExplainable({ ...input, slugSuffix });
      return { id, slugSuffix };
    } catch (error) {
      if (attempt >= 3 || !String((error as Error).message).includes('slug_suffix')) throw error;
    }
  }
}

export async function createExplainable(
  input: CreateExplainableInput
): Promise<CreateExplainableResult> {
  const { userId } = input;
  const unitsPerImage = explainableImageUnits();
  const reservedUnits = EXPLAINABLE_MAX_IMAGES * unitsPerImage;
  const budget = getTreeBudget();

  const reservation = await budget.reserve(userId, reservedUnits);
  if (!reservation.ok) {
    if (reservation.reason === 'unavailable') {
      return {
        ok: false,
        code: 'budget_unavailable',
        message:
          'Das Kontingent lässt sich gerade nicht prüfen. Bitte versuch es gleich noch einmal.',
      };
    }
    return {
      ok: false,
      code: 'budget_exhausted',
      message: treeBudgetSpentMessage(reservation.status, reservedUnits),
    };
  }
  const day = reservation.status.day;

  const releaseQuietly = async (units: number): Promise<void> => {
    if (units <= 0) return;
    try {
      await budget.release(userId, units, day);
    } catch (error) {
      log.warn(`Release of ${units} units failed: ${(error as Error).message}`);
    }
  };

  let content: ExplainableContent;
  try {
    const generated = await withUsage(userId, () =>
      aiObject<ExplainableDraft>({
        lane: 'explainable',
        system: buildSystemPrompt(input.locale),
        prompt: buildPrompt(input.brief, input.sources),
        toolName: 'create_explainable',
        toolDescription: 'Erzeugt eine Erklärseite in einfacher Sprache.',
        schema: DRAFT_TOOL_SCHEMA,
        validate: validateDraft,
        temperature: 0.4,
        label: 'explainable',
      })
    );
    if (!generated.ok) throw new Error(generated.error);
    content = toContent(generated.data, input.sources);
  } catch (error) {
    log.warn(`Generation failed: ${(error as Error).message}`);
    await releaseQuietly(reservedUnits);
    return {
      ok: false,
      code: 'generation_failed',
      message: 'Die Erklärung konnte nicht erstellt werden. Bitte versuch es noch einmal.',
    };
  }

  const imageCount = content.sections.filter((s) => s.image).length;
  const keptUnits = imageCount * unitsPerImage;

  let created: { id: string; slugSuffix: string };
  try {
    created = await insertWithFreshSuffix({
      userId,
      threadId: input.threadId,
      sourceMessageId: input.sourceMessageId,
      title: content.title,
      content,
      status: imageCount > 0 ? 'images_pending' : 'ready',
      reservedUnits: keptUnits,
      reservedDay: keptUnits > 0 ? day : null,
    });
  } catch (error) {
    log.error(`Insert failed: ${(error as Error).message}`);
    await releaseQuietly(reservedUnits);
    return {
      ok: false,
      code: 'generation_failed',
      message: 'Die Erklärung konnte nicht gespeichert werden. Bitte versuch es noch einmal.',
    };
  }

  await releaseQuietly(reservedUnits - keptUnits);

  return {
    ok: true,
    id: created.id,
    slugSuffix: created.slugSuffix,
    title: content.title,
    url: explainableUrl(content.title, created.slugSuffix),
    imageCount,
  };
}

/** Chat sharepic helpers: topic extraction, refinement detection, prior-sharepic lookup. */
import { type SharepicVariant } from '@gruenerator/contracts';

import { createLogger } from '../../../utils/logger.js';

import { asksForNewArtifact, isVerificationQuestion } from './sharepicEditHeuristics.js';

const log = createLogger('SharepicVariants');

/**
 * Strip the @sharepic mention, task verbs, filler words and the sharepic/variant
 * nouns from the message, leaving just the subject the sharepic should be about.
 * E.g. "erstelle mir ein zitat sharepic über artenschutz" → "artenschutz".
 *
 * The result feeds the prompt's `thema` field — without this the chat path sent
 * an empty topic and the AI invented a generic, off-topic sharepic.
 */
export function extractSharepicTopic(rawText: string): string {
  return rawText
    .replace(/@sharepic\b/gi, ' ')
    .replace(/\b(erstelle?|erstell|mache?|generiere?|baue?|gib|zeige?|entwirf|brauche?)\b/gi, ' ')
    .replace(/\b(mir|bitte|ein|eine|einen|einem|das|den|die)\b/gi, ' ')
    .replace(
      /\b(share[\s-]?pics?|sharepics?|spruchbild\w*|zitatbild\w*|zitat\w*|spruch\w*|dreizeiler|dreizeilen|drei[\s-]?zeilen|info\w*|slogan|balken|sliders?|karussells?|carousels?|slides?|folien)\b/gi,
      ' '
    )
    .replace(/\b(über|ueber|zum\s+thema|thema|zu|zum|zur|für|fuer)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when a sharepic request carries no usable subject (e.g. a bare
 * "@sharepic" or "zitat sharepic"). The chat then asks the user for the topic.
 */
export function isSharepicTopicMissing(rawText: string): boolean {
  return extractSharepicTopic(rawText).length < 2;
}

/**
 * Edit/refine verbs that, when sent right after a sharepic, mean "adjust the one
 * you just made" rather than "make a new one about the word 'verlängern'".
 */
const REFINE_PATTERN =
  /\b(verläng\w*|länger|laenger|kürz\w*|kuerz\w*|kürzer|knackiger|prägnanter|praegnanter|formell\w*|locker\w*|emotional\w*|sachlich\w*|freundlich\w*|ändere?|änder\w*|aender\w*|anpass\w*|optimier\w*|verbesser\w*|umformulier\w*|umschreib\w*|anders|anderes?\s+(bild|foto|motiv|hintergrund)|neues?\s+(bild|foto|motiv|hintergrund)|mach\s+(es|das|ihn|sie|mal)\b)/i;

/**
 * True when the message reads like an instruction to modify an existing sharepic.
 * Only meaningful when the previous assistant turn was a sharepic.
 */
export function isSharepicRefinement(text: string): boolean {
  // A turn that asks for a NEW artifact is a creation, whatever edit wording it
  // also carries — "Schreib einen Post UND eine Pressemitteilung. Kürze danach
  // nur die Pressemitteilung." matched on "Kürze" alone and produced nothing.
  if (asksForNewArtifact(text)) return false;
  // REFINE_PATTERN fires on a single everyday word, so it swallows questions
  // that merely contain one: "Ist das sachlich korrekt?" matched on "sachlich"
  // and was answered as an edit command.
  if (isVerificationQuestion(text)) return false;
  return REFINE_PATTERN.test(text);
}

/** The previous sharepic's variant + its rendered text, loaded from thread history. */
export interface PriorSharepic {
  variantId: string;
  canvasType: string;
  props: Record<string, unknown>;
  /** The canvas this variant was opened in, if any. */
  canvasId: string | null;
}

type StoredVariant = {
  id?: string;
  canvasType?: string;
  initialProps?: Record<string, unknown>;
  canvasId?: string;
};

type Pg = { query: (sql: string, params: unknown[]) => Promise<unknown> };

/** The sharepic variants of the thread's last 30 assistant messages, newest message first. */
async function loadRecentSharepicVariants(pg: Pg, threadId: string): Promise<StoredVariant[][]> {
  // pg.query resolves to the rows array directly (not a { rows } wrapper).
  const rows = (await pg.query(
    `SELECT tool_results FROM chat_messages
     WHERE thread_id = $1 AND role = 'assistant' AND tool_results IS NOT NULL
     ORDER BY created_at DESC LIMIT 30`,
    [threadId]
  )) as Array<{ tool_results?: unknown }>;
  const perMessage: StoredVariant[][] = [];
  for (const row of rows ?? []) {
    const raw = row?.tool_results;
    if (!raw) continue;
    const meta = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
      toolCalls?: Array<{ toolName?: string; result?: { variants?: unknown[] } }>;
    };
    const sharepicCall = meta.toolCalls?.find((tc) => tc?.toolName === 'sharepic');
    perMessage.push((sharepicCall?.result?.variants ?? []) as StoredVariant[]);
  }
  return perMessage;
}

async function toPriorSharepic(
  pg: Pg,
  threadId: string,
  chosen: StoredVariant | null
): Promise<PriorSharepic | null> {
  if (!chosen?.canvasType) return null;
  const id = chosen.id ?? '';
  let canvasId = chosen.canvasId ?? null;
  if (!canvasId && id) {
    const bound = (await pg.query(
      `SELECT canvas_id FROM chat_thread_canvases WHERE thread_id = $1 AND variant_id = $2 LIMIT 1`,
      [threadId, id]
    )) as Array<{ canvas_id?: string | null }> | undefined;
    canvasId = bound?.[0]?.canvas_id ?? null;
  }
  return {
    variantId: id,
    canvasType: chosen.canvasType,
    props: chosen.initialProps ?? {},
    canvasId,
  };
}

/**
 * Find the thread's most recent sharepic and return its first variant
 * (canvasType + the text props). Used to seed a refined regeneration
 * ("verlängern" → lengthen the existing quote, same topic).
 *
 * Scans the last 30 assistant messages, not just the newest one. With LIMIT 1 a
 * single intervening reply — one question answered between building the sharepic
 * and refining it — made the sharepic invisible and the refinement silently
 * became a fresh creation. 30 matches findVariants (sharepicEditService) so the
 * two agree on what "the thread has a sharepic" means.
 *
 * With `variantId`, that variant is looked up in the same window; an unknown id
 * falls back to the newest sharepic. `canvasId` comes from the stamped variant
 * or its `chat_thread_canvases` binding, queried here rather than through
 * sharepicEditService to keep the two modules free of an import cycle.
 */
export async function getLastSharepicVariant(
  threadId: string,
  variantId?: string | null
): Promise<PriorSharepic | null> {
  try {
    const { getPostgresInstance } = await import('../../../database/services/PostgresService.js');
    const pg = getPostgresInstance();
    let newest: StoredVariant | null = null;
    let named: StoredVariant | null = null;
    for (const variants of await loadRecentSharepicVariants(pg, threadId)) {
      const first = variants[0];
      if (!newest && first?.canvasType) newest = first;
      if (variantId) {
        named = variants.find((v) => v?.id === variantId && v.canvasType) ?? null;
        if (named) break;
      } else if (newest) {
        break;
      }
    }
    return await toPriorSharepic(pg, threadId, named ?? newest);
  } catch (err) {
    log.warn(`[SharepicVariants] Could not load prior sharepic: ${err}`);
    return null;
  }
}

/**
 * The newest revision of the named variant: follows `initialProps.revisionOf`
 * forward through the same 30-message window, so a card that stays open while
 * its revisions land below it keeps editing the latest one. Unlike
 * `getLastSharepicVariant`, an id outside the window yields null rather than
 * an unrelated newest sharepic.
 */
export async function getSharepicRevisionHead(
  threadId: string,
  variantId: string
): Promise<PriorSharepic | null> {
  try {
    const { getPostgresInstance } = await import('../../../database/services/PostgresService.js');
    const pg = getPostgresInstance();
    const all = (await loadRecentSharepicVariants(pg, threadId)).flat();
    let head = all.find((v) => v?.id === variantId && v.canvasType) ?? null;
    const seen = new Set<string>();
    while (head?.id) {
      seen.add(head.id);
      const parentId = head.id;
      const next = all.find((v) => v?.canvasType && v.initialProps?.revisionOf === parentId);
      if (!next?.id || seen.has(next.id)) break;
      head = next;
    }
    return await toPriorSharepic(pg, threadId, head);
  } catch (err) {
    log.warn(`[SharepicVariants] Could not load sharepic revision head: ${err}`);
    return null;
  }
}

// Canonical shape lives in @gruenerator/contracts (sharepicVariantSchema) —
// shared with the sharepic_complete wire payload and the frontend cards, so
// generator, stream and UI can't drift.
export type { SharepicVariant };

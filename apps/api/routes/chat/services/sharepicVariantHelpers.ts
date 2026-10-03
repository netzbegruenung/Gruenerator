/**
 * Chat sharepic helpers. `generateSharepicVariants` only revises OLD template
 * sharepics (prior without `creatorSpec`); fresh drafts go through the creator
 * (`sharepicCreatorVariant`).
 */
import { randomUUID } from 'crypto';

import {
  AT_CANVAS_TYPE_OVERRIDES,
  buildVariantInitialProps,
  CANVAS_TYPE_TO_GEN,
  getSharepicVariantLabel,
  SHAREPIC_GEN_TO_CANVAS_TYPE,
  type CanvasTemplateType,
  type SharepicGeneratedContent,
  type SharepicVariant,
} from '@gruenerator/contracts';

import {
  generateSharepicForChat,
  type ExpressRequest as SharepicExpressRequest,
} from '../../../services/chat/sharepicGenerationService.js';
import { createLogger } from '../../../utils/logger.js';

import { errorText, isRefusalError, REFUSAL_ERROR_PREFIX } from './refusalDetection.js';
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
    // pg.query resolves to the rows array directly (not a { rows } wrapper).
    const rows = (await pg.query(
      `SELECT tool_results FROM chat_messages
       WHERE thread_id = $1 AND role = 'assistant' AND tool_results IS NOT NULL
       ORDER BY created_at DESC LIMIT 30`,
      [threadId]
    )) as Array<{ tool_results?: unknown }>;

    type StoredVariant = {
      id?: string;
      canvasType?: string;
      initialProps?: Record<string, unknown>;
      canvasId?: string;
    };
    let newest: StoredVariant | null = null;
    let named: StoredVariant | null = null;
    for (const row of rows ?? []) {
      const raw = row?.tool_results;
      if (!raw) continue;
      const meta = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
        toolCalls?: Array<{ toolName?: string; result?: { variants?: unknown[] } }>;
      };
      const sharepicCall = meta.toolCalls?.find((tc) => tc?.toolName === 'sharepic');
      const variants = (sharepicCall?.result?.variants ?? []) as StoredVariant[];
      const first = variants[0];
      if (!newest && first?.canvasType) newest = first;
      if (variantId) {
        named = variants.find((v) => v?.id === variantId && v.canvasType) ?? null;
        if (named) break;
      } else if (newest) {
        break;
      }
    }
    const chosen = named ?? newest;
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
  } catch (err) {
    log.warn(`[SharepicVariants] Could not load prior sharepic: ${err}`);
    return null;
  }
}

// Canonical shape lives in @gruenerator/contracts (sharepicVariantSchema) —
// shared with the sharepic_complete wire payload and the frontend cards, so
// generator, stream and UI can't drift.
export type { SharepicVariant };

function mapSharepicTypeToCanvasType(
  sharepicType: string,
  userLocale?: string
): CanvasTemplateType {
  const base = SHAREPIC_GEN_TO_CANVAS_TYPE[sharepicType] ?? 'dreizeilen';
  if (userLocale === 'de-AT') return AT_CANVAS_TYPE_OVERRIDES[base] ?? base;
  return base;
}

/**
 * The generator's response. `SharepicGeneratedContent` (contracts) covers the
 * fields that become `initialProps`; `type` and `altText` are consumed here.
 */
interface SharepicResponseShape extends SharepicGeneratedContent {
  type: string;
  altText?: string;
}

interface GenerateVariantsArgs {
  req: SharepicExpressRequest;
  /**
   * Author name for quote sharepics, taken from the user's profile. Ignored by
   * the dreizeilen/info variants. When empty the quote renders without an author.
   */
  authorName?: string;
  /**
   * Regenerate a single variant seeded with the previous sharepic's text plus
   * this instruction (e.g. "verlängern").
   */
  refinement: { instruction: string; prior: PriorSharepic };
  /** Signed-in user's locale; when 'de-AT' the variants use the Austrian configs. */
  userLocale?: string;
}

/** One generation request: a sharepic type plus the body passed to the prompt. */
interface VariantRequest {
  type: string;
  body: Record<string, unknown>;
}

/**
 * Build the single regeneration request for a refinement. The previous text is
 * fed back to the model (as the quote to optimise, or described in Details) along
 * with the user's modification instruction, so the topic/core message is kept.
 *
 * This is the FALLBACK path: it produces a brand-new variant rather than an
 * in-place edit with a version history. It now only runs for templates without
 * a descriptor (freeform, freeform-at, profilbild) or when no target variant
 * could be resolved — everything else goes through `handleSharepicEdit`.
 */
function buildRefinementRequest(
  refinement: { instruction: string; prior: PriorSharepic },
  authorName?: string
): VariantRequest {
  const { instruction, prior } = refinement;
  const p = prior.props;
  const genType = CANVAS_TYPE_TO_GEN[prior.canvasType] ?? 'dreizeilen';
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');

  if (genType === 'zitat_pure') {
    const quote = str(p.quote);
    const name = authorName || str(p.name);
    return {
      type: 'zitat_pure',
      body: {
        quote,
        text: quote,
        subject: quote,
        details: `Überarbeite das bestehende Zitat wie folgt: ${instruction}. Behalte Thema und Kernaussage bei.`,
        count: 1,
        ...(name && { name }),
      },
    };
  }

  if (genType === 'info') {
    // AT info stores introline/text/accent; DE info stores header/(subheader)/body.
    const header = str(p.header) || str(p.headline) || str(p.introline);
    const accent = str(p.accent);
    const body = str(p.body) || str(p.text);
    const combined = [header, accent, body].filter(Boolean).join(' ');
    return {
      type: 'info',
      body: {
        text: combined,
        subject: combined,
        details: `Überarbeite diesen Infotext wie folgt: ${instruction}. Bestehender Text — Überschrift: "${[header, accent].filter(Boolean).join(' ')}", Inhalt: "${body}". Behalte Thema und Kernaussage bei.`,
        count: 1,
      },
    };
  }

  // dreizeilen (AT stores the middle line under `accent` instead of `line2`)
  const lines = [p.line1, p.line2 ?? p.accent, p.line3].map(str).filter(Boolean).join(' / ');
  return {
    type: 'dreizeilen',
    body: {
      text: lines,
      subject: lines,
      details: `Überarbeite diesen dreizeiligen Slogan wie folgt: ${instruction}. Bestehender Slogan: "${lines}". Behalte Thema und Kernaussage bei.`,
      count: 1,
    },
  };
}

/**
 * Map a successful generation result to a frontend SharepicVariant.
 *
 * `forcedCanvasType` hält eine Verfeinerung auf ihrem Sujet. Ohne das liefe
 * jede Überarbeitung erneut durch AT_CANVAS_TYPE und könnte auf ein anderes
 * Sujet umspringen — der Nutzer hat aber eine Änderung am Text verlangt,
 * nicht am Layout.
 */
function toVariant(
  sharepic: SharepicResponseShape,
  requestedType: string,
  userLocale?: string,
  forcedCanvasType?: CanvasTemplateType
): SharepicVariant {
  const canvasType =
    forcedCanvasType ?? mapSharepicTypeToCanvasType(sharepic.type ?? requestedType, userLocale);
  return {
    id: randomUUID(),
    canvasType,
    initialProps: buildVariantInitialProps(canvasType, sharepic),
    label: getSharepicVariantLabel(canvasType),
    ...(sharepic.altText && { altText: sharepic.altText }),
  };
}

/**
 * Variants, plus the reason when the run produced none because the model
 * DECLINED rather than failed.
 *
 * The distinction has to survive this function. A decline used to be logged and
 * then folded into the same empty array a timeout produces, so the chat told the
 * user "Sharepic-Erstellung fehlgeschlagen / All variant generations failed" —
 * a technical fault. On the combined social_post path the cross-gate already
 * says the honest thing; the pure sharepic path had no channel for it, which
 * made correct policy behaviour indistinguishable from an outage.
 */
export interface SharepicVariantsResult {
  variants: SharepicVariant[];
  /** German, user-facing reason from the model's ABLEHNUNG channel; null when
   *  nothing was declined (including when variants were produced). */
  declinedReason: string | null;
}

export async function generateSharepicVariants(
  args: GenerateVariantsArgs
): Promise<SharepicVariantsResult> {
  const requests: VariantRequest[] = [buildRefinementRequest(args.refinement, args.authorName)];

  // Injected here rather than at each request-building site so the refinement
  // path gets it too. The text handler uses it to pick a `<type>_at` prompt.
  const settled = await Promise.allSettled(
    requests.map((r) =>
      generateSharepicForChat(args.req, r.type, {
        ...r.body,
        ...(args.userLocale && { userLocale: args.userLocale }),
      })
    )
  );

  const variants: SharepicVariant[] = [];
  let declinedReason: string | null = null;
  settled.forEach((result, idx) => {
    const requestedType = requests[idx].type;
    if (result.status !== 'fulfilled') {
      // A refusal is the safety rules working, not a fault: log the reason,
      // not an Error object whose stack points at the generator.
      if (isRefusalError(result.reason)) {
        const reason = errorText(result.reason);
        log.info(`[SharepicVariants] ${requestedType} variant declined — ${reason}`);
        declinedReason ??= reason.slice(REFUSAL_ERROR_PREFIX.length).trim() || null;
        return;
      }
      log.warn(`[SharepicVariants] ${requestedType} variant rejected:`, result.reason);
      return;
    }
    if (!result.value.success) {
      log.warn(`[SharepicVariants] ${requestedType} variant unsuccessful`);
      return;
    }
    const sharepic = result.value.content.sharepic as SharepicResponseShape;
    const priorType = args.refinement.prior.canvasType as CanvasTemplateType;
    variants.push(toVariant(sharepic, requestedType, args.userLocale, priorType));
  });

  // One declined type among several successful ones is a per-type quirk, not a
  // policy answer to the request — only report it when NOTHING came back.
  return { variants, declinedReason: variants.length === 0 ? declinedReason : null };
}

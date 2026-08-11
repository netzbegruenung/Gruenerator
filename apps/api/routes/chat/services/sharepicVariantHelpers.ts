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

export const SHAREPIC_VARIANT_TYPES = ['dreizeilen', 'zitat', 'info'] as const;
/**
 * `slider` is requestable via keyword ("als Karussell") but deliberately NOT
 * part of the generic 3-variant fanout — a deck is a different artifact and
 * runs through `generateSliderDeckVariant` instead.
 */
export type SharepicVariantType = (typeof SHAREPIC_VARIANT_TYPES)[number] | 'slider';

/**
 * Keyword patterns that pin a sharepic request to a SPECIFIC variant.
 *
 * Order matters: the first match wins. `zitat` is checked first so
 * "zitat sharepic" / "zitat-sharepic" resolves to the quote layout instead of
 * falling through to the dreizeilen default. The `dreizeilen` synonyms include
 * "balken" because users call that layout the "3-Balken-Bild".
 *
 * These are only consulted AFTER the message is already classified as a sharepic
 * request, so chart terms like "balkendiagramm" never reach this map.
 */
const VARIANT_KEYWORDS: ReadonlyArray<{ type: SharepicVariantType; pattern: RegExp }> = [
  {
    // Checked first: "slides"/"folien" must win over the dreizeilen fallback.
    type: 'slider',
    pattern: /\b(sliders?|karussells?|carousels?|slides?|folien|insta[\s-]?slides?)\b/i,
  },
  {
    type: 'zitat',
    pattern: /\b(zitat\w*|quotes?|spruch\w*|spruchbild|zitatbild|aussage|statement)\b/i,
  },
  {
    type: 'info',
    pattern: /\b(info\w*|fakten|faktencheck|information\w*|erklär\w*|erklaer\w*)\b/i,
  },
  {
    type: 'dreizeilen',
    pattern:
      /\b(dreizeiler|dreizeilen|drei[\s-]?zeilen|3[\s-]?zeilen|slogan|dreibalken|drei[\s-]?balken|balken)\b/i,
  },
];

/**
 * Detect whether the user explicitly asked for a particular sharepic variant.
 * Returns null when the request is generic ("erstelle ein sharepic"), in which
 * case all variants are generated so the user can choose.
 */
export function detectPreferredVariant(text: string): SharepicVariantType | null {
  for (const { type, pattern } of VARIANT_KEYWORDS) {
    if (pattern.test(text)) return type;
  }
  return null;
}

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
  canvasType: string;
  props: Record<string, unknown>;
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
 */
export async function getLastSharepicVariant(threadId: string): Promise<PriorSharepic | null> {
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

    for (const row of rows ?? []) {
      const raw = row?.tool_results;
      if (!raw) continue;
      const meta = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
        toolCalls?: Array<{ toolName?: string; result?: { variants?: unknown[] } }>;
      };
      const sharepicCall = meta.toolCalls?.find((tc) => tc?.toolName === 'sharepic');
      const first = sharepicCall?.result?.variants?.[0] as
        { canvasType?: string; initialProps?: Record<string, unknown> } | undefined;
      if (first?.canvasType) {
        return { canvasType: first.canvasType, props: first.initialProps ?? {} };
      }
    }
    return null;
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
  text: string;
  /**
   * When set, only this variant is generated (the user explicitly asked for it,
   * e.g. "zitat sharepic"). When omitted, all variants are generated so the user
   * can choose.
   */
  preferredVariant?: SharepicVariantType | null;
  /**
   * Author name for quote sharepics, taken from the user's profile. Ignored by
   * the dreizeilen/info variants. When empty the quote renders without an author.
   */
  authorName?: string;
  /**
   * When set, regenerate a single variant seeded with the previous sharepic's
   * text plus this instruction (e.g. "verlängern"), instead of starting fresh.
   */
  refinement?: { instruction: string; prior: PriorSharepic } | null;
  /**
   * The material the sharepic should be built FROM — thread transcript and any
   * research the thread already carries. Fills the `{{details}}` slot every
   * sharepic template has and which, outside refinements, was always empty: the
   * generator saw `Thema: <topic>\nDetails: ` and had to invent the substance.
   * Documents/sheets/presentations have had this since runCreateTurn.
   */
  background?: string;
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
 * Welche Varianten erzeugt werden.
 *
 * Für de-AT wurde `info` hier früher durch `dreizeilen` ersetzt, weil das
 * Info-Sujet nur für Deutschland existierte — nach dem Entfernen des Duplikats
 * blieben für Österreich zwei Vorschläge statt drei. Mit `info-at` gilt für
 * beide Locales dieselbe Trias; die Übersetzung in das jeweilige Sujet
 * passiert erst in AT_CANVAS_TYPE.
 */
function resolveVariantTypes(
  preferred: SharepicVariantType | null | undefined
): ReadonlyArray<SharepicVariantType> {
  return preferred ? [preferred] : SHAREPIC_VARIANT_TYPES;
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
  let requests: VariantRequest[];

  if (args.refinement) {
    // Refinement: regenerate just the previous variant, seeded with its own text.
    requests = [buildRefinementRequest(args.refinement, args.authorName)];
  } else {
    const typesToGenerate = resolveVariantTypes(args.preferredVariant);

    // The prompt template fills its `thema` placeholder from `thema` — the chat
    // path previously omitted it, so the AI got an empty topic. Extract the
    // subject from the message; fall back to raw text if extraction strips all.
    const thema = extractSharepicTopic(args.text) || args.text;
    const details = args.background?.trim();

    requests = typesToGenerate.map((type) => ({
      type,
      body: {
        text: args.text,
        subject: args.text,
        thema,
        ...(details && { details }),
        count: 1,
        ...(args.authorName && { name: args.authorName }),
      },
    }));
  }

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
    const priorType = args.refinement?.prior.canvasType as CanvasTemplateType | undefined;
    variants.push(toVariant(sharepic, requestedType, args.userLocale, priorType));
  });

  // One declined type among several successful ones is a per-type quirk, not a
  // policy answer to the request — only report it when NOTHING came back.
  return { variants, declinedReason: variants.length === 0 ? declinedReason : null };
}

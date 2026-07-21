import { randomUUID } from 'crypto';

import { type CanvasTemplateType, type SharepicVariant } from '@gruenerator/contracts';

import {
  generateSharepicForChat,
  type ExpressRequest as SharepicExpressRequest,
} from '../../../services/chat/sharepicGenerationService.js';
import { createLogger } from '../../../utils/logger.js';

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
  return REFINE_PATTERN.test(text);
}

/** The previous sharepic's variant + its rendered text, loaded from thread history. */
export interface PriorSharepic {
  canvasType: string;
  props: Record<string, unknown>;
}

/**
 * Load the most recent assistant message in the thread and, if it was a sharepic,
 * return its first variant (canvasType + the text props). Used to seed a refined
 * regeneration ("verlängern" → lengthen the existing quote, same topic).
 */
export async function getLastSharepicVariant(threadId: string): Promise<PriorSharepic | null> {
  try {
    const { getPostgresInstance } = await import('../../../database/services/PostgresService.js');
    const pg = getPostgresInstance();
    // pg.query resolves to the rows array directly (not a { rows } wrapper).
    const rows = (await pg.query(
      `SELECT tool_results FROM chat_messages
       WHERE thread_id = $1 AND role = 'assistant'
       ORDER BY created_at DESC LIMIT 1`,
      [threadId]
    )) as Array<{ tool_results?: unknown }>;

    const raw = rows?.[0]?.tool_results;
    if (!raw) return null;
    const meta = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
      toolCalls?: Array<{ toolName?: string; result?: { variants?: unknown[] } }>;
    };
    const sharepicCall = meta.toolCalls?.find((tc) => tc?.toolName === 'sharepic');
    const first = sharepicCall?.result?.variants?.[0] as
      | { canvasType?: string; initialProps?: Record<string, unknown> }
      | undefined;
    if (!first?.canvasType) return null;
    return { canvasType: first.canvasType, props: first.initialProps ?? {} };
  } catch (err) {
    log.warn(`[SharepicVariants] Could not load prior sharepic: ${err}`);
    return null;
  }
}

// Canonical shape lives in @gruenerator/contracts (sharepicVariantSchema) —
// shared with the sharepic_complete wire payload and the frontend cards, so
// generator, stream and UI can't drift.
export type { SharepicVariant };

// Values are validated CanvasTemplateTypes, so a mapped canvasType is always a
// canonical type the frontend canvas pipeline can mint.
const CANVAS_TYPE_BY_SHAREPIC: Record<string, CanvasTemplateType> = {
  dreizeilen: 'dreizeilen',
  zitat: 'zitat-pure',
  zitat_pure: 'zitat-pure',
  info: 'info',
};

const VARIANT_LABEL_BY_CANVAS_TYPE: Partial<Record<CanvasTemplateType, string>> = {
  dreizeilen: 'Dreizeiler',
  'zitat-pure': 'Zitat',
  zitat: 'Zitat',
  info: 'Info',
  'dreizeilen-at': 'Dreizeiler',
  'zitat-pure-at': 'Zitat',
  'zitat-at': 'Zitat',
  'info-at': 'Info',
};

/** de-AT overrides: base canvas type → Austrian variant. */
const AT_CANVAS_TYPE: Partial<Record<CanvasTemplateType, CanvasTemplateType>> = {
  dreizeilen: 'dreizeilen-at',
  'zitat-pure': 'zitat-pure-at',
  zitat: 'zitat-at',
  info: 'info-at',
};

function mapSharepicTypeToCanvasType(
  sharepicType: string,
  userLocale?: string
): CanvasTemplateType {
  const base = CANVAS_TYPE_BY_SHAREPIC[sharepicType] ?? 'dreizeilen';
  if (userLocale === 'de-AT') return AT_CANVAS_TYPE[base] ?? base;
  return base;
}

interface SharepicResponseShape {
  type: string;
  mainSlogan?: { line1?: string; line2?: string; line3?: string };
  quote?: string;
  name?: string;
  header?: string;
  subheader?: string;
  body?: string;
  selectedImage?: string;
  altText?: string;
}

function buildInitialPropsForType(
  sharepic: SharepicResponseShape,
  canvasType: string
): Record<string, unknown> {
  switch (canvasType) {
    case 'dreizeilen': {
      const slogan = sharepic.mainSlogan ?? {};
      return {
        line1: slogan.line1 ?? '',
        line2: slogan.line2 ?? '',
        line3: slogan.line3 ?? '',
        // Carry the AI-selected stock background so the frontend canvas renders it.
        // `hasBackgroundImage` is derived from `currentImageSrc` in the dreizeilen
        // config's createInitialState — passing this key alone shows the layer.
        ...(sharepic.selectedImage && {
          currentImageSrc: `/api/image-picker/stock-image/${encodeURIComponent(sharepic.selectedImage)}`,
        }),
      };
    }
    case 'zitat-pure':
    case 'zitat':
    case 'zitat-pure-at':
    case 'zitat-at': {
      return {
        quote: sharepic.quote ?? '',
        name: sharepic.name ?? '',
      };
    }
    case 'info': {
      return {
        header: sharepic.header ?? '',
        body: sharepic.body ?? sharepic.subheader ?? '',
      };
    }
    // AT info: headline (white) + accent (gelb, Betonung) + body (subline)
    case 'info-at': {
      return {
        headline: sharepic.header ?? '',
        accent: sharepic.subheader ?? '',
        body: sharepic.body ?? '',
      };
    }
    // AT dreizeilen: line1 + accent (gelbe Mittelzeile) + line3
    case 'dreizeilen-at': {
      const slogan = sharepic.mainSlogan ?? {};
      return {
        line1: slogan.line1 ?? '',
        accent: slogan.line2 ?? '',
        line3: slogan.line3 ?? '',
      };
    }
    default:
      return {};
  }
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
  /** Signed-in user's locale; when 'de-AT' the variants use the Austrian configs. */
  userLocale?: string;
}

/** Maps a stored canvasType back to the generation type used by generateSharepicForChat. */
const CANVAS_TYPE_TO_GEN: Record<string, string> = {
  'zitat-pure': 'zitat_pure',
  zitat: 'zitat_pure',
  dreizeilen: 'dreizeilen',
  info: 'info',
  // Österreich (de-AT) variants map back to the same generation types; the
  // result is re-localized to the -at canvasType via toVariant(userLocale).
  'zitat-pure-at': 'zitat_pure',
  'zitat-at': 'zitat_pure',
  'dreizeilen-at': 'dreizeilen',
  'info-at': 'info',
};

/** One generation request: a sharepic type plus the body passed to the prompt. */
interface VariantRequest {
  type: string;
  body: Record<string, unknown>;
}

/**
 * Build the single regeneration request for a refinement. The previous text is
 * fed back to the model (as the quote to optimise, or described in Details) along
 * with the user's modification instruction, so the topic/core message is kept.
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
    // AT info stores headline/accent/body; DE info stores header/(subheader)/body.
    const header = str(p.header) || str(p.headline);
    const accent = str(p.accent);
    const body = str(p.body);
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

/** Map a successful generation result to a frontend SharepicVariant. */
function toVariant(
  sharepic: SharepicResponseShape,
  requestedType: string,
  userLocale?: string
): SharepicVariant {
  const canvasType = mapSharepicTypeToCanvasType(sharepic.type ?? requestedType, userLocale);
  return {
    id: randomUUID(),
    canvasType,
    initialProps: buildInitialPropsForType(sharepic, canvasType),
    label: VARIANT_LABEL_BY_CANVAS_TYPE[canvasType] ?? canvasType,
    ...(sharepic.altText && { altText: sharepic.altText }),
  };
}

export async function generateSharepicVariants(
  args: GenerateVariantsArgs
): Promise<SharepicVariant[]> {
  let requests: VariantRequest[];

  if (args.refinement) {
    // Refinement: regenerate just the previous variant, seeded with its own text.
    requests = [buildRefinementRequest(args.refinement, args.authorName)];
  } else {
    const typesToGenerate: ReadonlyArray<SharepicVariantType> = args.preferredVariant
      ? [args.preferredVariant]
      : SHAREPIC_VARIANT_TYPES;

    // The prompt template fills its `thema` placeholder from `thema` — the chat
    // path previously omitted it, so the AI got an empty topic. Extract the
    // subject from the message; fall back to raw text if extraction strips all.
    const thema = extractSharepicTopic(args.text) || args.text;

    requests = typesToGenerate.map((type) => ({
      type,
      body: {
        text: args.text,
        subject: args.text,
        thema,
        count: 1,
        ...(args.authorName && { name: args.authorName }),
      },
    }));
  }

  const settled = await Promise.allSettled(
    requests.map((r) => generateSharepicForChat(args.req, r.type, r.body))
  );

  const variants: SharepicVariant[] = [];
  settled.forEach((result, idx) => {
    const requestedType = requests[idx].type;
    if (result.status !== 'fulfilled') {
      log.warn(`[SharepicVariants] ${requestedType} variant rejected:`, result.reason);
      return;
    }
    if (!result.value.success) {
      log.warn(`[SharepicVariants] ${requestedType} variant unsuccessful`);
      return;
    }
    const sharepic = result.value.content.sharepic as SharepicResponseShape;
    variants.push(toVariant(sharepic, requestedType, args.userLocale));
  });

  return variants;
}

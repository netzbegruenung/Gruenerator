import { randomUUID } from 'crypto';

import {
  generateSharepicForChat,
  type ExpressRequest as SharepicExpressRequest,
} from '../../../services/chat/sharepicGenerationService.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('SharepicVariants');

export const SHAREPIC_VARIANT_TYPES = ['dreizeilen', 'zitat', 'info'] as const;
export type SharepicVariantType = (typeof SHAREPIC_VARIANT_TYPES)[number];

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

export interface SharepicVariant {
  id: string;
  canvasType: string;
  initialProps: Record<string, unknown>;
  label?: string;
  /** Accessibility description generated alongside the sharepic text (for screen readers / social posts). */
  altText?: string;
}

const CANVAS_TYPE_BY_SHAREPIC: Record<string, string> = {
  dreizeilen: 'dreizeilen',
  zitat: 'zitat-pure',
  zitat_pure: 'zitat-pure',
  info: 'info',
};

const VARIANT_LABEL_BY_CANVAS_TYPE: Record<string, string> = {
  dreizeilen: 'Dreizeiler',
  'zitat-pure': 'Zitat',
  zitat: 'Zitat',
  info: 'Info',
};

function mapSharepicTypeToCanvasType(sharepicType: string): string {
  return CANVAS_TYPE_BY_SHAREPIC[sharepicType] ?? 'dreizeilen';
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
    case 'zitat': {
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
}

export async function generateSharepicVariants(
  args: GenerateVariantsArgs
): Promise<SharepicVariant[]> {
  const typesToGenerate: ReadonlyArray<SharepicVariantType> = args.preferredVariant
    ? [args.preferredVariant]
    : SHAREPIC_VARIANT_TYPES;

  const settled = await Promise.allSettled(
    typesToGenerate.map((type) =>
      generateSharepicForChat(args.req, type, {
        text: args.text,
        subject: args.text,
        count: 1,
      })
    )
  );

  const variants: SharepicVariant[] = [];
  settled.forEach((result, idx) => {
    const requestedType = typesToGenerate[idx];
    if (result.status !== 'fulfilled') {
      log.warn(`[SharepicVariants] ${requestedType} variant rejected:`, result.reason);
      return;
    }
    if (!result.value.success) {
      log.warn(`[SharepicVariants] ${requestedType} variant unsuccessful`);
      return;
    }
    const sharepic = result.value.content.sharepic as SharepicResponseShape;
    const canvasType = mapSharepicTypeToCanvasType(sharepic.type ?? requestedType);
    variants.push({
      id: randomUUID(),
      canvasType,
      initialProps: buildInitialPropsForType(sharepic, canvasType),
      label: VARIANT_LABEL_BY_CANVAS_TYPE[canvasType] ?? canvasType,
      ...(sharepic.altText && { altText: sharepic.altText }),
    });
  });

  return variants;
}

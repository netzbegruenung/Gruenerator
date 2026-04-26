import { randomUUID } from 'crypto';

import {
  generateSharepicForChat,
  type ExpressRequest as SharepicExpressRequest,
} from '../../../services/chat/sharepicGenerationService.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('SharepicVariants');

export const SHAREPIC_VARIANT_TYPES = ['dreizeilen', 'zitat', 'info'] as const;
export type SharepicVariantType = (typeof SHAREPIC_VARIANT_TYPES)[number];

export interface SharepicVariant {
  id: string;
  canvasType: string;
  initialProps: Record<string, unknown>;
  label?: string;
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
}

export async function generateSharepicVariants(
  args: GenerateVariantsArgs
): Promise<SharepicVariant[]> {
  const settled = await Promise.allSettled(
    SHAREPIC_VARIANT_TYPES.map((type) =>
      generateSharepicForChat(args.req, type, {
        text: args.text,
        subject: args.text,
        count: 1,
      })
    )
  );

  const variants: SharepicVariant[] = [];
  settled.forEach((result, idx) => {
    const requestedType = SHAREPIC_VARIANT_TYPES[idx];
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
    });
  });

  return variants;
}

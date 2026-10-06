/**
 * Image Studio Prompt Route
 * Dedicated endpoint for generating sharepics from natural language prompts
 * Bypasses the complex chat flow for direct, no-followup generation
 */

import { AT_CANVAS_TYPE_OVERRIDES, SHAREPIC_GEN_TO_CANVAS_TYPE } from '@gruenerator/contracts';
import { Router, type Response } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { requireAiConsent } from '../../middleware/requireAiConsent.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import ImageSelectionService from '../../services/image/ImageSelectionService.js';
import { getProfileService } from '../../services/user/ProfileService.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import { generateUnifiedTexts, toSharepicTextWireBody } from './sharepic_text/unifiedHandler.js';

const log = createLogger('promptRoute');
const router = Router();

const TYPES_REQUIRING_IMAGE = ['dreizeilen', 'veranstaltung', 'simple'];

interface ClassificationResult {
  type: string;
  isKi: boolean;
}

interface SelectedImage {
  filename: string;
  path: string;
  alt_text: string;
  category?: string;
}

/**
 * Classify sharepic type from natural language prompt
 */
function classifySharepicType(prompt: string): ClassificationResult {
  const lower = prompt.toLowerCase();

  // KI types (FLUX API) - check first as they're more specific
  if (
    /realistisches bild|ki-bild|illustration|generiere.*bild|erstelle.*bild|flux|visualisiere|fotorealistisch/.test(
      lower
    )
  ) {
    return { type: 'pure-create', isKi: true };
  }

  // Template types (Claude text generation)
  if (/zitat|quote|spruch|aussage/.test(lower)) {
    return { type: 'zitat_pure', isKi: false };
  }
  if (/info|fakten|information|wissen/.test(lower)) {
    return { type: 'info', isKi: false };
  }
  if (/veranstaltung|event|termin/.test(lower)) {
    return { type: 'veranstaltung', isKi: false };
  }
  if (/simple|einfach|basic/.test(lower)) {
    return { type: 'simple', isKi: false };
  }

  // Default to dreizeilen (3-line slogan)
  return { type: 'dreizeilen', isKi: false };
}

/**
 * Extract theme from prompt
 */
function extractTheme(prompt: string): string {
  // Common patterns to extract theme
  const patterns = [
    /(?:zum thema|über|zu|thema:?)\s+["']?([^"'\n.!?]+)["']?/i,
    /(?:ein(?:en?)?|erstelle)\s+\w+\s+(?:zum thema|über|zu)\s+["']?([^"'\n.!?]+)["']?/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Fallback: use the whole prompt as theme
  return prompt;
}

const generateFromPromptSchema = z.object({
  prompt: z.string().min(3, 'Ein Prompt mit mindestens 3 Zeichen ist erforderlich'),
});

/**
 * @deprecated since 2026-10-06 — the web composers hand written requests to the
 * Sharepic-Creator (`sharepicCreator.draft`). Kept for clients still calling it.
 *
 * POST /api/sharepic/generate-from-prompt
 * Generate sharepic content directly from a natural language prompt
 */
router.post(
  '/generate-from-prompt',
  requireAuth,
  requireAiConsent,
  validateBody(generateFromPromptSchema),
  async (
    req: TypedRequest<z.infer<typeof generateFromPromptSchema>>,
    res: Response
  ): Promise<void> => {
    try {
      const { prompt } = req.body;
      const trimmedPrompt = prompt.trim();
      const classified = classifySharepicType(trimmedPrompt);
      const { isKi } = classified;
      const userLocale = req.user?.locale;
      const { type, frontendType } = resolveSharepicType(classified.type, userLocale);
      const theme = extractTheme(trimmedPrompt);

      log.debug(
        `[PromptRoute] Classified "${trimmedPrompt.substring(0, 50)}..." as type: ${type}, isKi: ${isKi}`
      );

      // Handle KI types (FLUX API)
      if (isKi) {
        // For now, return info that KI generation requires the dedicated KI flow
        // The frontend will redirect to the appropriate KI creation page
        res.json({
          success: true,
          type: 'pure-create',
          isKiType: true,
          data: {
            prompt: trimmedPrompt,
            theme,
          },
          message: 'KI-Bildgenerierung erkannt. Bitte nutze den KI-Bereich für diese Anfrage.',
        });
        return;
      }

      // Get user's display_name for zitat types
      let userName = '';
      if (type === 'zitat_pure' || type === 'zitat') {
        try {
          const profileService = getProfileService();
          const profile = await profileService.getProfileById(req.user!.id);
          userName = profile?.display_name || '';
          log.debug(`[PromptRoute] Using user name for zitat: ${userName}`);
        } catch (profileError) {
          log.warn('[PromptRoute] Could not fetch user profile for name:', profileError);
        }
      }

      // Der Express-freie Kern, direkt aufgerufen. Vorher stand hier ein
      // Mock-`res` um `handleUnifiedRequest`, das `req.body` mutieren und den
      // Statuscode als `_statusCode` in den Antwortrumpf schmuggeln musste,
      // um ihn hinter der `json()`-Fassade wieder herauszubekommen.
      const result = await generateUnifiedTexts(type, {
        thema: theme,
        details: trimmedPrompt,
        name: userName,
        count: 1,
        userLocale,
      });

      if (!result.success) {
        res.status(result.status).json({ success: false, error: result.error });
        return;
      }

      const response = toSharepicTextWireBody(result, type, userName);

      // Transform the response based on type
      const responseData = transformResponse(frontendType, response, userName);

      // Auto-select image for types that require one
      let selectedImage: SelectedImage | null = null;
      if (TYPES_REQUIRING_IMAGE.includes(type)) {
        try {
          log.debug(`[PromptRoute] Selecting image for type: ${type}, theme: ${theme}`);
          const imageResult = await ImageSelectionService.selectBestImage(theme, {
            maxCandidates: 5,
          });

          if (imageResult?.selectedImage) {
            selectedImage = {
              filename: imageResult.selectedImage.filename,
              path: `/image-picker/stock-image/${imageResult.selectedImage.filename}`,
              alt_text: imageResult.selectedImage.alt_text || '',
              category: imageResult.selectedImage.category,
            };
            log.debug(`[PromptRoute] Selected image: ${selectedImage.filename}`);
          }
        } catch (imageError) {
          log.warn('[PromptRoute] Image selection failed, continuing without image:', imageError);
        }
      }

      res.json({
        success: true,
        type: frontendType,
        data: responseData,
        selectedImage,
        isKiType: false,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[PromptRoute] Error generating sharepic:', err);
      res.status(500).json({
        success: false,
        error: toUserFacingMessage(err) || 'Fehler bei der Sharepic-Generierung',
      });
    }
  }
);

/**
 * Österreich bekommt seine eigenen Sujets. Veranstaltung und Simple gibt es dort
 * nicht — dann wird es der Dreizeiler, nicht das deutsche Sujet.
 */
export function resolveSharepicType(
  type: string,
  locale: string | null | undefined
): { type: string; frontendType: string } {
  if (locale !== 'de-AT') return { type, frontendType: mapTypeToFrontend(type) };
  const base = SHAREPIC_GEN_TO_CANVAS_TYPE[type];
  const atType = base ? AT_CANVAS_TYPE_OVERRIDES[base] : null;
  return atType
    ? { type, frontendType: atType }
    : { type: 'dreizeilen', frontendType: 'dreizeilen-overlay-at' };
}

/**
 * Transform the text response into the fields of the frontend template type.
 */
function transformResponse(
  frontendType: string,
  response: Record<string, unknown>,
  userName: string
): Record<string, unknown> {
  switch (frontendType) {
    case 'dreizeilen': {
      const mainSlogan = (response.mainSlogan as Record<string, string>) || {};
      return {
        line1: mainSlogan.line1 || '',
        line2: mainSlogan.line2 || '',
        line3: mainSlogan.line3 || '',
      };
    }
    // Die gelbe Mittelzeile heisst im AT-Sujet `accent`.
    case 'dreizeilen-overlay-at': {
      const mainSlogan = (response.mainSlogan as Record<string, string>) || {};
      return {
        line1: mainSlogan.line1 || '',
        accent: mainSlogan.line2 || '',
        line3: mainSlogan.line3 || '',
        subline: mainSlogan.subline || '',
      };
    }
    case 'zitat-pure':
    case 'zitat-pure-at': {
      return {
        quote: (response.quote as string) || '',
        name: userName || (response.name as string) || '',
      };
    }
    case 'info': {
      const mainInfo = (response.mainInfo as Record<string, string>) || {};
      return {
        header: mainInfo.header || '',
        subheader: mainInfo.subheader || '',
        body: mainInfo.body || '',
      };
    }
    case 'info-at': {
      const mainInfo = (response.mainInfo as Record<string, string>) || {};
      return {
        introline: mainInfo.introline || '',
        text: mainInfo.text || '',
        accent: mainInfo.accent || '',
      };
    }
    case 'veranstaltung': {
      const mainEvent = (response.mainEvent as Record<string, string>) || {};
      return {
        eventTitle: mainEvent.eventTitle || '',
        weekday: mainEvent.weekday || '',
        date: mainEvent.date || '',
        time: mainEvent.time || '',
        locationName: mainEvent.locationName || '',
        address: mainEvent.address || '',
        beschreibung: mainEvent.beschreibung || '',
      };
    }
    case 'simple': {
      const mainSimple = (response.mainSimple as Record<string, string>) || {};
      return {
        headline: mainSimple.headline || '',
        subtext: mainSimple.subtext || '',
      };
    }
    default:
      return response as Record<string, unknown>;
  }
}

/**
 * Map backend type to frontend type name
 */
function mapTypeToFrontend(type: string): string {
  const typeMap: Record<string, string> = {
    dreizeilen: 'dreizeilen',
    zitat: 'zitat',
    zitat_pure: 'zitat-pure',
    info: 'info',
    veranstaltung: 'veranstaltung',
    simple: 'simple',
  };
  return typeMap[type] || type;
}

export default router;

/**
 * Image Studio Prompt Route
 * Dedicated endpoint for generating sharepics from natural language prompts
 * Bypasses the complex chat flow for direct, no-followup generation
 */

import { Router, Response } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { getProfileService } from '../../services/user/ProfileService.js';
import { handleUnifiedRequest } from './sharepic_claude/unifiedHandler.js';
import ImageSelectionService from '../../services/image/ImageSelectionService.js';
import { createLogger } from '../../utils/logger.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { SharepicRequest } from './sharepic_claude/types.js';

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
  if (/realistisches bild|ki-bild|illustration|generiere.*bild|erstelle.*bild|flux|visualisiere|fotorealistisch/.test(lower)) {
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
    /(?:ein(?:en?)?|erstelle)\s+\w+\s+(?:zum thema|über|zu)\s+["']?([^"'\n.!?]+)["']?/i
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

/**
 * POST /api/sharepic/generate-from-prompt
 * Generate sharepic content directly from a natural language prompt
 */
router.post('/generate-from-prompt', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
      res.status(400).json({
        success: false,
        error: 'Ein Prompt mit mindestens 3 Zeichen ist erforderlich'
      });
      return;
    }

    const trimmedPrompt = prompt.trim();
    const { type, isKi } = classifySharepicType(trimmedPrompt);
    const theme = extractTheme(trimmedPrompt);

    log.debug(`[PromptRoute] Classified "${trimmedPrompt.substring(0, 50)}..." as type: ${type}, isKi: ${isKi}`);

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
          theme
        },
        message: 'KI-Bildgenerierung erkannt. Bitte nutze den KI-Bereich für diese Anfrage.'
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

    // Store original body and modify for the Claude handler
    const originalBody = req.body;
    req.body = {
      thema: theme,
      details: trimmedPrompt,
      name: userName,
      count: 1
    };

    // Create a custom response wrapper to capture the result
    let capturedResponse: Record<string, unknown> | null = null;
    const customRes = {
      json: (data: Record<string, unknown>) => {
        capturedResponse = data;
        return customRes;
      },
      status: (code: number) => {
        return {
          json: (data: Record<string, unknown>) => {
            capturedResponse = { ...data, _statusCode: code };
            return customRes;
          }
        };
      }
    } as unknown as Response;

    // Call the unified handler
    await handleUnifiedRequest(req as unknown as SharepicRequest, customRes, type);
    
    // Restore original body
    req.body = originalBody;

    if (!capturedResponse) {
      res.status(500).json({
        success: false,
        error: 'Keine Antwort vom Textgenerator erhalten'
      });
      return;
    }

    // Check for error status
    if (capturedResponse._statusCode && capturedResponse._statusCode !== 200) {
      res.status(capturedResponse._statusCode as number).json(capturedResponse);
      return;
    }

    // Transform the response based on type
    const responseData = transformResponse(type, capturedResponse, userName);

    // Auto-select image for types that require one
    let selectedImage: SelectedImage | null = null;
    if (TYPES_REQUIRING_IMAGE.includes(type)) {
      try {
        log.debug(`[PromptRoute] Selecting image for type: ${type}, theme: ${theme}`);
        const imageResult = await ImageSelectionService.selectBestImage(
          theme,
          req.app.locals.aiWorkerPool,
          { maxCandidates: 5 },
          req
        );
        
        if (imageResult?.selectedImage) {
          selectedImage = {
            filename: imageResult.selectedImage.filename,
            path: `/image-picker/stock-image/${imageResult.selectedImage.filename}`,
            alt_text: imageResult.selectedImage.alt_text || '',
            category: imageResult.selectedImage.category
          };
          log.debug(`[PromptRoute] Selected image: ${selectedImage.filename}`);
        }
      } catch (imageError) {
        log.warn('[PromptRoute] Image selection failed, continuing without image:', imageError);
      }
    }

    res.json({
      success: true,
      type: mapTypeToFrontend(type),
      data: responseData,
      selectedImage,
      isKiType: false
    });

  } catch (error) {
    const err = error as Error;
    log.error('[PromptRoute] Error generating sharepic:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Fehler bei der Sharepic-Generierung'
    });
  }
});

/**
 * Transform Claude response to frontend format
 */
function transformResponse(
  type: string,
  response: Record<string, unknown>,
  userName: string
): Record<string, unknown> {
  switch (type) {
    case 'dreizeilen': {
      const mainSlogan = response.mainSlogan as Record<string, string> || {};
      return {
        line1: mainSlogan.line1 || '',
        line2: mainSlogan.line2 || '',
        line3: mainSlogan.line3 || ''
      };
    }
    case 'zitat':
    case 'zitat_pure': {
      return {
        quote: response.quote as string || '',
        name: userName || response.name as string || ''
      };
    }
    case 'info': {
      const mainInfo = response.mainInfo as Record<string, string> || {};
      return {
        header: mainInfo.header || '',
        subheader: mainInfo.subheader || '',
        body: mainInfo.body || ''
      };
    }
    case 'veranstaltung': {
      const mainEvent = response.mainEvent as Record<string, string> || {};
      return {
        eventTitle: mainEvent.eventTitle || '',
        weekday: mainEvent.weekday || '',
        date: mainEvent.date || '',
        time: mainEvent.time || '',
        locationName: mainEvent.locationName || '',
        address: mainEvent.address || '',
        beschreibung: mainEvent.beschreibung || ''
      };
    }
    case 'simple': {
      const mainSimple = response.mainSimple as Record<string, string> || {};
      return {
        headline: mainSimple.headline || '',
        subtext: mainSimple.subtext || ''
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
    'dreizeilen': 'dreizeilen',
    'zitat': 'zitat',
    'zitat_pure': 'zitat-pure',
    'info': 'info',
    'veranstaltung': 'veranstaltung',
    'simple': 'simple'
  };
  return typeMap[type] || type;
}

export default router;


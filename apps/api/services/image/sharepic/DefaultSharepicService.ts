/**
 * DefaultSharepicService - Generate default sharepic variants
 *
 * Generates 3 default sharepic types: dreizeilen (with AI image), quote_pure, and info
 */

import { generateSharepicForChat } from '../../chat/sharepicGenerationService.js';
import type { Request } from 'express';
import type { SharepicRequestBody, DefaultSharepicResult, DefaultSharepic } from './types.js';

// Cast type for compatibility with sharepicGenerationService
type ExpressRequest = Parameters<typeof generateSharepicForChat>[0];

/**
 * Generate 3 default sharepics: dreizeilen (with AI image), quote_pure, and info
 * @param expressReq - Express request object
 * @param requestBody - Request body with thema, details, etc.
 * @returns Array of 3 generated sharepics
 */
export async function generateDefaultSharepics(
  expressReq: Request,
  requestBody: SharepicRequestBody
): Promise<DefaultSharepicResult> {
  console.log('[DefaultSharepicService] Starting generation of 3 default sharepics');

  try {
    // Generate all 3 types in parallel using existing chat service
    // Cast to ExpressRequest since Request is a superset
    const req = expressReq as ExpressRequest;
    const [dreizeilenResult, quotePureResult, infoResult] = await Promise.all([
      generateSharepicForChat(req, 'dreizeilen', requestBody),
      generateSharepicForChat(req, 'zitat_pure', {
        ...requestBody,
        name: 'Die Grünen', // Default author for quote_pure
        preserveName: true, // Preserve the default name
      }),
      generateSharepicForChat(req, 'info', requestBody),
    ]);

    console.log('[DefaultSharepicService] All 3 default sharepics generated successfully');

    // Extract sharepic data from chat service responses
    const sharepics: DefaultSharepic[] = [
      {
        ...dreizeilenResult.content.sharepic,
        id: `default-dreizeilen-${Date.now()}`,
        createdAt: new Date().toISOString(),
      },
      {
        ...quotePureResult.content.sharepic,
        id: `default-quote-pure-${Date.now()}`,
        createdAt: new Date().toISOString(),
      },
      {
        ...infoResult.content.sharepic,
        id: `default-info-${Date.now()}`,
        createdAt: new Date().toISOString(),
      },
    ];

    return {
      success: true,
      sharepics,
      metadata: {
        generationType: 'default',
        generatedCount: 3,
        types: ['dreizeilen', 'zitat_pure', 'info'],
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('[DefaultSharepicService] Error generating default sharepics:', error);
    throw new Error(`Failed to generate default sharepics: ${error.message}`);
  }
}

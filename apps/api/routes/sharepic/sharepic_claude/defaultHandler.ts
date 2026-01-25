import type { Response } from 'express';
import { generateDefaultSharepics } from '../../../services/image/sharepic/index.js';
import { createLogger } from '../../../utils/logger.js';
import type { SharepicRequest, DefaultResponse } from './types.js';

const log = createLogger('sharepic_default');

export async function handleDefaultRequest(req: SharepicRequest, res: Response): Promise<void> {
  try {
    const result = await generateDefaultSharepics(req, req.body);

    if (!result.success) {
      res
        .status(500)
        .json({ success: false, error: 'Failed to generate default sharepics' } as DefaultResponse);
      return;
    }

    res.json({
      success: true,
      sharepics: result.sharepics,
      metadata: result.metadata,
    });
  } catch (error) {
    log.error('[sharepic_default] Error:', error);
    res.status(500).json({ success: false, error: (error as Error).message } as DefaultResponse);
  }
}

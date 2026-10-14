import { type Response } from 'express';

import { handleUnifiedRequest } from './unifiedHandler.js';

import type { SharepicRequest } from './types.js';

type SharepicType =
  'dreizeilen' | 'zitat' | 'zitat_pure' | 'info' | 'veranstaltung' | 'simple' | 'slider';

async function handleSharepicTextRequest(
  req: SharepicRequest,
  res: Response,
  type: SharepicType = 'dreizeilen'
): Promise<void> {
  return await handleUnifiedRequest(req, res, type);
}

export { handleSharepicTextRequest };
export { handleUnifiedRequest };
export type { SharepicType };

export { handleSliderSmartRequest } from './sliderSmartHandler.js';

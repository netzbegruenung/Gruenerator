import { type Response } from 'express';

import { handleDefaultRequest } from './defaultHandler.js';
import { handleUnifiedRequest } from './unifiedHandler.js';

import type { SharepicRequest } from './types.js';

type SharepicType =
  | 'default'
  | 'dreizeilen'
  | 'zitat'
  | 'zitat_pure'
  | 'info'
  | 'veranstaltung'
  | 'simple'
  | 'slider';

async function handleSharepicTextRequest(
  req: SharepicRequest,
  res: Response,
  type: SharepicType = 'dreizeilen'
): Promise<void> {
  if (type === 'default') {
    return await handleDefaultRequest(req, res);
  }
  return await handleUnifiedRequest(req, res, type);
}

export { handleSharepicTextRequest };
export { handleUnifiedRequest };
export type { SharepicType };

export { handleDefaultRequest } from './defaultHandler.js';
export { handleSliderSmartRequest } from './sliderSmartHandler.js';

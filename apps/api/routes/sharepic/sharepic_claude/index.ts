import { Router, type Request, type Response } from 'express';

import { handleDefaultRequest } from './defaultHandler.js';
import { handleUnifiedRequest } from './unifiedHandler.js';

import type { SharepicRequest } from './types.js';

const router: Router = Router();

type SharepicType =
  | 'default'
  | 'dreizeilen'
  | 'zitat'
  | 'zitat_pure'
  | 'headline'
  | 'info'
  | 'veranstaltung'
  | 'simple'
  | 'slider';

const UNIFIED_TYPES = [
  'dreizeilen',
  'zitat',
  'zitat_pure',
  'headline',
  'info',
  'veranstaltung',
  'simple',
  'slider',
];

async function handleClaudeRequest(
  req: SharepicRequest,
  res: Response,
  type: SharepicType = 'dreizeilen'
): Promise<void> {
  if (type === 'default') {
    return await handleDefaultRequest(req, res);
  }

  if (UNIFIED_TYPES.includes(type)) {
    return await handleUnifiedRequest(req, res, type);
  }

  return await handleUnifiedRequest(req, res, 'dreizeilen');
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  await handleUnifiedRequest(req as SharepicRequest, res, 'dreizeilen');
});

export default router;
export { handleClaudeRequest };
export { handleUnifiedRequest };
export type { SharepicType };

export { handleDefaultRequest } from './defaultHandler.js';
export { handleSliderSmartRequest } from './sliderSmartHandler.js';

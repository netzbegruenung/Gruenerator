import { Router, type Request, type Response } from 'express';
import { handleDreizeilenRequest } from './dreizeilenHandler.js';
import { handleZitatRequest } from './zitatHandler.js';
import { handleZitatPureRequest } from './zitatPureHandler.js';
import { handleHeadlineRequest } from './headlineHandler.js';
import { handleInfoRequest } from './infoHandler.js';
import { handleVeranstaltungRequest } from './veranstaltungHandler.js';
import { handleDefaultRequest } from './defaultHandler.js';
import type { SharepicRequest } from './types.js';

const router: Router = Router();

type SharepicType = 'default' | 'dreizeilen' | 'zitat' | 'zitat_pure' | 'headline' | 'info' | 'veranstaltung';

async function handleClaudeRequest(
  req: SharepicRequest,
  res: Response,
  type: SharepicType = 'dreizeilen'
): Promise<void> {
  switch (type) {
    case 'default':
      return await handleDefaultRequest(req, res);
    case 'dreizeilen':
      return await handleDreizeilenRequest(req, res);
    case 'zitat':
      return await handleZitatRequest(req, res);
    case 'zitat_pure':
      return await handleZitatPureRequest(req, res);
    case 'headline':
      return await handleHeadlineRequest(req, res);
    case 'info':
      return await handleInfoRequest(req, res);
    case 'veranstaltung':
      return await handleVeranstaltungRequest(req, res);
    default:
      return await handleDreizeilenRequest(req, res);
  }
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  await handleDreizeilenRequest(req as SharepicRequest, res);
});

export default router;
export { handleClaudeRequest };
export type { SharepicType };

export { handleDreizeilenRequest } from './dreizeilenHandler.js';
export { handleZitatRequest } from './zitatHandler.js';
export { handleZitatPureRequest } from './zitatPureHandler.js';
export { handleHeadlineRequest } from './headlineHandler.js';
export { handleInfoRequest } from './infoHandler.js';
export { handleVeranstaltungRequest } from './veranstaltungHandler.js';
export { handleDefaultRequest } from './defaultHandler.js';

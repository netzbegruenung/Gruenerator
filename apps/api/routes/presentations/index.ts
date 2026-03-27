import { Router } from 'express';

import presentationController from './presentationController.js';

const router = Router();

router.use('/', presentationController);

export default router;

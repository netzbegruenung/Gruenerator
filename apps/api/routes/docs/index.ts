import { Router } from 'express';

import aiController from './aiController.js';
import documentController from './documentController.js';
import exportController from './exportController.js';
import exportToDocsController from './exportToDocsController.js';
import groupShareController from './groupShareController.js';
import permissionsController from './permissionsController.js';
import shareController from './shareController.js';

const router = Router();

router.use('/', documentController);
router.use('/', permissionsController);
router.use('/', shareController);
router.use('/', groupShareController);
router.use('/', exportController);
router.use('/', exportToDocsController);
router.use('/', aiController);

export default router;

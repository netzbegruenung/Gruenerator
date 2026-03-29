import { Router } from 'express';

import aiController from './aiController.js';
import documentController from './documentController.js';
import exportController from './exportController.js';
import exportToDocsController from './exportToDocsController.js';
import groupShareController from './groupShareController.js';
import importController from './importController.js';
import permissionsController from './permissionsController.js';
import shareController from './shareController.js';

const router = Router();

// Specific-path routers must be mounted BEFORE documentController,
// which has a catch-all /:id parameter route.
router.use('/', groupShareController);
router.use('/', permissionsController);
router.use('/', shareController);
router.use('/', exportController);
router.use('/', exportToDocsController);
router.use('/', importController);
router.use('/', aiController);
router.use('/', documentController);

export default router;

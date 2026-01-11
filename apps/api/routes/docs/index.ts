import { Router } from 'express';
import documentController from './documentController.js';
import permissionsController from './permissionsController.js';
import versionController from './versionController.js';
import exportController from './exportController.js';
import exportToDocsController from './exportToDocsController.js';

const router = Router();

router.use('/', documentController);
router.use('/', permissionsController);
router.use('/', versionController);
router.use('/', exportController);
router.use('/', exportToDocsController);

export default router;

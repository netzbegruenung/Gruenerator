import { Router } from 'express';

import aiController from './aiController.js';
import documentController from './documentController.js';
import exportController from './exportController.js';
import exportToDocsController from './exportToDocsController.js';
import groupShareController from './groupShareController.js';
import importController from './importController.js';
import permissionsController from './permissionsController.js';
import snapshotController from './snapshotController.js';

const router = Router();

// Specific-path routers must be mounted BEFORE documentController,
// which has catch-all /:id parameter routes.
// Note: ts-rest contract routes (/chat-thread, GET /:id, POST /, GET /,
// POST /generate, GET /:id/share, POST /:id/share/enable,
// POST /:id/share/disable, PUT /:id/share/permission, PUT /:id/share/mode,
// GET /:id/permissions, POST /:id/groups, PUT /:id/groups/:groupId) are
// served by docsContractRouter mounted at the app level in routes.ts and
// are NOT in this legacy chain.
router.use('/', groupShareController);
router.use('/', permissionsController);
router.use('/', exportController);
router.use('/', exportToDocsController);
router.use('/', importController);
router.use('/', snapshotController);
router.use('/', aiController);
router.use('/', documentController);

export default router;

/**
 * Group content-sharing routes — MIGRATED.
 *
 * All content-sharing endpoints (share/unshare, list content, permissions,
 * remove, vorlagen) were moved to the ts-rest contract router
 * (`groupsContract/`). This module now exports only an empty Express
 * router, kept mounted for composition compatibility (`groups/index.ts`).
 */

import express, { type Router } from 'express';

const router: Router = express.Router();

export default router;

/**
 * (Now-empty) legacy core router + re-export of the membership helper.
 *
 * All group CRUD / join / leave / members / role / link routes were migrated to
 * the ts-rest contract router (`groupsContract/`). The shared membership-check
 * helper moved to `services/groups/groupMembership.ts` (09/2026) so the group
 * services no longer reach back into the routes layer; it is re-exported here
 * for the contract router, the content router and the avatar router. The empty
 * Express router is kept mounted for composition compatibility
 * (`groups/index.ts`).
 */

import express, { type Router } from 'express';

export { getPostgresAndCheckMembership } from '../../../services/groups/groupMembership.js';

const router: Router = express.Router();

export default router;

/**
 * Which instance this API process serves.
 *
 * Resolved once at import time from `INSTANCE_ID`, falling back to
 * `production` for an unset or unknown value — a typo in the deploy env must
 * not take the API down, and the conservative selection is the safe landing
 * spot.
 *
 * Today nothing in the API filters on this yet: the instance content policies
 * are all empty, and the backend enforcement of a hidden notebook (so the chat
 * cannot keep citing sources from it) is its own step. See AP4 in
 * `docs/instanz-filterung-plan.md`. This module exists so both sides resolve
 * the instance through the same shared registry rather than growing a second
 * notion of what a deployment is.
 */
import { resolveInstance, type InstanceId } from '@gruenerator/shared/instances';

import { env } from './env.js';

export const CURRENT_INSTANCE: InstanceId = resolveInstance({
  explicitId: env.INSTANCE_ID ?? null,
});

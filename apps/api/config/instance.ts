/**
 * Which instance this API process serves.
 *
 * Resolved once at import time from `INSTANCE_ID`, falling back to
 * `production` for an unset or unknown value — a typo in the deploy env must
 * not take the API down, and the conservative selection is the safe landing
 * spot.
 *
 * What filters on it is the notebook gate in `./notebookCollectionMap.ts`,
 * reading the same shared registry the frontend does. That gate is what makes
 * hiding a notebook mean something: Qdrant is *not* partitioned per instance
 * (one `QDRANT_URL`), so a frontend-only policy would leave the chat citing
 * sources from a notebook the user cannot see.
 *
 * No registered instance carries a content policy yet, so today every gate
 * answers exactly as it did before instances existed.
 */
import { resolveInstance, type InstanceId } from '@gruenerator/shared/instances';

import { env } from './env.js';

export const CURRENT_INSTANCE: InstanceId = resolveInstance({
  explicitId: env.INSTANCE_ID ?? null,
});

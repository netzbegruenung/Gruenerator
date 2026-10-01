/**
 * Who may use the „Panda" model lane (DeepSeek).
 *
 * The one place that answers the question. An instance admin decides per
 * account after training (`profiles.panda_enabled`); without a decision the
 * instance default applies (`pandaTierDefault` in the shared instance registry,
 * on only for `bgst`). The decision wins in both directions, so an admin can
 * also switch a single bgst account off.
 *
 * Read fresh from the database, not from the session: the session snapshot of
 * the person an admin just switched lags behind by the cookie cache.
 */

import { isPandaTierDefaultOn } from '@gruenerator/shared/instances';
import { type TextModelId } from '@gruenerator/shared/models';

import { CURRENT_INSTANCE } from '../../config/instance.js';
import { createLogger } from '../../utils/logger.js';

import { getProfileService } from './ProfileService.js';

const log = createLogger('pandaEntitlement');

export const PANDA_MODEL_ID = 'gruenerator-panda' satisfies TextModelId;

/** Where a request for Panda lands when the account is not unlocked. */
const PANDA_DENIED_FALLBACK = 'gruenerator-ultra' satisfies TextModelId;

export function isPandaEntitled(
  decision: boolean | null | undefined,
  instanceDefault: boolean = isPandaTierDefaultOn(CURRENT_INSTANCE)
): boolean {
  return decision ?? instanceDefault;
}

export async function isUserPandaEntitled(userId: string): Promise<boolean> {
  const profile = await getProfileService().getProfileById(userId);
  return isPandaEntitled(profile?.panda_enabled);
}

/**
 * The model id a request may actually use. Everything but Panda passes
 * untouched; Panda without an unlock becomes Ultra. Not an error: a client
 * that still shows the lane after an admin revoked it gets an answer, the log
 * records the attempt.
 */
export async function gatePandaModelId<T extends string | null | undefined>(
  modelId: T,
  userId: string | null | undefined
): Promise<T | typeof PANDA_DENIED_FALLBACK> {
  if (modelId !== PANDA_MODEL_ID) return modelId;
  if (userId && (await isUserPandaEntitled(userId))) return modelId;
  log.warn(`Panda requested without unlock (user=${userId ?? 'anonymous'}) — serving Ultra`);
  return PANDA_DENIED_FALLBACK;
}

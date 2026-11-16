import { type Request } from 'express';

import { type ConventionRow, type ConventionSpeechRow } from '../../database/schema/parteitage.js';
import { isInstanceAdmin } from '../../utils/adminAuthz.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { extractLocaleFromRequest } from '../localization/index.js';

export type ConventionViewer = {
  userId: string;
  isAdmin: boolean;
  audience: 'de-DE' | 'de-AT';
};

export type ConventionAccessResult = 'ok' | 'not_found' | 'locked';

type ConventionAccessFields = Pick<
  ConventionRow,
  'status' | 'audience' | 'access_password_hash' | 'id'
>;

export async function viewerFromRequest(req: Request): Promise<ConventionViewer> {
  const user = getAuthedUser(req);
  return {
    userId: user.id,
    isAdmin: await isInstanceAdmin(user.id, user.email),
    audience: extractLocaleFromRequest(req) === 'de-AT' ? 'de-AT' : 'de-DE',
  };
}

/** Whether the viewer may see the convention's title at all (draft and foreign audience are invisible). */
export function isConventionVisible(
  viewer: ConventionViewer,
  convention: Pick<ConventionRow, 'status' | 'audience'>
): boolean {
  if (viewer.isAdmin) return true;
  if (convention.status !== 'published') return false;
  return convention.audience === 'all' || convention.audience === viewer.audience;
}

export function checkConventionAccess(
  viewer: ConventionViewer,
  convention: ConventionAccessFields,
  hasGrant: boolean
): ConventionAccessResult {
  if (viewer.isAdmin) return 'ok';
  if (!isConventionVisible(viewer, convention)) return 'not_found';
  if (convention.access_password_hash && !hasGrant) return 'locked';
  return 'ok';
}

export function checkSpeechAccess(
  viewer: ConventionViewer,
  convention: ConventionAccessFields,
  speech: Pick<ConventionSpeechRow, 'moderation'>,
  hasGrant: boolean
): ConventionAccessResult {
  const result = checkConventionAccess(viewer, convention, hasGrant);
  if (result !== 'ok') return result;
  if (speech.moderation === 'hidden' && !viewer.isAdmin) return 'not_found';
  return 'ok';
}

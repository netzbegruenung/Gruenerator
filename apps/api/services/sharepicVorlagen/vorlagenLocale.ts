/**
 * The country whose Vorlagen a request sees: the viewer's own, unless an
 * instance admin asks for the other one with `?land=`.
 *
 * For everyone else `land` is ignored silently, not refused: the answer is
 * then exactly the one the same request without the parameter gets, so a 403
 * would protect nothing and only break a shared admin link for its recipient.
 */
import { isInstanceAdmin } from '../../utils/adminAuthz.js';
import { extractLocaleFromRequest } from '../localization/index.js';

import type { Locale, RequestWithLocale } from '../localization/types.js';

interface VorlagenRequest extends RequestWithLocale {
  user?: { id: string; email?: string | null | undefined; locale?: string | undefined } | undefined;
}

export async function resolveVorlagenLocale(
  req: VorlagenRequest,
  land: Locale | null | undefined
): Promise<Locale> {
  const own: Locale = extractLocaleFromRequest(req) === 'de-AT' ? 'de-AT' : 'de-DE';
  if (!land || land === own || !req.user) return own;
  return (await isInstanceAdmin(req.user.id, req.user.email)) ? land : own;
}

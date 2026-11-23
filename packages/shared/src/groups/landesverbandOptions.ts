import {
  landesverbandIdSchema,
  type GroupAudience,
  type LandesverbandId,
} from '@gruenerator/contracts';

import { LANDESVERBAENDE } from '../agents/index.js';

export interface LandesverbandOption {
  id: LandesverbandId;
  title: string;
}

/**
 * Die Landesverbände, die ein Projekt tragen kann. Ein deutsches Projekt
 * (`de-DE`) bietet die deutschen Verbände, ein österreichisches (`de-AT`) nur
 * Österreich; bei `all` entscheidet das Land der Person. Der aktuell gesetzte
 * Verband bleibt immer in der Liste, damit er sich nie unsichtbar festsetzt.
 */
export function landesverbandOptions(
  audience: GroupAudience | null | undefined,
  userLocale: string | null | undefined,
  current: LandesverbandId | null | undefined
): LandesverbandOption[] {
  const country =
    audience && audience !== 'all' ? audience : userLocale === 'de-AT' ? 'de-AT' : 'de-DE';
  return LANDESVERBAENDE.flatMap((lv) => {
    const parsed = landesverbandIdSchema.safeParse(lv.id);
    if (!parsed.success) return [];
    return lv.audience === country || parsed.data === current
      ? [{ id: parsed.data, title: lv.title }]
      : [];
  });
}

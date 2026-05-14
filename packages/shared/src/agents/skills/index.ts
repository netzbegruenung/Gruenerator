import type { SystemSkill } from './types.js';

import { AKTIONSIDEEN_SKILL } from './aktionsideen.js';
import { ANTRAG_SKILL } from './antrag.js';
import { BUERGERSERVICE_SKILL } from './buergerservice.js';
import { FACEBOOK_SKILL } from './facebook.js';
import { INSTAGRAM_SKILL } from './instagram.js';
import { KOMMUNALPOLITIK_SKILL } from './kommunalpolitik.js';
import { LEICHTE_SPRACHE_SKILL } from './leichte-sprache.js';
import { LINKEDIN_SKILL } from './linkedin.js';
import { PRESSE_BERLIN_SKILL } from './presse-berlin.js';
import { PRESSE_BRANDENBURG_SKILL } from './presse-brandenburg.js';
import { PRESSE_HAMBURG_SKILL } from './presse-hamburg.js';
import { PRESSE_MV_SKILL } from './presse-mv.js';
import { PRESSE_THUERINGEN_SKILL } from './presse-thueringen.js';
import { PRESSEMITTEILUNG_SKILL } from './pressemitteilung.js';
import { REDE_SKILL } from './rede.js';
import { REEL_SKILL } from './reel.js';
import { SOCIAL_BERLIN_SKILL } from './social-berlin.js';
import { SOCIAL_BRANDENBURG_SKILL } from './social-brandenburg.js';
import { SOCIAL_HAMBURG_SKILL } from './social-hamburg.js';
import { SOCIAL_MV_SKILL } from './social-mv.js';
import { SOCIAL_THUERINGEN_SKILL } from './social-thueringen.js';
import { TWITTER_SKILL } from './twitter.js';
import { WAHLPROGRAMM_SKILL } from './wahlprogramm.js';

export type { SystemSkill } from './types.js';

// Registry order matches the original skills.ts: base skills first, then
// per-Landesverband shortcuts grouped (PM + Social) per LV. UI surfaces that
// render the catalog rely on this order — keep new entries grouped by LV.
export const SKILLS = [
  ANTRAG_SKILL,
  KOMMUNALPOLITIK_SKILL,
  BUERGERSERVICE_SKILL,
  PRESSEMITTEILUNG_SKILL,
  INSTAGRAM_SKILL,
  FACEBOOK_SKILL,
  TWITTER_SKILL,
  LINKEDIN_SKILL,
  REEL_SKILL,
  AKTIONSIDEEN_SKILL,
  REDE_SKILL,
  WAHLPROGRAMM_SKILL,
  LEICHTE_SPRACHE_SKILL,
  // ─── Per-Landesverband shortcuts ───
  PRESSE_BERLIN_SKILL,
  SOCIAL_BERLIN_SKILL,
  PRESSE_HAMBURG_SKILL,
  SOCIAL_HAMBURG_SKILL,
  PRESSE_MV_SKILL,
  SOCIAL_MV_SKILL,
  PRESSE_THUERINGEN_SKILL,
  SOCIAL_THUERINGEN_SKILL,
  PRESSE_BRANDENBURG_SKILL,
  SOCIAL_BRANDENBURG_SKILL,
] as const satisfies readonly SystemSkill[];

const mentionMap = new Map<string, string>(
  SKILLS.map((skill) => [skill.mention.toLowerCase(), skill.identifier])
);

export function resolveSkillMention(alias: string): string | null {
  return mentionMap.get(alias.toLowerCase()) ?? null;
}

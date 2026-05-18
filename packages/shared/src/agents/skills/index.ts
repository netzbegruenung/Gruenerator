import { AKTIONSIDEEN_SKILL } from './aktionsideen.js';
import { ANTRAG_SKILL } from './antrag.js';
import { BUERGERSERVICE_SKILL } from './buergerservice.js';
import { FACEBOOK_SKILL } from './facebook.js';
import { INSTA_BERLIN_SKILL } from './insta-berlin.js';
import { INSTA_BRANDENBURG_SKILL } from './insta-brandenburg.js';
import { INSTA_HAMBURG_SKILL } from './insta-hamburg.js';
import { INSTA_MV_SKILL } from './insta-mv.js';
import { INSTA_THUERINGEN_SKILL } from './insta-thueringen.js';
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
import { TWITTER_SKILL } from './twitter.js';
import { WAHLPROGRAMM_SKILL } from './wahlprogramm.js';

import type { SystemSkill } from './types.js';

export type { SystemSkill } from './types.js';

// Registry order: base skills first, then per-Landesverband shortcuts grouped
// (PM + Insta) per LV. UI surfaces that render the catalog rely on this order.
// The previous generic `social-<lv>` skills were replaced by corpus-tuned
// `insta-<lv>` variants — each carries an Instagram-specific skillSystemPrompt
// derived from the actual @gruene_<lv> post corpus.
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
  INSTA_BERLIN_SKILL,
  PRESSE_HAMBURG_SKILL,
  INSTA_HAMBURG_SKILL,
  PRESSE_MV_SKILL,
  INSTA_MV_SKILL,
  PRESSE_THUERINGEN_SKILL,
  INSTA_THUERINGEN_SKILL,
  PRESSE_BRANDENBURG_SKILL,
  INSTA_BRANDENBURG_SKILL,
] as const satisfies readonly SystemSkill[];

const mentionMap = new Map<string, string>(
  SKILLS.map((skill) => [skill.mention.toLowerCase(), skill.identifier])
);

export function resolveSkillMention(alias: string): string | null {
  return mentionMap.get(alias.toLowerCase()) ?? null;
}

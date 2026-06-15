import { type NotebookId, isNotebookEnabled } from '../notebooks/index.js';

import { type SystemAgentId } from './system.js';
import { type AgentAudience } from './types.js';

/**
 * A Landesverband hub groups the two specialist agents that share one
 * Landesverband (a creative `Öffentlichkeitsarbeit` agent and a factual
 * `Bürger*innenanfragen` agent) behind a single branded slug.
 *
 * The branded slug (`gruene-berlin`) lives here, NOT on either agent — so
 * `/agents/gruene-berlin` opens a small landing offering both agents instead
 * of silently dropping into just one. The specialist agents keep their derived
 * slugs (`/agents/oeffentlichkeitsarbeit-berlin`) as the direct entry points
 * the hub links to. See `apps/web/src/features/chat/LandesverbandHub.tsx`.
 *
 * NOTE: `slug` is intentionally decoupled from `lvId` — Mecklenburg-Vorpommern's
 * id is `mecklenburg-vorpommern` but its shared link is `gruene-mv`.
 */
export interface LvHub {
  /** Internal LV id (matches the `lv` key in the agent specs). */
  lvId: string;
  /** Branded URL slug — `/agents/<slug>` resolves to this hub. */
  slug: string;
  /** Display name on the landing, e.g. "Grüne Berlin". */
  name: string;
  /** The LV notebook both agents pin. Also drives the hub's icon (the LV's
   *  chosen notebook icon) via `NOTEBOOK_ICONS` on the web side. */
  notebookId: NotebookId;
  prAgentId: SystemAgentId;
  buergerAgentId: SystemAgentId;
  audience: AgentAudience;
}

export const LV_HUBS = [
  {
    lvId: 'berlin',
    slug: 'gruene-berlin',
    name: 'Grüne Berlin',
    notebookId: 'berlin-notebook',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-berlin',
    buergerAgentId: 'gruenerator-buergeranfragen-berlin',
    audience: 'de-DE',
  },
  {
    lvId: 'hamburg',
    slug: 'gruene-hamburg',
    name: 'Grüne Hamburg',
    notebookId: 'hamburg-notebook',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-hamburg',
    buergerAgentId: 'gruenerator-buergeranfragen-hamburg',
    audience: 'de-DE',
  },
  {
    lvId: 'mecklenburg-vorpommern',
    slug: 'gruene-mv',
    name: 'Grüne Mecklenburg-Vorpommern',
    notebookId: 'mecklenburg-vorpommern-notebook',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-mecklenburg-vorpommern',
    buergerAgentId: 'gruenerator-buergeranfragen-mecklenburg-vorpommern',
    audience: 'de-DE',
  },
  {
    lvId: 'thueringen',
    slug: 'gruene-thueringen',
    name: 'Grüne Thüringen',
    notebookId: 'thueringen-notebook',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-thueringen',
    buergerAgentId: 'gruenerator-buergeranfragen-thueringen',
    audience: 'de-DE',
  },
  {
    lvId: 'brandenburg',
    slug: 'gruene-brandenburg',
    name: 'Grüne Brandenburg',
    notebookId: 'brandenburg-notebook',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-brandenburg',
    buergerAgentId: 'gruenerator-buergeranfragen-brandenburg',
    audience: 'de-DE',
  },
  {
    lvId: 'bayern',
    slug: 'gruene-bayern',
    name: 'Grüne Bayern',
    notebookId: 'bayern-notebook',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-bayern',
    buergerAgentId: 'gruenerator-buergeranfragen-bayern',
    audience: 'de-DE',
  },
  {
    lvId: 'sachsen-anhalt',
    slug: 'gruene-sachsen-anhalt',
    name: 'Grüne Sachsen-Anhalt',
    notebookId: 'sachsen-anhalt-notebook',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-sachsen-anhalt',
    buergerAgentId: 'gruenerator-buergeranfragen-sachsen-anhalt',
    audience: 'de-DE',
  },
  {
    lvId: 'hessen',
    slug: 'gruene-hessen',
    name: 'Grüne Hessen',
    notebookId: 'hessen-notebook',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-hessen',
    buergerAgentId: 'gruenerator-buergeranfragen-hessen',
    audience: 'de-DE',
  },
  {
    lvId: 'oesterreich',
    slug: 'gruene-oesterreich',
    name: 'Grüne Österreich',
    notebookId: 'oesterreich-notebook',
    prAgentId: 'gruenerator-oeffentlichkeitsarbeit-at',
    buergerAgentId: 'gruenerator-buergeranfragen-oesterreich',
    audience: 'de-AT',
  },
] as const satisfies readonly LvHub[];

const hubBySlug = new Map<string, (typeof LV_HUBS)[number]>(LV_HUBS.map((hub) => [hub.slug, hub]));

/** Resolve a URL slug to its Landesverband hub, or `null` if it isn't one. */
export function getLandesverbandHubBySlug(slug: string): (typeof LV_HUBS)[number] | null {
  return hubBySlug.get(slug) ?? null;
}

/**
 * Hubs visible to a user's locale. A Landesverband is inherently
 * locale-specific (the AT hub surfaces only for Austrian users, the rest only
 * for German users) — so unlike agents, a hub never has an `'all'` audience.
 */
export function getLandesverbandHubs(userLocale: string): readonly (typeof LV_HUBS)[number][] {
  return LV_HUBS.filter((hub) => hub.audience === userLocale && isNotebookEnabled(hub.notebookId));
}

/**
 * Every agent identifier owned by a hub. Used by the inventory (AllAgentsDialog)
 * to hide the per-LV specialist agents — they're reached through their hub, so
 * listing all 14 individually would re-introduce the clutter the hub removes.
 */
export function getHubMemberAgentIds(): ReadonlySet<string> {
  return new Set(LV_HUBS.flatMap((hub) => [hub.prAgentId, hub.buergerAgentId]));
}

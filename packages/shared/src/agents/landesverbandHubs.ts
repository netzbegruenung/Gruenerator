import { type NotebookId, isNotebookEnabled } from '../notebooks/index.js';

import { LANDESVERBAENDE } from './landesverbaende.js';
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

/**
 * Derived from the LV registry (`landesverbaende.ts`): every Landesverband that
 * declares a `hub` becomes a hub. notebookId / agent ids / audience all come
 * from the single registry entry, so a hub can never drift from the agents it
 * points at. The registry types the agent ids as `string`; they are valid
 * `SystemAgentId`s by construction, so the cast is the assertion at this boundary.
 */
export const LV_HUBS: readonly LvHub[] = LANDESVERBAENDE.flatMap((lv) =>
  'hub' in lv
    ? [
        {
          lvId: lv.id,
          slug: lv.hub.slug,
          name: lv.hub.name,
          notebookId: lv.notebookId,
          prAgentId: lv.prAgentId as SystemAgentId,
          buergerAgentId: lv.buergerAgentId as SystemAgentId,
          audience: lv.audience,
        },
      ]
    : []
);

const hubBySlug = new Map<string, LvHub>(LV_HUBS.map((hub) => [hub.slug, hub]));

/** Resolve a URL slug to its Landesverband hub, or `null` if it isn't one. */
export function getLandesverbandHubBySlug(slug: string): LvHub | null {
  return hubBySlug.get(slug) ?? null;
}

/**
 * Hubs visible to a user's locale. A Landesverband is inherently
 * locale-specific (the AT hub surfaces only for Austrian users, the rest only
 * for German users) — so unlike agents, a hub never has an `'all'` audience.
 */
export function getLandesverbandHubs(userLocale: string): readonly LvHub[] {
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

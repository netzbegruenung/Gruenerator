import { DEFAULT_INSTANCE_ID, type InstanceId } from '../instances/index.js';
import {
  type NotebookId,
  isNotebookOfferedIn,
  isNotebookResolvableIn,
} from '../notebooks/index.js';

import { LANDESVERBAENDE } from './landesverbaende.js';
import { type SystemAgentId } from './system.js';
import { type AgentAudience } from './types.js';

/**
 * A Landesverband hub groups the specialist agents that share one Landesverband
 * (a creative `Öffentlichkeitsarbeit` agent, a factual `Bürger*innenanfragen`
 * agent and a `Wahlprüfsteine` agent) behind a single branded slug.
 *
 * The branded slug (`gruene-berlin`) lives here, NOT on any agent — so
 * `/agents/gruene-berlin` opens a small landing offering all of them instead
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
  /** The LV notebook every agent pins. Also drives the hub's icon (the LV's
   *  chosen notebook icon) via `NOTEBOOK_ICONS` on the web side. */
  notebookId: NotebookId;
  prAgentId: SystemAgentId;
  buergerAgentId: SystemAgentId;
  wahlpruefsteinAgentId: SystemAgentId;
  audience: AgentAudience;
}

/**
 * Derived from the LV registry (`landesverbaende.ts`): jeder Landesverband wird
 * zu einem Hub. notebookId / agent ids / audience all come from the single
 * registry entry, so a hub can never drift from the agents it points at. The
 * registry types the agent ids as `string`; they are valid `SystemAgentId`s by
 * construction, so the cast is the assertion at this boundary.
 *
 * Vollständig statt gefiltert: `hub` ist am Registry-Eintrag Pflicht, weil diese
 * Liste die einzige notebook→agents-Relation trägt, aus der sich die Ausblende-
 * Pfade bedienen. Ein hier fehlender LV wäre ein LV, der sich nicht verstecken
 * lässt — siehe den Kommentar an `LandesverbandEntry.hub`.
 */
export const LV_HUBS: readonly LvHub[] = LANDESVERBAENDE.map((lv) => ({
  lvId: lv.id,
  slug: lv.hub.slug,
  name: lv.hub.name,
  notebookId: lv.notebookId,
  prAgentId: lv.prAgentId as SystemAgentId,
  buergerAgentId: lv.buergerAgentId as SystemAgentId,
  wahlpruefsteinAgentId: lv.wahlpruefsteinAgentId as SystemAgentId,
  audience: lv.audience,
}));

const hubBySlug = new Map<string, LvHub>(LV_HUBS.map((hub) => [hub.slug, hub]));

/**
 * Resolve a URL slug to its Landesverband hub, or `null` if it isn't one — oder
 * wenn das Notebook des Hubs auf dieser Instanz nicht mehr auflösbar ist.
 *
 * Die Prüfung gehört hierher, nicht nur in {@link getLandesverbandHubs}: Die
 * gefilterte Plural-Variante beantwortet die Auflistungsfrage und hat gar keine
 * Aufrufer im App-Code — das Routing für `/agents/:slug` läuft ausschließlich
 * über diese Funktion (`ChatPage.tsx`). Ohne Gate rendert ein deaktivierter
 * Landesverband seine Hub-Landing samt aller drei funktionsfähiger Agenten
 * weiter, obwohl er aus jeder Galerie, jedem Picker und dem Inventar
 * verschwunden ist.
 *
 * Bewusst `isNotebookResolvableIn` und nicht `isNotebookOfferedIn`: Ein bloß
 * von der Instanz *verstecktes* Notebook soll seinen Direktlink behalten
 * (URL-Sonderrecht, CLAUDE.md) — nur der globale `enabled: false`-Schalter und
 * die `block`-Stufe schließen wirklich zu.
 */
export function getLandesverbandHubBySlug(
  slug: string,
  instanceId: InstanceId = DEFAULT_INSTANCE_ID
): LvHub | null {
  const hub = hubBySlug.get(slug);
  if (!hub) return null;
  return isNotebookResolvableIn(hub.notebookId, instanceId) ? hub : null;
}

/**
 * Hubs visible to a user's locale on a given instance. A Landesverband is
 * inherently locale-specific (the AT hub surfaces only for Austrian users, the
 * rest only for German users) — so unlike agents, a hub never has an `'all'`
 * audience.
 */
export function getLandesverbandHubs(
  userLocale: string,
  instanceId: InstanceId = DEFAULT_INSTANCE_ID
): readonly LvHub[] {
  return LV_HUBS.filter(
    (hub) => hub.audience === userLocale && isNotebookOfferedIn(hub.notebookId, instanceId)
  );
}

/**
 * The specialist agents of every Landesverband whose notebook this instance
 * does not offer. This is the cascade that makes hiding LV notebooks a
 * one-liner: the hub owns the notebook↔agents relation, so switching off the
 * notebook switches off every one of its agents without naming any of them.
 */
export function getLvAgentIdsHiddenIn(instanceId: InstanceId): ReadonlySet<string> {
  return new Set(
    LV_HUBS.filter((hub) => !isNotebookOfferedIn(hub.notebookId, instanceId)).flatMap((hub) => [
      hub.prAgentId,
      hub.buergerAgentId,
      hub.wahlpruefsteinAgentId,
    ])
  );
}

/**
 * Every agent identifier owned by a hub. Used by the inventory (AllAgentsDialog)
 * to hide the per-LV specialist agents — they're reached through their hub, so
 * listing them all individually would re-introduce the clutter the hub removes.
 */
export function getHubMemberAgentIds(): ReadonlySet<string> {
  return new Set(
    LV_HUBS.flatMap((hub) => [hub.prAgentId, hub.buergerAgentId, hub.wahlpruefsteinAgentId])
  );
}

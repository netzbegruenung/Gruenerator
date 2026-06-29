import {
  VISIBLE_SYSTEM_AGENTS as ALL_VISIBLE_SYSTEM_AGENTS,
  getHubMemberAgentIds,
  getVisibleSystemAgentsForLocale,
  type Agent,
} from '@gruenerator/shared/agents';
import {
  PiSparkle,
  PiMegaphone,
  PiBuildings,
  PiMagnifyingGlass,
  PiChatsCircle,
  PiMicrophone,
  PiBookOpenText,
  PiHandHeart,
  PiFileText,
  PiBird,
  PiImagesSquare,
} from 'react-icons/pi';

import type { IconType } from 'react-icons';

/**
 * String key → react-icons component. Agents reference icons by `iconKey`
 * (in their `SYSTEM_AGENTS` entry); this registry is the platform-side mapping.
 * Adding a new agent icon = add one line here AND set `iconKey` on the agent.
 */
const ICON_REGISTRY: Record<string, IconType> = {
  sparkle: PiSparkle,
  megaphone: PiMegaphone,
  buildings: PiBuildings,
  'magnifying-glass': PiMagnifyingGlass,
  'chats-circle': PiChatsCircle,
  microphone: PiMicrophone,
  'book-open-text': PiBookOpenText,
  'hand-heart': PiHandHeart,
  'file-text': PiFileText,
  bird: PiBird,
  'image-square': PiImagesSquare,
};

const FALLBACK_ICON: IconType = PiSparkle;

/**
 * Per-LV Öffentlichkeitsarbeit variants share the megaphone via prefix check —
 * adding a new LV-PR agent needs zero changes here (and no `iconKey` on the
 * agent definition either).
 */
export function getAgentIcon(identifier: string): IconType {
  if (identifier.startsWith('gruenerator-oeffentlichkeitsarbeit')) return PiMegaphone;
  const agent = ALL_VISIBLE_SYSTEM_AGENTS.find((a) => a.identifier === identifier);
  if (agent?.iconKey) return ICON_REGISTRY[agent.iconKey] ?? FALLBACK_ICON;
  return FALLBACK_ICON;
}

export interface DefaultAgentEntry {
  key: string;
  label: string;
  identifier: string;
}

/**
 * Pinned defaults — always visible at the top of the sidebar regardless of
 * favorites. Derived from `pinnedToSidebar: true` on the agent definition,
 * then filtered + localized for the user's locale via the shared registry
 * helper. To pin a new agent: flip that flag on its `SYSTEM_AGENTS` entry
 * and add an `iconKey` — no edits in this file.
 *
 * Order follows array order in `SYSTEM_AGENTS`.
 */
export function getDefaultAgentEntries(userLocale: string): readonly DefaultAgentEntry[] {
  return getVisibleSystemAgentsForLocale(userLocale)
    .filter((a) => a.pinnedToSidebar === true)
    .map((a) => ({
      key: `default-${a.identifier.replace(/^gruenerator-/, '')}`,
      label: a.title,
      identifier: a.identifier,
    }));
}

/**
 * Identifier set for the pinned agents. Used by sidebar consumers (e.g.
 * `Sidebar.tsx`) to filter the favorites list and avoid double-rendering
 * agents that are already pinned at the top. Locale-aware so AT users
 * don't accidentally de-dupe a DE-only pinned agent they can't see.
 */
export function getPinnedAgentIds(userLocale: string): ReadonlySet<string> {
  return new Set(getDefaultAgentEntries(userLocale).map((e) => e.identifier));
}

/**
 * Agents shown in the "Alle Agents" modal: visible registry minus the pinned
 * set (those are rendered separately), minus those whose `audience` excludes
 * this user's locale, and minus the per-LV specialist agents — those are
 * reached through their Landesverband hub (rendered as its own section), so
 * listing all 14 individually would re-introduce the clutter the hub removes.
 * Single source of truth for the modal — keeps it from drifting against the sidebar.
 */
export function getVisibleSystemAgents(userLocale: string): readonly Agent[] {
  const pinned = getPinnedAgentIds(userLocale);
  const hubMembers = getHubMemberAgentIds();
  return getVisibleSystemAgentsForLocale(userLocale).filter(
    (a) => !pinned.has(a.identifier) && !hubMembers.has(a.identifier)
  );
}

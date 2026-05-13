import {
  VISIBLE_SYSTEM_AGENTS as ALL_VISIBLE_SYSTEM_AGENTS,
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
 * favorites. Derived from `pinnedToSidebar: true` on the agent definition.
 * To pin a new agent: flip that flag on its `SYSTEM_AGENTS` entry and add an
 * `iconKey` — no edits in this file.
 *
 * Order follows array order in `SYSTEM_AGENTS`.
 */
export const DEFAULT_AGENT_ENTRIES: readonly DefaultAgentEntry[] = ALL_VISIBLE_SYSTEM_AGENTS.filter(
  (a) => a.pinnedToSidebar === true
).map((a) => ({
  key: `default-${a.identifier.replace(/^gruenerator-/, '')}`,
  label: a.title,
  identifier: a.identifier,
}));

/**
 * Identifier set for the pinned agents. Used by sidebar consumers (e.g.
 * `Sidebar.tsx`) to filter the favorites list and avoid double-rendering
 * agents that are already pinned at the top.
 */
export const PINNED_AGENT_IDS: ReadonlySet<string> = new Set(
  DEFAULT_AGENT_ENTRIES.map((e) => e.identifier)
);

/**
 * Agents shown in the "Alle Agents" modal: visible registry minus the pinned
 * set (those are rendered separately). Single source of truth for the modal
 * — keeps it from drifting against the sidebar.
 */
export const VISIBLE_SYSTEM_AGENTS: readonly Agent[] = ALL_VISIBLE_SYSTEM_AGENTS.filter(
  (a) => !PINNED_AGENT_IDS.has(a.identifier)
);

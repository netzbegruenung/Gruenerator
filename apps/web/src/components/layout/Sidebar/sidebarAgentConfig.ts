import {
  VISIBLE_SYSTEM_AGENTS as ALL_VISIBLE_SYSTEM_AGENTS,
  type Agent,
  type SystemAgentId,
} from '@gruenerator/shared/agents';
import {
  PiSparkle,
  PiMegaphone,
  PiNotePencil,
  PiMagnifyingGlass,
  PiChatsCircle,
  PiMicrophone,
  PiBookOpenText,
  PiHandHeart,
  PiFileText,
} from 'react-icons/pi';

import type { IconType } from 'react-icons';

/**
 * Agent ids already rendered at the top of the "Alle Agents" modal via
 * DEFAULT_AGENT_ENTRIES — excluded from the main system-agent list below
 * to avoid duplicate rows.
 */
const HIDDEN_INVENTORY_AGENT_IDS = new Set<SystemAgentId>([
  'gruenerator-oeffentlichkeitsarbeit',
  'gruenerator-antrag',
  'gruenerator-suche',
]);

export const VISIBLE_SYSTEM_AGENTS: readonly Agent[] = ALL_VISIBLE_SYSTEM_AGENTS.filter(
  (a) => !HIDDEN_INVENTORY_AGENT_IDS.has(a.identifier as SystemAgentId)
);

const AGENT_ICONS: Partial<Record<SystemAgentId, IconType>> = {
  'gruenerator-universal': PiSparkle,
  'gruenerator-antrag': PiNotePencil,
  'gruenerator-suche': PiMagnifyingGlass,
  'gruenerator-oeffentlichkeitsarbeit': PiMegaphone,
  'gruenerator-buergerservice': PiChatsCircle,
  'gruenerator-rede-schreiber': PiMicrophone,
  'gruenerator-wahlprogramm': PiBookOpenText,
  'gruenerator-leichte-sprache': PiHandHeart,
  'gruenerator-docs-editor': PiFileText,
};

/**
 * All PR agents (universal + 7 per-LV variants) share PiMegaphone — the
 * prefix check means new LV-PR agents need zero changes here.
 */
export function getAgentIcon(identifier: string): IconType {
  if (identifier.startsWith('gruenerator-oeffentlichkeitsarbeit')) return PiMegaphone;
  return AGENT_ICONS[identifier as SystemAgentId] ?? PiSparkle;
}

export interface DefaultAgentEntry {
  key: string;
  label: string;
  identifier: string;
}

/**
 * Pinned defaults always shown in the sidebar regardless of favorites.
 * "Öffentlichkeitsarbeit" is the combined Presse + Social Media agent.
 * Splitting it into separate entries caused an Array.find first-match display
 * ambiguity (clicking Social Media showed "Pressemitteilung" because both
 * pointed at the same identifier) — single entry resolves that.
 * Icon comes from `getAgentIcon(identifier)` — single source of truth.
 *
 * Per-LV Öffentlichkeitsarbeit agents are intentionally NOT pinned here.
 * They are discoverable via the "Alle Agents" modal and the per-LV notebook
 * auto-select; users can favorite them to surface them in the sidebar.
 */
export const DEFAULT_AGENT_ENTRIES: readonly DefaultAgentEntry[] = [
  {
    key: 'default-oeffentlichkeitsarbeit',
    label: 'Öffentlichkeitsarbeit',
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
  },
  {
    key: 'default-antrag',
    label: 'Anträge',
    identifier: 'gruenerator-antrag',
  },
  {
    key: 'default-suche',
    label: 'Suche',
    identifier: 'gruenerator-suche',
  },
];

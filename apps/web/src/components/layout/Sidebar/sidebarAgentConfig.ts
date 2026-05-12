import { PiMegaphone, PiNotePencil, PiMagnifyingGlass } from 'react-icons/pi';

import type { IconType } from 'react-icons';

export interface DefaultAgentEntry {
  key: string;
  label: string;
  identifier: string;
  Icon: IconType;
}

/**
 * Mentions that the user wants only as `/mention` skills, NOT as standalone
 * agents in the sidebar inventory or "Alle Agents" modal. Either represented
 * by a default entry (presse / social media / antrag) or skill-only by request
 * (aktion). The mention system in chat continues to resolve all of these.
 */
export const HIDDEN_INVENTORY_MENTIONS = new Set([
  'presse',
  'instagram',
  'facebook',
  'twitter',
  'linkedin',
  'reel',
  'antrag',
  'aktion',
]);

/**
 * Pinned defaults always shown in the sidebar regardless of favorites.
 * "Öffentlichkeitsarbeit" is the combined Presse + Social Media agent — one
 * model handling both formats with platform routing inside its system prompt
 * (see `system.ts` Schritt 3a/3b). Splitting it into separate entries caused
 * an `Array.find`-first-match display ambiguity (clicking Social Media showed
 * "Pressemitteilung" because both pointed at the same identifier).
 *
 * Per-LV Öffentlichkeitsarbeit agents are intentionally NOT pinned here —
 * they are discoverable via the "Alle Agents" modal and the per-LV notebook
 * auto-select; users can favorite them to surface them in the sidebar.
 */
export const DEFAULT_AGENT_ENTRIES: readonly DefaultAgentEntry[] = [
  {
    key: 'default-oeffentlichkeitsarbeit',
    label: 'Öffentlichkeitsarbeit',
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    Icon: PiMegaphone,
  },
  {
    key: 'default-antrag',
    label: 'Anträge',
    identifier: 'gruenerator-antrag',
    Icon: PiNotePencil,
  },
  {
    key: 'default-suche',
    label: 'Suche',
    identifier: 'gruenerator-suche',
    Icon: PiMagnifyingGlass,
  },
];

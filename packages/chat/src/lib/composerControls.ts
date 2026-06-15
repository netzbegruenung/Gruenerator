import { type SearchMode, type ThreadMode, type ToolKey } from '../stores/chatStore';

/**
 * Semantic icon keys for composer controls. The shared layer stays renderer-agnostic
 * (no lucide / Ionicons imports here); each platform maps these keys to its own icon
 * set — web → lucide, mobile → Ionicons.
 */
export type ComposerIconKey = 'chat' | 'notebook' | 'custom';

export interface ComposerModeDef {
  mode: ThreadMode;
  /** User-facing label (German, du-form). Shared so web and mobile never relabel independently. */
  label: string;
  icon: ComposerIconKey;
}

/**
 * Single source of truth for the chat composer's selectable modes — label + semantic
 * icon per mode. Web and mobile each render their own (platform-specific) control UI
 * *from this list* and may choose which subset to surface, but the mode set, labels,
 * and icon semantics live here so the composer tool UI can't silently drift between
 * platforms. (Model options already follow this pattern via `MODEL_OPTIONS`.)
 *
 * Change a mode here → both platforms follow.
 */
export const COMPOSER_MODES: ComposerModeDef[] = [
  { mode: 'chat', label: 'Chat', icon: 'chat' },
  { mode: 'notebook', label: 'Notebook', icon: 'notebook' },
  { mode: 'eigener', label: 'Eigener Chat', icon: 'custom' },
];

export type ComposerToolIconKey = 'document' | 'globe' | 'idea' | 'newspaper' | 'research';

export interface ComposerToolDef {
  key: ToolKey;
  /** User-facing label (German, du-form). */
  label: string;
  icon: ComposerToolIconKey;
}

/**
 * Single source of truth for the per-tool composer toggles, following the
 * COMPOSER_MODES pattern: the tool set, labels, and icon semantics live here
 * so the toggle list can't drift between platforms.
 */
export const COMPOSER_TOOLS: ComposerToolDef[] = [
  { key: 'search', label: 'Dokumentensuche', icon: 'document' },
  // Merged search tool: a single "Recherche" toggle gates both backend search
  // paths (fast web + deep research). The `web` ToolKey lives on internally as a
  // gate/back-compat key (see chatStore `toggleTool`), but is no longer a
  // separate user-facing toggle.
  { key: 'examples', label: 'Beispiele', icon: 'idea' },
  { key: 'pressemitteilung_examples', label: 'Pressemitteilungen', icon: 'newspaper' },
  { key: 'research', label: 'Recherche', icon: 'research' },
];

export type SearchDepthIconKey = 'fast' | 'deep';

export interface SearchDepthDef {
  mode: SearchMode;
  label: string;
  description: string;
  icon: SearchDepthIconKey;
}

/** Search depth (Recherchetiefe) options — shared copy for web + mobile. */
export const SEARCH_DEPTHS: SearchDepthDef[] = [
  {
    mode: 'web',
    label: 'Schnell',
    description: 'Web + Dokumente, sofortige Antwort',
    icon: 'fast',
  },
  {
    mode: 'deep',
    label: 'Tiefe Recherche',
    description: 'Mehrere Suchläufe, längeres Dossier',
    icon: 'deep',
  },
];

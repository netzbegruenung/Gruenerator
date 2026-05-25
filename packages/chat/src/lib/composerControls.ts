import { type ThreadMode } from '../stores/chatStore';

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

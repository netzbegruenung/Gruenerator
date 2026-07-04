import { bildBearbeitenMode } from './bildBearbeiten';
import { bildBegruenenMode } from './bildBegruenen';
import { bildHintergrundEntfernenMode } from './bildHintergrundEntfernen';
import { bildVergroessernMode } from './bildVergroessern';
import { imagineMode } from './imagine';

import type { ModeDefinition, ModeGroupEntry } from './types';

export type {
  ModeDefinition,
  ModeGroupEntry,
  ModeState,
  ExtraFieldConfig,
  TagInputConfig,
} from './types';

// Only the image modes are surfaced by the workplace Creator (MODE_GROUPS) and
// resolved via MODE_MAP (BilderInner). The former presse/social/antrag/text-editor
// generator modes were never wired into the Creator and have been removed.
const ALL_MODES: ModeDefinition[] = [
  imagineMode,
  bildBearbeitenMode,
  bildBegruenenMode,
  bildVergroessernMode,
  bildHintergrundEntfernenMode,
];

export const MODE_MAP: Record<string, ModeDefinition> = Object.fromEntries(
  ALL_MODES.map((m) => [m.id, m])
);

export const MODE_GROUPS: ModeGroupEntry[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'bilder', label: 'Bilder' },
];

export const DEFAULT_MODE = 'chat';

export const SUBMODE_LABELS: Record<string, string> = {};

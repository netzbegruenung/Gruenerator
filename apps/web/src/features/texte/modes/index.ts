import { antragMode } from './antrag';
import { boardsMode } from './boards';
import { imagineMode } from './imagine';
import { presseSocialMode } from './presseSocial';
import { textEditorMode } from './textEditor';

import type { ModeDefinition, ModeGroupEntry } from './types';

export type {
  ModeDefinition,
  ModeGroupEntry,
  ModeState,
  ExtraFieldConfig,
  TagInputConfig,
} from './types';

const ALL_MODES: ModeDefinition[] = [
  presseSocialMode,
  antragMode,
  boardsMode,
  imagineMode,
  textEditorMode,
];

export const MODE_MAP: Record<string, ModeDefinition> = Object.fromEntries(
  ALL_MODES.map((m) => [m.id, m])
);

export const MODE_GROUPS: ModeGroupEntry[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'presse-social', label: 'Presse & Social' },
  { id: 'antrag', label: 'Anträge' },
  { id: 'imagine', label: 'Bilder' },
  { id: 'boards', label: 'Boards' },
  { id: 'eigene', label: 'Eigene' },
];

export const DEFAULT_MODE = 'chat';

export const SUBMODE_LABELS: Record<string, string> = {
  texteditor: 'Bearbeiten',
};

import { antragMode } from './antrag';
import { boardsMode } from './boards';
import { buergeranfragenMode } from './buergeranfragen';
import { imagineMode } from './imagine';
import { leichteSpracheMode } from './leichteSprache';
import { presseSocialMode } from './presseSocial';
import { redeMode } from './rede';
import { textEditorMode } from './textEditor';
import { wahlprogrammMode } from './wahlprogramm';

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
  redeMode,
  wahlprogrammMode,
  buergeranfragenMode,
  leichteSpracheMode,
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
  {
    id: 'sonstige',
    label: 'Sonstige',
    submodes: [
      'texteditor',
      'rede',
      'wahlprogramm',
      'buergeranfragen',
      'leichte_sprache',
      'eigene',
    ],
  },
];

export const DEFAULT_MODE = 'chat';

export const SUBMODE_LABELS: Record<string, string> = {
  texteditor: 'Bearbeiten',
  rede: 'Rede',
  wahlprogramm: 'Wahlprogramm',
  buergeranfragen: 'Bürger*innenanfragen',
  leichte_sprache: 'Leichte Sprache',
  eigene: 'Eigene',
};

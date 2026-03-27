import {
  MessageCircle,
  Newspaper,
  FileText,
  ImageIcon,
  LayoutGrid,
  Settings,
  MoreHorizontal,
} from 'lucide-react';
import { createElement } from 'react';

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
  { id: 'chat', label: 'Chat', icon: createElement(MessageCircle) },
  { id: 'presse-social', label: 'Presse & Social', icon: createElement(Newspaper) },
  { id: 'antrag', label: 'Anträge', icon: createElement(FileText) },
  { id: 'imagine', label: 'Bilder', icon: createElement(ImageIcon) },
  { id: 'boards', label: 'Boards', icon: createElement(LayoutGrid) },
  { id: 'eigene', label: 'Eigene', icon: createElement(Settings) },
  {
    id: 'sonstige',
    label: 'Sonstige',
    icon: createElement(MoreHorizontal),
    submodes: ['texteditor', 'rede', 'wahlprogramm', 'buergeranfragen', 'leichte_sprache'],
  },
];

export const DEFAULT_MODE = 'chat';

export const SUBMODE_LABELS: Record<string, string> = {
  texteditor: 'Bearbeiten',
  rede: 'Rede',
  wahlprogramm: 'Wahlprogramm',
  buergeranfragen: 'Bürger*innenanfragen',
  leichte_sprache: 'Leichte Sprache',
};

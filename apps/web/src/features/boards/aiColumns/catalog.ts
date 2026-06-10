/**
 * Frontend presentation registry for the AI-column node types. Mirrors the
 * contract's union literals (the contracts own label/description for presets; the
 * icons live here because React components can't sit in the contracts package).
 * Adding a node type → add an entry here (the Record is exhaustive over the union).
 */
import {
  BOARD_AI_PRESETS,
  type BoardAiPreset,
  type BoardFlowOutputType,
  type BoardFlowSourceType,
} from '@gruenerator/contracts';
import {
  FiAlignLeft,
  FiBookOpen,
  FiCreditCard,
  FiFileText,
  FiGlobe,
  FiLink,
  FiMail,
  FiMessageSquare,
  FiSearch,
  FiShare2,
} from 'react-icons/fi';

import type { IconType } from 'react-icons';

export interface NodeMeta {
  label: string;
  help: string;
  icon: IconType;
}

export const SOURCE_UI: Record<BoardFlowSourceType, NodeMeta> = {
  card: { label: 'Karteninhalt', help: 'Titel & Beschreibung der Karte', icon: FiCreditCard },
  scrape_url: { label: 'URL scrapen', help: 'Inhalt einer URL aus der Karte laden', icon: FiLink },
  apify_social: {
    label: 'Social-Media',
    help: 'Letzte Posts eines Accounts (benötigt APIFY_TOKEN)',
    icon: FiShare2,
  },
};

const PRESET_ICONS: Record<BoardAiPreset, IconType> = {
  web_research: FiGlobe,
  deep_research: FiSearch,
  doc_search: FiBookOpen,
  summarize: FiAlignLeft,
};

export const PRESET_UI = BOARD_AI_PRESETS.map((p) => ({ ...p, icon: PRESET_ICONS[p.type] }));

export const OUTPUT_UI: Record<BoardFlowOutputType, NodeMeta> = {
  comment: {
    label: 'Bot-Kommentar',
    help: 'Ergebnis als Kommentar auf der Karte',
    icon: FiMessageSquare,
  },
  document: { label: 'Dokument', help: 'Ergebnis als Dokument erstellen', icon: FiFileText },
  email: { label: 'E-Mail an mich', help: 'Ergebnis per E-Mail senden', icon: FiMail },
};

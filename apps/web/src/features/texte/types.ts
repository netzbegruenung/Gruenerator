import type { ReactNode } from 'react';

export type TabId = 'texte' | 'presse-social' | 'antrag' | 'universal' | 'barrierefreiheit' | 'texteditor' | 'eigene';

export type UniversalSubType = 'rede' | 'wahlprogramm' | 'buergeranfragen' | 'leichte_sprache';

export type InstructionType = 'social' | 'antrag' | 'universal' | 'rede' | 'buergeranfragen' | 'leichte_sprache' | 'texteditor';

export type FeatureType = 'webSearch' | 'privacyMode' | 'proMode';

export interface TabConfig {
  id: TabId;
  label: string;
  shortLabel: string;
  subtitle: string;
  instructionType: InstructionType;
  features: FeatureType[];
  componentName: string;
  defaultMode: 'balanced' | 'pro' | 'privacy';
}

export interface TabFormRef {
  getFormData: () => Record<string, unknown>;
  resetForm?: (data?: Record<string, unknown>) => void;
}

export interface TabProps {
  form: Record<string, unknown>;
  setup: Record<string, unknown>;
  builder: Record<string, unknown>;
  onGeneratedContentChange?: (content: string) => void;
}

export interface GeneratedContentResult {
  content: string;
  metadata?: Record<string, unknown>;
  sharepic?: unknown[];
  social?: {
    content: string;
    metadata?: Record<string, unknown>;
  };
  selectedPlatforms?: string[];
  onEditSharepic?: (sharepicData: unknown) => Promise<void>;
}

export const TAB_CONFIGS: TabConfig[] = [
  {
    id: 'texte',
    label: 'Texte',
    shortLabel: 'Texte',
    subtitle: 'Erstelle jeden Text mit KI-Unterstützung',
    instructionType: 'universal',
    features: ['webSearch', 'privacyMode', 'proMode'],
    componentName: 'texte-generator',
    defaultMode: 'balanced'
  },
  {
    id: 'presse-social',
    label: 'Presse & Social',
    shortLabel: 'Presse & Social',
    subtitle: 'Erstelle Social Media Posts und Pressemitteilungen',
    instructionType: 'social',
    features: ['webSearch', 'privacyMode', 'proMode'],
    componentName: 'presse-social',
    defaultMode: 'balanced'
  },
  {
    id: 'antrag',
    label: 'Anträge',
    shortLabel: 'Anträge',
    subtitle: 'Erstelle Anträge und parlamentarische Anfragen',
    instructionType: 'antrag',
    features: ['webSearch', 'privacyMode'],
    componentName: 'antrag-generator',
    defaultMode: 'pro'
  },
  // Temporarily disabled - Leichte Sprache moved to Sonstige tab
  // {
  //   id: 'barrierefreiheit',
  //   label: 'Barrierefreiheit',
  //   shortLabel: 'Barriere',
  //   subtitle: 'Alt-Text & Leichte Sprache',
  //   instructionType: 'accessibility',
  //   features: ['privacyMode'],
  //   componentName: 'accessibility-generator',
  //   defaultMode: 'privacy'
  // },
  {
    id: 'universal',
    label: 'Sonstige',
    shortLabel: 'Sonstige',
    subtitle: 'Reden, Programme, Leichte Sprache & mehr',
    instructionType: 'universal',
    features: ['webSearch', 'privacyMode', 'proMode'],
    componentName: 'universal-text',
    defaultMode: 'privacy'
  },
  {
    id: 'texteditor',
    label: 'Bearbeiten',
    shortLabel: 'Bearbeiten',
    subtitle: 'Texte bearbeiten und verbessern',
    instructionType: 'texteditor',
    features: ['privacyMode'],
    componentName: 'text-editor',
    defaultMode: 'privacy'
  },
  {
    id: 'eigene',
    label: 'Eigene',
    shortLabel: 'Eigene',
    subtitle: 'Deine benutzerdefinierten Grüneratoren',
    instructionType: 'universal',
    features: ['webSearch', 'privacyMode', 'proMode'],
    componentName: 'eigene-generators',
    defaultMode: 'balanced'
  }
];

export const getTabConfig = (tabId: TabId): TabConfig | undefined => {
  return TAB_CONFIGS.find(config => config.id === tabId);
};

// Default to 'presse-social' which is the only public tab (accessible without login)
export const DEFAULT_TAB: TabId = 'presse-social';

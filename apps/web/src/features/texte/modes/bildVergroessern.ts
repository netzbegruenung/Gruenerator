import type { ModeDefinition } from './types';

export const bildVergroessernMode: ModeDefinition = {
  id: 'bild-vergroessern',
  endpoint: '/imagine/outpaint',
  instructionType: 'universal',
  componentName: 'bild-vergroessern',
  defaultMode: 'balanced',
  searchQueryFields: [],
  placeholder: 'Wähle ein Bild und eine Ziel-Größe — kein Prompt nötig.',
  useCustomSubmit: true,
  useMarkdown: false,
  promptField: '',
  examples: [],
};

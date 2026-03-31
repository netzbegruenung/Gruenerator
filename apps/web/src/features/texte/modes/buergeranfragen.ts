import type { ModeDefinition } from './types';

export const buergeranfragenMode: ModeDefinition = {
  id: 'buergeranfragen',
  endpoint: '/claude_buergeranfragen',
  instructionType: 'buergeranfragen',
  componentName: 'universal-text-buergeranfragen',
  defaultMode: 'privacy',
  searchQueryFields: ['inhalt'],
  placeholder: 'Formuliere die Bürger*innenanfrage...',
  useMarkdown: true,
  promptField: 'frage',
};

import type { ModeDefinition } from './types';

export const bildHintergrundEntfernenMode: ModeDefinition = {
  id: 'bild-hintergrund-entfernen',
  endpoint: '/background-removal',
  instructionType: 'universal',
  componentName: 'bild-hintergrund-entfernen',
  defaultMode: 'balanced',
  searchQueryFields: ['editPrompt'],
  placeholder: 'Lade ein Bild hoch — der Hintergrund wird automatisch entfernt.',
  useCustomSubmit: true,
  useMarkdown: false,
  promptField: 'editPrompt',
  examples: [],
};

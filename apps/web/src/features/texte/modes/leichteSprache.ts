import type { ModeDefinition } from './types';

export const leichteSpracheMode: ModeDefinition = {
  id: 'leichte_sprache',
  endpoint: '/leichte_sprache',
  instructionType: 'leichte_sprache',
  componentName: 'universal-text-leichte_sprache',
  defaultMode: 'privacy',
  searchQueryFields: ['originalText'],
  placeholder: 'Füge hier den Text ein, den du in Leichte Sprache übersetzen möchtest...',
  useMarkdown: true,
  promptField: 'originalText',
  buildSubmitFields: (prompt) => ({
    originalText: prompt,
  }),
};

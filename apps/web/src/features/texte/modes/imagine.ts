import { DEFAULT_IMAGE_MODEL_ID } from '@gruenerator/shared/models';

import type { ModeDefinition } from './types';

export const imagineMode: ModeDefinition = {
  id: 'imagine',
  endpoint: '/imagine/pure',
  instructionType: 'universal',
  componentName: 'imagine-creator',
  defaultMode: 'balanced',
  searchQueryFields: ['purePrompt'],
  placeholder: 'Beschreibe das Bild, das du erstellen möchtest...',
  useCustomSubmit: true,
  useMarkdown: false,
  promptField: 'purePrompt',
  settings: [
    {
      key: 'variant',
      label: 'Stil',
      options: [
        { id: '', label: 'Universal' },
        { id: 'illustration-pure', label: 'Illustration' },
        { id: 'realistic-pure', label: 'Realistisch' },
        { id: 'pixel-pure', label: 'Pixel Art' },
      ],
      multiple: false,
    },
  ],
  defaults: {
    variant: '',
    imageModel: DEFAULT_IMAGE_MODEL_ID,
  },
  examples: [{ label: 'Plakat', text: 'Ein grünes Wahlplakat mit Sonnenblumen und dem Slogan ' }],
};

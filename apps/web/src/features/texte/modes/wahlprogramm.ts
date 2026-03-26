import type { ModeDefinition } from './types';

export const wahlprogrammMode: ModeDefinition = {
  id: 'wahlprogramm',
  endpoint: '/claude_wahlprogramm',
  instructionType: 'universal',
  componentName: 'universal-text-wahlprogramm',
  defaultMode: 'privacy',
  searchQueryFields: ['inhalt'],
  placeholder: 'Beschreibe den Inhalt des Wahlprogramm-Kapitels...',
  useMarkdown: true,
  settings: [
    {
      key: 'zeichenanzahl',
      label: 'Zeichen',
      options: [
        { id: '1000', label: '1.000' },
        { id: '1500', label: '1.500' },
        { id: '2000', label: '2.000' },
        { id: '2500', label: '2.500' },
        { id: '3500', label: '3.500' },
      ],
      multiple: false,
    },
  ],
  defaults: {
    zeichenanzahl: '2000',
  },
  buildSubmitFields: (_prompt, state) => ({
    zeichenanzahl: state.zeichenanzahl,
  }),
};

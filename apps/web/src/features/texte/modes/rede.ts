import type { ModeDefinition } from './types';

export const redeMode: ModeDefinition = {
  id: 'rede',
  endpoint: '/claude_rede',
  instructionType: 'rede',
  componentName: 'universal-text-rede',
  defaultMode: 'privacy',
  searchQueryFields: ['thema', 'rolle'],
  placeholder: 'Beschreibe das Thema oder den Anlass deiner Rede...',
  useMarkdown: true,
  promptField: 'thema',
  settings: [
    {
      key: 'redezeit',
      label: 'Redezeit',
      options: [
        { id: '1', label: '1 Min' },
        { id: '2', label: '2 Min' },
        { id: '3', label: '3 Min' },
        { id: '5', label: '5 Min' },
      ],
      multiple: false,
    },
  ],
  extraFields: [
    {
      key: 'rolle',
      type: 'input',
      placeholder: 'z.B. Fraktionsvorsitzende*r, Kreisverbandssprecher*in...',
    },
  ],
  defaults: {
    redezeit: '3',
    rolle: '',
  },
  buildSubmitFields: (prompt, state) => ({
    thema: prompt,
    rolle: state.rolle,
    redezeit: state.redezeit,
  }),
};

import type { ModeDefinition } from './types';

export const redeMode: ModeDefinition = {
  id: 'rede',
  endpoint: '/claude_rede',
  instructionType: 'rede',
  componentName: 'universal-text-rede',
  defaultMode: 'privacy',
  searchQueryFields: ['thema'],
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
  defaults: {
    redezeit: '3',
  },
  buildSubmitFields: (_prompt, state) => ({
    redezeit: state.redezeit,
  }),
};

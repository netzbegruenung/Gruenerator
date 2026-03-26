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
  extraFields: [
    {
      key: 'gremium',
      type: 'input',
      placeholder: 'z.B. Stadtrat, Kreistag, Bezirksverordnetenversammlung...',
    },
    {
      key: 'antwort',
      type: 'textarea',
      placeholder: 'Wie soll die Antwort gestaltet sein? z.B. Sachlich, detailliert...',
    },
  ],
  defaults: {
    gremium: '',
    antwort: '',
  },
  buildSubmitFields: (prompt, state) => ({
    frage: prompt,
    gremium: state.gremium,
    antwort: state.antwort,
  }),
};

import type { ModeDefinition } from './types';

export const antragMode: ModeDefinition = {
  id: 'antrag',
  endpoint: '/antraege/generate-simple',
  instructionType: 'antrag',
  componentName: 'antrag-generator',
  defaultMode: 'pro',
  searchQueryFields: ['inhalt', 'gliederung'],
  placeholder: 'Beschreibe den Inhalt deines Antrags oder deiner Anfrage...',
  useMarkdown: true,
  settings: [
    {
      key: 'requestType',
      label: 'Art',
      options: [
        { id: 'antrag', label: 'Antrag' },
        { id: 'kleine_anfrage', label: 'Kleine Anfrage' },
        { id: 'grosse_anfrage', label: 'Große Anfrage' },
      ],
      multiple: false,
    },
  ],
  tagInputs: [
    {
      key: 'gliederung',
      label: 'Gliederung',
      placeholder: 'z.B. Einleitung, Forderungen...',
    },
  ],
  defaults: {
    requestType: 'antrag',
    gliederung: [],
  },
  buildSubmitFields: (_prompt, state) => ({
    requestType: state.requestType,
    gliederung: Array.isArray(state.gliederung)
      ? (state.gliederung as string[]).join('\n')
      : state.gliederung,
  }),
};

import type { ModeDefinition } from './types';

export const textEditorMode: ModeDefinition = {
  id: 'texteditor',
  endpoint: '/claude_text_improver',
  instructionType: 'universal',
  componentName: 'text-improver',
  defaultMode: 'privacy',
  searchQueryFields: ['originalText'],
  placeholder: 'Füge hier den Text ein, den du bearbeiten möchtest...',
  useMarkdown: false,
  promptField: 'originalText',
  settings: [
    {
      key: 'action',
      label: 'Aktion',
      options: [
        { id: 'improve', label: 'Verbessern' },
        { id: 'rewrite', label: 'Umschreiben' },
        { id: 'summarize', label: 'Zusammenfassen' },
        { id: 'spellcheck', label: 'Rechtschreibung' },
        { id: 'formalize', label: 'Formell machen' },
        { id: 'simplify', label: 'Vereinfachen' },
      ],
      multiple: false,
    },
  ],
  defaults: {
    action: 'improve',
  },
  buildSubmitFields: (prompt, state) => ({
    originalText: prompt,
    action: state.action,
  }),
};

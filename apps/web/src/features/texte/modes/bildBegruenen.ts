import type { ModeDefinition } from './types';

export const bildBegruenenMode: ModeDefinition = {
  id: 'bild-begruenen',
  endpoint: '/flux/green-edit/prompt',
  instructionType: 'universal',
  componentName: 'bild-begruenen',
  defaultMode: 'balanced',
  searchQueryFields: ['editPrompt'],
  placeholder:
    'Beschreibe, wie das Bild begrünt werden soll (z.B. Bäume, Radweg, Fußgängerzone)...',
  useCustomSubmit: true,
  useMarkdown: false,
  promptField: 'editPrompt',
  examples: [
    { label: 'Mehr Bäume', text: 'Pflanze viele große Straßenbäume entlang der Fahrbahn' },
    { label: 'Radweg', text: 'Füge einen geschützten Radweg mit grüner Trennung hinzu' },
    { label: 'Fußgängerzone', text: 'Mache daraus eine grüne Fußgängerzone mit Sitzgelegenheiten' },
  ],
};

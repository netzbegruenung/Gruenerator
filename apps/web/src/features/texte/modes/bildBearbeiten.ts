import type { ModeDefinition } from './types';

export const bildBearbeitenMode: ModeDefinition = {
  id: 'bild-bearbeiten',
  endpoint: '/flux/green-edit/prompt',
  instructionType: 'universal',
  componentName: 'bild-bearbeiten',
  defaultMode: 'balanced',
  searchQueryFields: ['editPrompt'],
  placeholder: 'Beschreibe, was am Bild geändert werden soll...',
  useCustomSubmit: true,
  useMarkdown: false,
  promptField: 'editPrompt',
  examples: [
    { label: 'Mehr Grün', text: 'Füge Bäume, Sträucher und Fahrradwege hinzu' },
    { label: 'Plakat-Stil', text: 'Mache das Bild zu einem grünen Wahlplakat mit ' },
    { label: 'Hintergrund', text: 'Tausche den Hintergrund gegen ' },
  ],
};

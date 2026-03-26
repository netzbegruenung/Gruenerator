import type { ModeDefinition } from './types';

export const boardsMode: ModeDefinition = {
  id: 'boards',
  endpoint: '/boards/generate',
  instructionType: 'universal',
  componentName: 'board-creator',
  defaultMode: 'balanced',
  searchQueryFields: ['inhalt'],
  placeholder: 'Beschreibe, was du planen oder organisieren möchtest...',
  useMarkdown: false,
  useCustomSubmit: true,
  examples: [
    { label: 'Wahlkampf', text: 'Plane eine Wahlkampfstrategie für ' },
    { label: 'Veranstaltung', text: 'Organisiere eine Veranstaltung zum Thema ' },
    { label: 'Kampagne', text: 'Erstelle einen Kampagnenplan für ' },
  ],
};

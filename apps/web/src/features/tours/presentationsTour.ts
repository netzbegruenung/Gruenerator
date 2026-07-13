import { openChatThenNext } from './editorTourHelpers';
import { runTour } from './runTour';

const SEL = {
  surface: '[data-tour="presentations-surface"]',
  slides: '[data-tour="presentations-slides"]',
  design: '[data-tour="presentations-design"]',
  present: '[data-tour="presentations-present"]',
  chatToggle: '[data-tour="presentations-chat-toggle"]',
  chat: '[data-tour="presentations-chat"]',
} as const;

export function startPresentationsTour(): void {
  runTour('presentations', [
    {
      element: SEL.surface,
      popover: {
        title: 'Deine Präsentation',
        description:
          'Klick in die Folie und bearbeite Texte direkt. Alles wird automatisch gespeichert und live mit deinem Team geteilt.',
      },
    },
    {
      element: SEL.slides,
      popover: {
        title: 'Folienübersicht',
        description: 'Hier ordnest du Folien per Drag & Drop, duplizierst oder löschst sie.',
        side: 'right',
      },
    },
    {
      element: SEL.design,
      popover: {
        title: 'Gestalten',
        description: 'Layout, Farben und Design der aktuellen Folie anpassen.',
        side: 'bottom',
      },
    },
    {
      element: SEL.present,
      popover: {
        title: 'Präsentieren',
        description:
          'Startet den Vollbild-Modus. PDF- und PowerPoint-Export findest du direkt daneben.',
        side: 'bottom',
      },
    },
    {
      element: SEL.chatToggle,
      popover: {
        title: 'KI-Assistent',
        description: 'Hier öffnest du den Assistenten für diese Präsentation.',
        side: 'bottom',
        onNextClick: openChatThenNext(SEL.chatToggle, SEL.chat),
      },
    },
    {
      element: SEL.chat,
      popover: {
        title: 'Mit der Präsentation arbeiten',
        description:
          'Neue Folien entwerfen, Texte zuspitzen, Struktur umbauen — beschreib einfach, was du brauchst.',
        side: 'left',
      },
    },
  ]);
}

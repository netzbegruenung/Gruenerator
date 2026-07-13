import { openChatThenNext } from './editorTourHelpers';
import { runTour } from './runTour';

const SEL = {
  grid: '[data-tour="sheets-grid"]',
  topbar: '[data-tour="sheets-topbar"]',
  chatToggle: '[data-tour="sheets-chat-toggle"]',
  chat: '[data-tour="sheets-chat"]',
} as const;

export function startSheetsTour(): void {
  runTour('sheets', [
    {
      element: SEL.grid,
      popover: {
        title: 'Deine Tabelle',
        description:
          'Rechnet wie gewohnt: Formeln, Formatierung, mehrere Blätter. Alles wird automatisch gespeichert und live mit deinem Team geteilt.',
      },
    },
    {
      element: SEL.topbar,
      popover: {
        title: 'Alles Wichtige oben',
        description:
          'Titel umbenennen, Rückgängig/Wiederholen und Teilen findest du in der Leiste.',
        side: 'bottom',
      },
    },
    {
      element: SEL.chatToggle,
      popover: {
        title: 'KI-Assistent',
        description: 'Hier öffnest du den Assistenten für diese Tabelle.',
        side: 'bottom',
        onNextClick: openChatThenNext(SEL.chatToggle, SEL.chat),
      },
    },
    {
      element: SEL.chat,
      popover: {
        title: 'Mit der Tabelle arbeiten',
        description:
          'Formeln bauen, Daten auswerten oder umbauen — beschreib einfach, was du brauchst, der Assistent ändert die Tabelle direkt.',
        side: 'left',
      },
    },
  ]);
}

import { openChatThenNext } from './editorTourHelpers';
import { runTour } from './runTour';

const SEL = {
  surface: '[data-tour="docs-surface"]',
  topbar: '[data-tour="docs-topbar"]',
  chatToggle: '[data-tour="docs-chat-toggle"]',
  chat: '[data-tour="docs-chat"]',
} as const;

export function startDocsTour(): void {
  runTour('docs', [
    {
      element: SEL.surface,
      popover: {
        title: 'Dein Dokument',
        description:
          'Schreib einfach los — mit „/" fügst du Überschriften, Listen, Tabellen und mehr ein. Alles wird automatisch gespeichert und live mit deinem Team geteilt.',
      },
    },
    {
      element: SEL.topbar,
      popover: {
        title: 'Alles Wichtige oben',
        description:
          'Titel umbenennen, Rückgängig/Wiederholen — und hinter dem Menü rechts: Teilen, Versionsverlauf und Export (Word, PDF, ODT).',
        side: 'bottom',
      },
    },
    {
      element: SEL.chatToggle,
      popover: {
        title: 'KI-Assistent',
        description: 'Hier öffnest du den Assistenten für dieses Dokument.',
        side: 'bottom',
        onNextClick: openChatThenNext(SEL.chatToggle, SEL.chat),
      },
    },
    {
      element: SEL.chat,
      popover: {
        title: 'Mit dem Dokument arbeiten',
        description:
          'Stell Fragen zum Text oder beschreib eine Änderung („Kürze die Einleitung") — der Assistent bearbeitet das Dokument direkt.',
        side: 'left',
      },
    },
  ]);
}

import { openChatThenNext } from './editorTourHelpers';
import { runTour } from './runTour';

const SEL = {
  stage: '[data-tour="canvas-stage"]',
  tabs: '[data-tour="canvas-tabs"]',
  chatTab: '[data-tour="canvas-tab-chat"]',
  chat: '[data-tour="canvas-chat"]',
  topbar: '[data-tour="canvas-topbar"]',
} as const;

export function startCanvasTour(): void {
  runTour('canvas', [
    {
      element: SEL.stage,
      popover: {
        title: 'Deine Arbeitsfläche',
        description:
          'Klick auf Texte und Elemente, um sie direkt zu bearbeiten, zu verschieben oder zu skalieren.',
      },
    },
    {
      element: SEL.tabs,
      popover: {
        title: 'Werkzeuge links',
        description:
          'Text, Elemente, Hintergrund und Uploads — hier fügst du alles hinzu, was dein Sharepic braucht.',
        side: 'right',
      },
    },
    {
      element: SEL.chatTab,
      popover: {
        title: 'KI-Chat',
        description: 'Hier öffnest du den Assistenten für dieses Sharepic.',
        side: 'right',
        onNextClick: openChatThenNext(SEL.chatTab, SEL.chat),
      },
    },
    {
      element: SEL.chat,
      popover: {
        title: 'Mit dem Sharepic arbeiten',
        description:
          'Beschreib eine Änderung („Mach das Zitat schlagkräftiger") — die KI wendet sie direkt auf dem Canvas an.',
        side: 'right',
      },
    },
    {
      element: SEL.topbar,
      popover: {
        title: 'Titel, Teilen & Download',
        description:
          'Oben benennst du dein Werk, lädst Mitarbeitende ein und exportierst das fertige Bild.',
        side: 'bottom',
      },
    },
  ]);
}

import { runTour } from './runTour';

const SEL = {
  create: '[data-tour="studio-create"]',
  tools: '[data-tour="studio-tools"]',
} as const;

// Short intro for the /studio "Bilder & Videos" landing: the AI composer, then
// the colourful tool strip (Vorlagen / KI-Bilder / Sharepics / Reels).
export function startStudioTour(): void {
  runTour('studio', [
    {
      element: SEL.create,
      popover: {
        title: 'Bilder & Videos',
        description:
          'Beschreibe, was du brauchst — die KI schlägt das passende Sharepic oder Bild vor. Oder wähle unten direkt ein Werkzeug.',
        side: 'bottom',
      },
    },
    {
      element: SEL.tools,
      popover: {
        title: 'Deine Werkzeuge',
        description:
          'KI-Bilder erstellen & bearbeiten, Vorlagen und Sharepics gestalten und Reels untertiteln — alles an einem Ort.',
        side: 'top',
      },
    },
  ]);
}

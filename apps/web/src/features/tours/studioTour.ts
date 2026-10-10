import { getDocsUrl } from '../../utils/docsUrl';

import { runTour } from './runTour';

const SEL = {
  composer: '[data-tour="studio-composer"]',
  mode: '[data-tour="studio-mode"]',
  tools: '[data-tour="studio-tools"]',
} as const;

const SHAREPIC_EXAMPLE =
  'Einladung zum Grünen Stammtisch am Donnerstag, 14.11., 19 Uhr im Café Linde';
const KI_BILD_EXAMPLE = 'Bild von einem Windrad bei Sonnenuntergang, als Banner';

// Walkthrough of the /studio landing: one field, the mode is read from the text. The steps
// for „Sharepic" and „KI-Bild" type an example into the field so the mode label beside it
// can be seen switching. `fillExample` writes into the field; the tour clears it again.
export function startStudioTour(fillExample: (text: string) => void): void {
  runTour(
    'studio',
    [
      {
        element: SEL.composer,
        popover: {
          title: 'Einfach tippen',
          description:
            'Schreib, was du brauchst – ein Thema, einen fertigen Text oder eine Bildidee. Du musst nichts auswählen: Der Grünerator erkennt selbst, was daraus werden soll.',
          side: 'bottom',
        },
      },
      {
        element: SEL.mode,
        popover: {
          title: 'Auto erkennt den Modus',
          description:
            'Standard ist „Auto“. Sobald du tippst, steht hier, was entsteht, zum Beispiel „Auto · Sharepic“. Willst du es anders, wählst du Sharepic oder Bild selbst aus.',
          side: 'top',
        },
      },
      {
        element: SEL.composer,
        onHighlightStarted: () => fillExample(SHAREPIC_EXAMPLE),
        popover: {
          title: 'So entsteht ein Sharepic',
          description:
            'Gib Thema, Anlass oder deinen fertigen Text ein – wie in diesem Beispiel. Eine Form wie „Karussell“, „Zitat“, „Termine“ oder „Große Zahl“ kannst du dazuschreiben. Ohne weiteren Hinweis wird es ein Sharepic. Es öffnet sich in einem neuen Tab: Im Chat siehst du den Entwurf und änderst ihn mit einem Satz, etwa „Mach Slide 3 kürzer“.',
          side: 'bottom',
        },
      },
      {
        element: SEL.composer,
        onHighlightStarted: () => fillExample(KI_BILD_EXAMPLE),
        popover: {
          title: 'So entsteht ein KI-Bild',
          description:
            'Beschreibe das Bild und nenne es „Bild“, „Foto“ oder „Illustration“ – dann wird ein KI-Bild daraus. Stil und Format wählt die KI aus deinem Text: ohne Wunsch ein realistisches Foto im Hochformat, „Aquarell“ oder „Comic“ ergibt eine Illustration, „Banner“ ein breites Bild, „Story“ ein schmales. Im Bild-Editor änderst du es danach mit Anweisungen.',
          side: 'bottom',
        },
      },
      {
        element: SEL.composer,
        onHighlightStarted: () => fillExample(''),
        popover: {
          title: 'Fotos hochladen',
          description:
            'Über das Plus links lädst du eigene Fotos hoch. Bei einem Sharepic nutzt die KI sie als Bildmotiv (bis zu vier). Sonst wird dein Foto bearbeitet: Schreib dazu, was sich ändern soll, zum Beispiel „Mach den Himmel dramatischer“.',
          side: 'bottom',
        },
      },
      {
        element: SEL.tools,
        popover: {
          title: 'Weitere Werkzeuge',
          description: `Hier liegen Reels (Untertitel für Clips) und Voice (Texte vertonen). Darunter findest du deine zuletzt erstellten Sharepics, KI-Bilder und Reels.<br><br><a href="${getDocsUrl()}/docs/guides/einsteigerinnen/sharepics-ki-bilder-studio" target="_blank" rel="noopener noreferrer">Guide: Sharepics und KI-Bilder im Studio erstellen</a>`,
          side: 'top',
        },
      },
    ],
    { onDestroyed: () => fillExample('') }
  );
}

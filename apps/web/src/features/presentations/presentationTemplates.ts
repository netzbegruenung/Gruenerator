import { type Slide } from '@gruenerator/contracts';

/**
 * Starter decks for the "Präsentationen" section of the docs gallery — the
 * presentation analogue of `sheetTemplates` / `boardTemplates`. Each `slides`
 * array is seeded into a fresh presentation's Y.Doc on first open (see
 * `PresentationEditor`'s `seedSlides` path), replacing the blank two-slide deck.
 */
export interface PresentationTemplate {
  id: string;
  name: string;
  description: string;
  defaultTitle: string;
  slides: Slide[];
}

// Slide ids are per-document (scoped to one Y.Doc), so static ids are safe even
// when several presentations are created from the same template.
function slide(id: string, layout: Slide['layout'], title: string, body: string): Slide {
  return { id, layout, title, body, notes: '' };
}

export const presentationTemplates: PresentationTemplate[] = [
  {
    id: 'pres-pitch',
    name: 'Kreisverband-Pitch',
    description: 'Verband kurz vorstellen',
    defaultTitle: 'Kreisverband-Pitch',
    slides: [
      slide('pitch-1', 'title', 'Kreisverband Musterstadt', 'Grüne Politik vor Ort'),
      slide(
        'pitch-2',
        'content',
        'Wer wir sind',
        '- Aktive Mitglieder aus Musterstadt und Umgebung\n- Fraktion im Gemeinderat\n- Offen für alle, die mitgestalten wollen'
      ),
      slide(
        'pitch-3',
        'content',
        'Unsere Schwerpunkte',
        '- Klimaschutz und Energiewende vor Ort\n- Sichere Rad- und Fußwege\n- Bezahlbarer Wohnraum\n- Starke Bürgerbeteiligung'
      ),
      slide(
        'pitch-4',
        'content',
        'Was wir erreicht haben',
        '- Mehr Radwege im Stadtgebiet\n- Kommunaler Hitzeschutzplan angestoßen\n- Förderung für Bürgerenergie-Projekte'
      ),
      slide(
        'pitch-5',
        'content',
        'Mach mit!',
        '- Komm zu unserem offenen Stammtisch\n- Unterstütze eine Arbeitsgruppe\n- Kontakt: info@gruene-musterstadt.example'
      ),
    ],
  },
  {
    id: 'pres-wahlprogramm',
    name: 'Wahlprogramm',
    description: 'Programm in Folien',
    defaultTitle: 'Wahlprogramm',
    slides: [
      slide('wp-1', 'title', 'Wahlprogramm 2026', 'Unsere Ziele für Musterstadt'),
      slide(
        'wp-2',
        'content',
        'Unsere Vision',
        '- Eine klimaneutrale, lebenswerte Stadt bis 2035\n- Gerechte Teilhabe für alle\n- Transparente und offene Kommunalpolitik'
      ),
      slide(
        'wp-3',
        'content',
        'Klima & Energie',
        '- 100 % erneuerbare Energie für kommunale Gebäude\n- Ausbau von Photovoltaik und Nahwärme\n- Mehr Grün und Bäume gegen Hitze'
      ),
      slide(
        'wp-4',
        'content',
        'Soziale Gerechtigkeit',
        '- Bezahlbarer Wohnraum schaffen\n- Gute Kinderbetreuung ausbauen\n- Barrierefreiheit im öffentlichen Raum'
      ),
      slide(
        'wp-5',
        'content',
        'Mobilität & Verkehr',
        '- Sichere Radwege und Tempo 30\n- Günstiger und getakteter ÖPNV\n- Autofreie, attraktive Innenstadt'
      ),
      slide(
        'wp-6',
        'quote',
        'Gemeinsam für Musterstadt',
        'Gestalte die Zukunft deiner Stadt mit uns — jede Stimme zählt.'
      ),
    ],
  },
];

export function getPresentationTemplate(id: string): PresentationTemplate | null {
  return presentationTemplates.find((t) => t.id === id) ?? null;
}

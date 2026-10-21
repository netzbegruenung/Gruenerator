import { type MarketplaceCollection } from '../frontpage.js';

/**
 * „Frauen / Gleichstellung“: the Grünerator-Vorlagen of the theme `frauen`
 * (party content, loaded from the private catalogue at runtime) plus the
 * official Agents and Rezepte for the texts. Written up in docs/CLAUDE-collections.md.
 *
 * Numbers to re-check each year: Destatis (Gender Pay Gap, published every
 * December) and Statistik Austria (published every March).
 */
export const GLEICHSTELLUNG_COLLECTION = {
  id: 'gleichstellung',
  audience: 'all',
  kicker: 'Frauen und Gleichstellung',
  title: 'Gleichstellung sichtbar machen',
  description:
    'Sharepics, Agents und Rezepte für Lohn, Parität, Schutz vor Gewalt, Sorgearbeit und mehr Frauen in der Kommunalpolitik.',
  tone: 'sand',
  cover: {
    file: 'gleichstellung-v2',
    alt: 'Eine Person mit Megafon und Kopftuch vor einer Menge mit erhobenen Fäusten',
    credit: {
      author: 'Colin Lloyd',
      profileUrl: 'https://unsplash.com/@colin-lloyd?utm_source=gruenerator&utm_medium=referral',
      photoUrl:
        'https://unsplash.com/photos/gcfvs__17dw?utm_source=gruenerator&utm_medium=referral',
    },
  },
  pinned: [
    { kind: 'recipe', ref: 'instagram' },
    { kind: 'recipe', ref: 'presse' },
    { kind: 'agent', ref: 'gruenerator-oeffentlichkeitsarbeit' },
    { kind: 'agent', ref: 'gruenerator-rede-schreiber' },
  ],
  fill: [],
  show: 14,
  min: 1,
  listed: false,
  story: [
    {
      type: 'text',
      paragraphs: [
        'Gleichstellung ist kein Thema für einen Tag im Jahr. Sie zeigt sich im Lohnzettel, in der Besetzung von Gemeinderäten, in der Kita-Platzsuche und in der Frage, wer nachts allein nach Hause gehen kann.',
        'Wer vor Ort darüber schreibt, braucht keine große Kampagne, sondern regelmäßig ein klares Bild und einen klaren Satz.',
      ],
    },
    {
      type: 'claim',
      audience: 'de-DE',
      text: 'Frauen verdienen in Deutschland pro Stunde 16 % weniger als Männer.',
      note: 'Unbereinigter Gender Pay Gap 2025: 22,81 Euro gegenüber 27,05 Euro Bruttostundenverdienst.',
      source: {
        label: 'Statistisches Bundesamt, Pressemitteilung vom 16.12.2025',
        url: 'https://www.destatis.de/DE/Presse/Pressemitteilungen/2025/12/PD25_453_621.html',
      },
    },
    {
      type: 'claim',
      audience: 'de-AT',
      text: 'Frauen verdienen in Österreich pro Stunde 17,6 % weniger als Männer.',
      note: 'Gender Pay Gap in der Privatwirtschaft 2024, Bruttostundenverdienste.',
      source: {
        label: 'Statistik Austria, Pressemitteilung vom 03.03.2026',
        url: 'https://www.statistik.at/fileadmin/announcement/2026/03/20260303Genderstatistik2026.pdf',
      },
    },
    { type: 'vorlagen', thema: 'frauen', heading: 'Sharepics zum Anpassen' },
    {
      type: 'quote',
      text: 'Ein Sharepic zum Equal Pay Day hat bei uns mehr Gespräche am Infostand ausgelöst als jede Pressemitteilung.',
      by: 'Kreisrätin aus Niedersachsen, Beispiel',
    },
    {
      type: 'text',
      paragraphs: [
        'Nimm ein Sharepic als Ausgangspunkt, setze deinen Ort und deine Zahl ein und lass dir den Begleittext schreiben. Eine Zahl aus deiner Gemeinde wirkt stärker als jede Landeszahl.',
        'Beim Thema Gewalt gehört immer ein Hilfsangebot in den Beitrag.',
      ],
    },
    {
      type: 'text',
      audience: 'de-DE',
      paragraphs: [
        'Das Hilfetelefon „Gewalt gegen Frauen“ ist rund um die Uhr kostenlos erreichbar: 116\u00a0016.',
      ],
    },
    {
      type: 'text',
      audience: 'de-AT',
      paragraphs: [
        'Die Frauenhelpline gegen Gewalt ist rund um die Uhr kostenlos erreichbar: 0800\u00a0222\u00a0555.',
      ],
    },
    {
      type: 'items',
      display: 'rows',
      items: [
        { kind: 'agent', ref: 'gruenerator-oeffentlichkeitsarbeit' },
        { kind: 'recipe', ref: 'presse' },
        { kind: 'agent', ref: 'gruenerator-rede-schreiber' },
      ],
    },
    {
      type: 'example',
      // Quotes the German gap; in Austria the Rezept stands under „Mehr aus der Kollektion“.
      audience: 'de-DE',
      item: { kind: 'recipe', ref: 'instagram' },
      prompt:
        'Schreib einen Instagram-Post zum Equal Pay Day für unseren Ortsverband, mit der aktuellen Lohnlücke und einem Hinweis auf unsere Anträge im Gemeinderat.',
      answer:
        'Heute ist Equal Pay Day. Frauen verdienen pro Stunde 16 % weniger als Männer. Wir wollen offene Gehälter, auch in unserer Stadtverwaltung. Komm zum Infostand!',
    },
  ],
} as const satisfies MarketplaceCollection;

import { CandidatePage } from '../CandidatePage';

import type { CandidateData } from '../types/candidate';

const demoCandidate: CandidateData = {
  id: 'demo',
  slug: 'maria-mustermann',
  hero: {
    imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=533&fit=crop',
    name: 'Maria Mustermann',
    tagline: 'Kandidatin für den Landtag - Wahlkreis Musterstadt',
    socialLinks: {
      instagram: 'https://instagram.com/gruene',
      twitter: 'https://twitter.com/gruene',
      facebook: 'https://facebook.com/gruene',
    },
  },
  about: {
    title: 'Wer ich bin',
    content: `Ich bin Maria Mustermann, 42 Jahre alt, und kandidiere für Bündnis 90/Die Grünen im Wahlkreis Musterstadt.

Als Lehrerin und Mutter von zwei Kindern weiß ich, wie wichtig gute Bildung und eine lebenswerte Umwelt für unsere Zukunft sind. Seit über 10 Jahren engagiere ich mich kommunalpolitisch und setze mich für nachhaltige Lösungen ein.

Mein Antrieb: Eine Welt hinterlassen, in der auch unsere Enkel noch gut leben können. Dafür kämpfe ich - pragmatisch, engagiert und immer mit einem offenen Ohr für die Menschen vor Ort.`,
  },
  heroImage: {
    imageUrl: 'https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?w=1600&h=900&fit=crop',
    title: 'Gemeinsam für eine nachhaltige Zukunft!',
    subtitle: 'Klimaschutz beginnt vor unserer Haustür. Packen wir es an!',
  },
  themes: {
    title: 'Meine Themen',
    themes: [
      {
        imageUrl:
          'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=600&h=400&fit=crop',
        title: 'Klimaschutz & Energie',
        content:
          'Bis 2035 klimaneutral: Mit Solaroffensive, Windkraftausbau und energetischer Gebäudesanierung schaffen wir die Energiewende vor Ort.',
      },
      {
        imageUrl:
          'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop',
        title: 'Bildung & Chancen',
        content:
          'Beste Bildung für alle: Kleinere Klassen, digitale Ausstattung und Chancengleichheit von der Kita bis zur Berufsausbildung.',
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&h=400&fit=crop',
        title: 'Mobilität der Zukunft',
        content:
          'Bus und Bahn im 15-Minuten-Takt, sichere Radwege und Car-Sharing: Mobilität muss klimafreundlich und bezahlbar sein.',
      },
    ],
  },
  actions: {
    actions: [
      {
        imageUrl:
          'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=400&h=533&fit=crop',
        text: 'Unterstütze uns',
        link: '#spenden',
      },
      {
        imageUrl:
          'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&h=533&fit=crop',
        text: 'Werde Mitglied',
        link: 'https://www.gruene.de/mitglied-werden',
      },
      {
        imageUrl:
          'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=400&h=533&fit=crop',
        text: 'Mach mit!',
        link: '#kontakt',
      },
    ],
  },
  contact: {
    title: 'Sprich mich an!',
    backgroundImageUrl:
      'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1600&h=900&fit=crop',
    email: 'maria.mustermann@gruene-musterstadt.de',
    phone: '+49 123 456789',
    socialMedia: [
      { platform: 'Instagram', url: 'https://instagram.com/gruene' },
      { platform: 'Twitter', url: 'https://twitter.com/gruene' },
    ],
  },
};

export function DemoPage() {
  return <CandidatePage candidate={demoCandidate} />;
}

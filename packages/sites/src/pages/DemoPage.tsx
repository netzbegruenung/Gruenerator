import {
  buildSitePreviewSnapshot,
  richTextDocFromPlainText,
  type SupportedLocale,
} from '@gruenerator/contracts';
import { useMemo } from 'react';

import { candidateToSnapshotSource } from '../preview/candidateToSnapshotSource';
import { SitePreviewFrame } from '../preview/SitePreviewFrame';
import { useAuth } from '../SitesContext';

import type { CandidateData } from '../types/editorDraft';

const demoCandidate: CandidateData = {
  id: 'demo',
  slug: 'maria-mustermann',
  hero: {
    imageUrl: '/api/image-picker/stock-image/2y-kang-dFohf_GUZJ0-unsplash.jpg',
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
    content:
      richTextDocFromPlainText(`Ich bin Maria Mustermann, 42 Jahre alt, und kandidiere für Bündnis 90/Die Grünen im Wahlkreis Musterstadt.

Als Lehrerin und Mutter von zwei Kindern weiß ich, wie wichtig gute Bildung und eine lebenswerte Umwelt für unsere Zukunft sind. Seit über 10 Jahren engagiere ich mich kommunalpolitisch und setze mich für nachhaltige Lösungen ein.

Mein Antrieb: Eine Welt hinterlassen, in der auch unsere Enkel noch gut leben können. Dafür kämpfe ich - pragmatisch, engagiert und immer mit einem offenen Ohr für die Menschen vor Ort.`),
  },
  heroImage: {
    imageUrl: '/api/image-picker/stock-image/absolutvision-WYd_PkCa1BY-unsplash.jpg',
    title: 'Gemeinsam für eine nachhaltige Zukunft!',
    subtitle: 'Klimaschutz beginnt vor unserer Haustür. Packen wir es an!',
  },
  themes: {
    title: 'Meine Themen',
    themes: [
      {
        imageUrl: '/api/image-picker/stock-image/alexander-bagno-wVfoqadZDRo-unsplash.jpg',
        title: 'Klimaschutz & Energie',
        content: richTextDocFromPlainText(
          'Bis 2035 klimaneutral: Mit Solaroffensive, Windkraftausbau und energetischer Gebäudesanierung schaffen wir die Energiewende vor Ort.'
        ),
      },
      {
        imageUrl: '/api/image-picker/stock-image/andre-taissin-5OUMf1Mr5pU-unsplash.jpg',
        title: 'Bildung & Chancen',
        content: richTextDocFromPlainText(
          'Beste Bildung für alle: Kleinere Klassen, digitale Ausstattung und Chancengleichheit von der Kita bis zur Berufsausbildung.'
        ),
      },
      {
        imageUrl: '/api/image-picker/stock-image/andrew-slifkin-hl_brnPYihg-unsplash.jpg',
        title: 'Mobilität der Zukunft',
        content: richTextDocFromPlainText(
          'Bus und Bahn im 15-Minuten-Takt, sichere Radwege und Car-Sharing: Mobilität muss klimafreundlich und bezahlbar sein.'
        ),
      },
    ],
  },
  actions: {
    actions: [
      {
        imageUrl: '/api/image-picker/stock-image/antoine-schibler-GimanuXzJBk-unsplash.jpg',
        text: 'Unterstütze uns',
        link: '#spenden',
      },
      {
        imageUrl: '/api/image-picker/stock-image/benjamin-jopen-2SfssudtyIA-unsplash.jpg',
        text: 'Werde Mitglied',
        link: 'https://www.gruene.de/mitglied-werden',
      },
      {
        imageUrl: '/api/image-picker/stock-image/benjamin-jopen-To-B9ICXPnc-unsplash.jpg',
        text: 'Mach mit!',
        link: '#kontakt',
      },
    ],
  },
  contact: {
    title: 'Sprich mich an!',
    backgroundImageUrl: '/api/image-picker/stock-image/christian-lue-DOjfdyt2UCo-unsplash.jpg',
    email: 'maria.mustermann@gruene-musterstadt.de',
    phone: '+49 123 456789',
    socialMedia: [
      { platform: 'Instagram', url: 'https://instagram.com/gruene' },
      { platform: 'Twitter', url: 'https://twitter.com/gruene' },
    ],
  },
};

export function DemoPage() {
  const { user } = useAuth();
  const locale: SupportedLocale = user?.locale ?? 'de-DE';
  const snapshot = useMemo(
    () => buildSitePreviewSnapshot(candidateToSnapshotSource(demoCandidate, null), locale),
    [locale]
  );
  return (
    <div className="h-dvh">
      <SitePreviewFrame
        snapshot={snapshot}
        handle={demoCandidate.slug}
        title="Vorschau der Website"
        className="block h-full w-full border-0"
      />
    </div>
  );
}

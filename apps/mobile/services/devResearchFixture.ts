import {
  type ResearchDocumentPart,
  type ResearchDocumentResponse,
  type ResearchSearchResponse,
} from '@gruenerator/contracts';
import { type fetchResearchFacets } from '@gruenerator/shared/api';

/** The collection the placeholder hits name — the reader serves the
 *  placeholder document for it instead of asking the API. */
export const DEV_FIXTURE_COLLECTION = 'dev-fixture';

const TITLES = [
  'Beschluss: Klimaneutrales Berlin bis 2040',
  'Pressemitteilung: Mehr Busse für die Außenbezirke',
  'Antrag: Mietendeckel neu denken',
  'Rede im Abgeordnetenhaus zur Wärmewende',
  'Positionspapier: Schulbau beschleunigen',
  'Pressemitteilung: Sichere Radwege an Hauptstraßen',
];

/**
 * Made-up hits for the notebook search on the emulator's dev login
 * (`DEV_AUTH_BYPASS`): that user has no session on the production API, so
 * every search fails there and the hit list could not be looked at. A tap
 * opens the reader on {@link devResearchDocument}.
 */
export function devResearchFixture(query: string): ResearchSearchResponse {
  const results = TITLES.map((title, i) => ({
    document_id: `dev-fixture-${i}`,
    title,
    source_url: `${DEV_FIXTURE_COLLECTION}://${i}`,
    relevant_content: `Beispieltreffer für „${query}“: ${title}. Dieser Text ist ein Platzhalter aus der Dev-Umgebung und stammt aus keiner echten Quelle.`,
    similarity_score: 0.9 - i * 0.07,
    chunk_count: 3,
    term_chunk_count: i % 2 === 0 ? 2 : 0,
    top_chunks: [],
    collection_id: DEV_FIXTURE_COLLECTION,
    collection_name: 'Dev-Beispiele',
    published_at: `2026-0${9 - i}-1${i}`,
    content_type_label: i % 2 === 0 ? 'Beschluss' : 'Pressemitteilung',
    source_name: 'Dev-Beispiele',
  }));
  return {
    results,
    metadata: { totalResults: results.length, collections: ['dev-fixture'], timeMs: 0 },
  };
}

/** Splits `text` so every occurrence of `term` is its own marked part. */
function markTerm(text: string, term: string): ResearchDocumentPart[] {
  if (!term) return [{ text, term: false }];
  const pattern = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text
    .split(pattern)
    .filter((piece) => piece.length > 0)
    .map((piece) => ({ text: piece, term: piece.toLowerCase() === term.toLowerCase() }));
}

/**
 * The placeholder document behind a placeholder hit: headings, plain
 * paragraphs and three numbered passages with the search term marked, so the
 * reader's highlighting can be looked at on the dev login.
 */
export function devResearchDocument(sourceUrl: string, query: string): ResearchDocumentResponse {
  const index = Number(sourceUrl.split('://')[1] ?? 0);
  const title = TITLES[index] ?? TITLES[0] ?? 'Beispieldokument';
  const term = query.trim().split(/\s+/)[0] ?? '';
  const para = (text: string) => ({
    kind: 'paragraph' as const,
    segments: [{ passage: null, parts: [{ text, term: false }] }],
  });
  const withPassage = (before: string, passage: number, text: string, after: string) => ({
    kind: 'paragraph' as const,
    segments: [
      { passage: null, parts: [{ text: before, term: false }] },
      { passage, parts: markTerm(text, term) },
      { passage: null, parts: [{ text: after, term: false }] },
    ],
  });
  const heading = (text: string) => ({
    kind: 'heading' as const,
    segments: [{ passage: null, parts: [{ text, term: false }] }],
  });
  const passages = [
    `Berlin soll bis 2040 klimaneutral werden – beim Thema ${term} geht es um Tempo.`,
    `Für ${term} braucht es verlässliche Mittel im Landeshaushalt.`,
    `Die Bezirke setzen ${term}-Maßnahmen vor Ort um.`,
  ];
  return {
    title,
    sourceUrl: null,
    sourceName: 'Dev-Beispiele',
    contentTypeLabel: 'Beschluss',
    publishedAt: '2026-09-10',
    blocks: [
      heading('Ausgangslage'),
      para(
        'Dieses Dokument ist ein Platzhalter aus der Dev-Umgebung. Es stammt aus keiner echten Quelle und dient nur dazu, die Markierungen im Leser anzusehen.'
      ),
      withPassage(
        'Der Landesvorstand hält fest: ',
        0,
        passages[0]!,
        ' Dafür braucht es einen klaren Fahrplan.'
      ),
      heading('Finanzierung'),
      para(
        'Ohne Geld bleibt jeder Plan Papier. Die Fraktion hat deshalb mehrere Vorschläge für den nächsten Doppelhaushalt eingebracht.'
      ),
      withPassage(
        'Konkret heißt das: ',
        1,
        passages[1]!,
        ' Die Mittel sollen über mehrere Jahre gesichert werden.'
      ),
      heading('Umsetzung'),
      withPassage(
        'Zum Schluss: ',
        2,
        passages[2]!,
        ' Ein jährlicher Bericht macht den Fortschritt sichtbar.'
      ),
      para('Weitere Absätze ohne Bezug zur Suche, damit der Leser etwas zum Scrollen hat.'),
    ],
    passages: [
      { index: 0, heading: 'Ausgangslage', text: passages[0]! },
      { index: 1, heading: 'Finanzierung', text: passages[1]! },
      { index: 2, heading: 'Umsetzung', text: passages[2]! },
    ],
  };
}

const facetValues = (...pairs: Array<[string, number]>) =>
  pairs.map(([value, count]) => ({ value, count }));

/**
 * Placeholder facets for the options sheet on the dev login, where the
 * filter vocabulary cannot be loaded either — so the keyword sections and
 * the sheet's scrolling can be looked at.
 */
export const DEV_RESEARCH_FACETS: Awaited<ReturnType<typeof fetchResearchFacets>> = {
  content_type: {
    label: 'Inhaltstyp',
    type: 'keyword',
    values: facetValues(['presse', 120], ['beschluss', 48], ['antrag', 31], ['rede', 12]),
  },
  themes: {
    label: 'Themen',
    type: 'keyword',
    values: facetValues(['klima', 64], ['mobilitaet', 41], ['soziales', 33], ['bildung', 20]),
  },
  persons: {
    label: 'Personen',
    type: 'keyword',
    values: facetValues(['Bettina Jarasch', 22], ['Werner Graf', 17], ['Nina Stahr', 9]),
  },
  published_at: {
    label: 'Veröffentlicht',
    type: 'date_range',
    min: '2019-03-01',
    max: '2026-09-30',
  },
};

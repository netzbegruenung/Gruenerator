import { type ResearchSearchResponse } from '@gruenerator/contracts';

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
 * every search fails there and the hit list could not be looked at. No
 * `source_url`/`collection_id`, so a tap opens the detail sheet, never the
 * reader against a document that does not exist.
 */
export function devResearchFixture(query: string): ResearchSearchResponse {
  const results = TITLES.map((title, i) => ({
    document_id: `dev-fixture-${i}`,
    title,
    source_url: null,
    relevant_content: `Beispieltreffer für „${query}“: ${title}. Dieser Text ist ein Platzhalter aus der Dev-Umgebung und stammt aus keiner echten Quelle.`,
    similarity_score: 0.9 - i * 0.07,
    chunk_count: 3,
    term_chunk_count: i % 2 === 0 ? 2 : 0,
    top_chunks: [],
    collection_id: null,
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

/**
 * A research hit shows how relevant it is, in both views — the same percentage
 * the mobile card shows, from the same shared formatter.
 */
import { describe, expect, it } from 'vitest';

import { axe, renderWithProviders, screen } from '../../../test-utils';

import { ResearchHitCard, type ResearchView } from './ResearchHitCard';
import { type ResearchResult } from './useResearch';

const hit = (over: Partial<ResearchResult> = {}): ResearchResult => ({
  document_id: 'lv_1',
  title: 'Senat verschläft Hitzeschutz',
  source_url: 'https://gruene.berlin/presse/hitzeschutz',
  relevant_content: 'Der Senat hat keinen Hitzeschutzplan.',
  similarity_score: 0.339,
  chunk_count: 2,
  top_chunks: [],
  collection_id: 'berlin-system',
  collection_name: 'Grüne Berlin',
  ...over,
});

describe('ResearchHitCard — relevance', () => {
  it.each<ResearchView>(['grid', 'list'])(
    'shows the score as a percentage in the %s view',
    async (view) => {
      const { container } = renderWithProviders(<ResearchHitCard result={hit()} view={view} />);

      expect(screen.getByText('34 %', { exact: false })).toHaveTextContent('Relevanz 34 %');
      expect(await axe(container)).toHaveNoViolations();
    }
  );

  it('caps a fused score above one at 100 %', () => {
    renderWithProviders(<ResearchHitCard result={hit({ similarity_score: 1.17 })} view="grid" />);

    expect(screen.getByText('100 %', { exact: false })).toHaveTextContent('Relevanz 100 %');
  });
});

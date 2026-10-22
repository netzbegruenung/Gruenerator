/**
 * A research hit shows how relevant it is, in both views — the same percentage
 * the mobile card shows, from the same shared formatter.
 */
import { describe, expect, it } from 'vitest';

import { axe, renderWithProviders, screen, waitFor } from '../../../test-utils';

import { ResearchHitCard, snippetMarkdown, type ResearchView } from './ResearchHitCard';
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
  it.each<ResearchView>(['grid', 'wide', 'list'])(
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

describe('ResearchHitCard — snippet', () => {
  /** react-markdown loads lazily; until then the fallback shows plain text. */
  async function renderSnippet(relevant_content: string) {
    const { container } = renderWithProviders(
      <ResearchHitCard result={hit({ relevant_content })} view="wide" />
    );
    await waitFor(() => expect(container.querySelector('mark')).not.toBeNull());
    return container;
  }

  it('renders stored markup as text, keeping only the highlights', async () => {
    const container = await renderSnippet(
      'Der Senat hat keinen <mark>Hitzeschutz</mark>plan. <iframe srcdoc="<p>x</p>"></iframe> ' +
        '<img src="x" onerror="void 0"> <form><input name="q"></form>'
    );

    expect(container.querySelector('iframe, img, form, input')).toBeNull();
    expect(container.querySelector('mark')).toHaveTextContent('Hitzeschutz');
    expect(container).toHaveTextContent('<iframe srcdoc="<p>x</p>"></iframe>');
  });

  it('shows the escaped server snippet as the stored text', async () => {
    const container = await renderSnippet(
      'Senat &amp; Bezirke: &lt;b&gt;kein&lt;/b&gt; <mark>Hitze</mark>schutzplan'
    );

    expect(container.querySelector('b')).toBeNull();
    expect(container).toHaveTextContent('Senat & Bezirke: <b>kein</b> Hitzeschutzplan');
    expect(container.querySelector('mark')).toHaveTextContent('Hitze');
  });

  it('keeps highlights inside headings and list items', async () => {
    const container = await renderSnippet(
      '## <mark>Hitze</mark>schutz\n\n- Plan für <mark>Hitze</mark>tage'
    );

    expect(container.querySelectorAll('mark')).toHaveLength(2);
    expect(container.querySelector('h2, ul, li')).toBeNull();
  });
});

describe('snippetMarkdown', () => {
  it('drops bold markers the highlight split apart', () => {
    expect(snippetMarkdown('längere **<mark>Hitze</mark>**perioden')).toBe(
      'längere <mark>Hitze</mark>perioden'
    );
  });

  it('escapes gender stars so two of them are not one italic span', () => {
    expect(snippetMarkdown('Arbeitnehmer*innen und Patient*innen')).toBe(
      'Arbeitnehmer\\*innen und Patient\\*innen'
    );
  });

  it('escapes gender stars next to a highlighted word', () => {
    expect(snippetMarkdown('<mark>Patient</mark>*innen und Bürger*<mark>innen</mark>')).toBe(
      '<mark>Patient</mark>\\*innen und Bürger\\*<mark>innen</mark>'
    );
  });

  it('leaves list stars and standalone stars alone', () => {
    expect(snippetMarkdown('* Punkt 5 * 3')).toBe('* Punkt 5 * 3');
  });
});

/**
 * A hit opened from the research list: it reads in the notebook instead of a
 * new tab, marks the passages the server found, steps through them, and closes
 * back onto the list. The document comes from MSW.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { axe, renderWithProviders, screen, waitFor } from '../../../test-utils';

import { ResearchResultsList } from './ResearchResultsList';
import { type ResearchResult } from './useResearch';

import type { ResearchDocumentResponse } from '@gruenerator/contracts';

const DOCUMENT = 'http://localhost/api/research/document';

const hit = (over: Partial<ResearchResult> = {}): ResearchResult => ({
  document_id: 'lv_1',
  title: 'Hitzeschutz für alle',
  source_url: 'https://gruene.berlin/beschluesse/hitze',
  relevant_content: 'Hitzeschutz muss Pflicht werden.',
  similarity_score: 0.8,
  chunk_count: 2,
  top_chunks: [],
  collection_id: 'berlin-system',
  collection_name: 'Grüne Berlin',
  ...over,
});

const doc: ResearchDocumentResponse = {
  title: 'Hitzeschutz für alle Berliner*innen',
  sourceUrl: 'https://gruene.berlin/beschluesse/hitze',
  sourceName: 'Grüne Berlin',
  contentTypeLabel: 'Beschluss',
  publishedAt: '2024-05-12',
  blocks: [
    {
      kind: 'heading',
      segments: [{ passage: null, parts: [{ text: 'Forderungen', term: false }] }],
    },
    {
      kind: 'paragraph',
      segments: [
        {
          passage: 0,
          parts: [
            { text: 'Hitzeschutz', term: true },
            { text: ' muss Pflicht werden. ', term: false },
          ],
        },
        { passage: null, parts: [{ text: 'Dazu gehört ein Plan. ', term: false }] },
        {
          passage: 1,
          parts: [
            { text: 'Es braucht ', term: false },
            { text: 'Hitzeschutz', term: true },
            { text: 'bündnisse.', term: false },
          ],
        },
      ],
    },
  ],
  passages: [
    { index: 0, heading: 'Forderungen', text: 'Hitzeschutz muss Pflicht werden.' },
    { index: 1, heading: 'Forderungen', text: 'Es braucht Hitzeschutzbündnisse.' },
  ],
};

let requested: URLSearchParams[];

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  requested = [];
  server.use(
    http.get(DOCUMENT, ({ request }) => {
      requested.push(new URL(request.url).searchParams);
      return HttpResponse.json(doc);
    })
  );
});

function renderList(results: ResearchResult[], readable = true) {
  return renderWithProviders(
    <ResearchResultsList
      results={results}
      metadata={{ totalResults: results.length, collections: [], timeMs: 1 }}
      isPending={false}
      isError={false}
      emptyHint="Nichts"
      query="Hitzeschutz"
      readable={readable}
    />
  );
}

describe('research document reader', () => {
  it('opens a hit in the reader with its passages marked', async () => {
    const { user } = renderList([hit()]);
    await user.click(screen.getByRole('link', { name: 'Hitzeschutz für alle' }));

    const dialog = await screen.findByRole('dialog', { name: doc.title });
    expect(requested[0].get('collectionId')).toBe('berlin-system');
    expect(requested[0].get('sourceUrl')).toBe(doc.sourceUrl);
    expect(requested[0].get('query')).toBe('Hitzeschutz');

    expect(dialog.querySelectorAll('mark')).toHaveLength(2);
    expect(screen.getByText('2 relevante Stellen')).toBeInTheDocument();
    expect(screen.getAllByText('Stelle 1 von 2').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Im Web öffnen/ })[0]).toHaveAttribute(
      'href',
      doc.sourceUrl
    );
  });

  it('steps through the passages and wraps around', async () => {
    const { user } = renderList([hit()]);
    await user.click(screen.getByRole('link', { name: 'Hitzeschutz für alle' }));
    await screen.findByRole('dialog', { name: doc.title });

    await user.click(screen.getAllByRole('button', { name: 'Nächste Stelle' })[0]);
    expect(screen.getAllByText('Stelle 2 von 2').length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: 'Nächste Stelle' })[0]);
    expect(screen.getAllByText('Stelle 1 von 2').length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: 'Vorherige Stelle' })[0]);
    expect(screen.getAllByText('Stelle 2 von 2').length).toBeGreaterThan(0);
  });

  it('closes back onto the list', async () => {
    const { user } = renderList([hit()]);
    await user.click(screen.getByRole('link', { name: 'Hitzeschutz für alle' }));
    await screen.findByRole('dialog', { name: doc.title });

    await user.click(screen.getByRole('button', { name: 'Ergebnisse' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Hitzeschutz für alle' })).toBeInTheDocument();
  });

  it('shows the hint when no single passage matched', async () => {
    server.use(http.get(DOCUMENT, () => HttpResponse.json({ ...doc, passages: [], blocks: [] })));
    const { user } = renderList([hit()]);
    await user.click(screen.getByRole('link', { name: 'Hitzeschutz für alle' }));

    expect(await screen.findByText(/Keine einzelnen Textstellen markiert/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nächste Stelle' })).not.toBeInTheDocument();
  });

  it('offers the source when the document cannot be loaded', async () => {
    server.use(http.get(DOCUMENT, () => HttpResponse.json({ error: 'x' }, { status: 404 })));
    const { user } = renderList([hit()]);
    await user.click(screen.getByRole('link', { name: 'Hitzeschutz für alle' }));

    expect(
      await screen.findByText('Das Dokument konnte nicht geladen werden.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Im Web öffnen/ })).toHaveAttribute(
      'href',
      doc.sourceUrl
    );
  });

  it('leaves user-notebook hits on their source', async () => {
    const { user } = renderList([hit({ collection_id: 'a1b2c3' })], false);
    await user.click(screen.getByRole('link', { name: 'Hitzeschutz für alle' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requested).toHaveLength(0);
  });

  it('has no axe violations', async () => {
    const { user } = renderList([hit()]);
    await user.click(screen.getByRole('link', { name: 'Hitzeschutz für alle' }));
    const dialog = await screen.findByRole('dialog', { name: doc.title });
    expect(await axe(dialog)).toHaveNoViolations();
  });
});

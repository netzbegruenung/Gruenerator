/* eslint-disable import-x/order -- `@jest/globals` MUST stay the first import
   (see ConfirmActionCard.test.tsx: the hoisted `jest.mock` needs it first). */
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fetchResearchDocument } from '@gruenerator/shared/api';
import { useAuthStore } from '@gruenerator/shared/stores';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import * as WebBrowser from 'expo-web-browser';
import { FlatList, ScrollView } from 'react-native';

import { lightTheme } from '../../theme/colors';

import { ResearchDocumentReader } from './ResearchDocumentReader';

import type { ResearchDocumentResponse } from '@gruenerator/contracts';

jest.mock('@gruenerator/shared/api', () => ({
  fetchResearchDocument: jest.fn(),
  researchDocumentQueryKey: (p: { sourceUrl: string }) => ['research-document', p.sourceUrl],
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockFetch = fetchResearchDocument as jest.MockedFunction<typeof fetchResearchDocument>;

const DOC = {
  title: 'Hitzeschutz für alle',
  sourceUrl: 'https://gruene.berlin/hitze',
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
            { text: ' ist Pflicht. ', term: false },
          ],
        },
        { passage: null, parts: [{ text: 'Dazu ein Plan. ', term: false }] },
        {
          passage: 1,
          parts: [
            { text: 'Hitzeschutz', term: true },
            { text: 'bündnisse.', term: false },
          ],
        },
      ],
    },
  ],
  passages: [
    { index: 0, heading: 'Forderungen', text: 'Hitzeschutz ist Pflicht.' },
    { index: 1, heading: 'Forderungen', text: 'Hitzeschutzbündnisse.' },
  ],
} satisfies ResearchDocumentResponse;

const onClose = jest.fn();

function renderReader() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ResearchDocumentReader
        collectionId="berlin-system"
        sourceUrl={DOC.sourceUrl}
        query="Hitzeschutz"
        title="Hitzeschutz für alle"
        theme={lightTheme}
        onClose={onClose}
      />
    </QueryClientProvider>
  );
}

// react-native's index exposes components as lazy getters: ScrollView and FlatList
// are first required when the loaded document renders, i.e. inside the first test.
// Cold that cost 1.5 s + 0.3 s on an M5 and pushed the test past the 5 s default on
// the CI runner (#4240, run 37639898207). Touching them here pays it outside a test.
beforeAll(() => {
  void ScrollView;
  void FlatList;
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: null });
});

describe('ResearchDocumentReader (mobile)', () => {
  it('loads the document for the hit and lists its passages', async () => {
    mockFetch.mockResolvedValue(DOC);
    renderReader();

    expect(await screen.findByLabelText('Stelle 1: Forderungen')).toBeTruthy();
    expect(screen.getByLabelText('Stelle 2: Forderungen')).toBeTruthy();
    expect(screen.getByLabelText('Stelle 1 von 2')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith({
      collectionId: 'berlin-system',
      sourceUrl: DOC.sourceUrl,
      query: 'Hitzeschutz',
    });
  });

  it('loads a user-notebook document through its notebook', async () => {
    mockFetch.mockResolvedValue({ ...DOC, sourceUrl: null, sourceName: null });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    render(
      <QueryClientProvider client={client}>
        <ResearchDocumentReader
          documentId="doc-uuid"
          notebookId="nb-uuid"
          query="Hitzeschutz"
          title="Hitzeschutz für alle"
          theme={lightTheme}
          onClose={onClose}
        />
      </QueryClientProvider>
    );

    expect(await screen.findByLabelText('Stelle 1: Forderungen')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith({
      documentId: 'doc-uuid',
      notebookId: 'nb-uuid',
      query: 'Hitzeschutz',
    });
  });

  it('steps through the passages and wraps around', async () => {
    mockFetch.mockResolvedValue(DOC);
    renderReader();
    await screen.findByLabelText('Stelle 1 von 2');

    fireEvent.press(screen.getByLabelText('Nächste Stelle'));
    expect(screen.getByLabelText('Stelle 2 von 2')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Nächste Stelle'));
    expect(screen.getByLabelText('Stelle 1 von 2')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Vorherige Stelle'));
    expect(screen.getByLabelText('Stelle 2 von 2')).toBeTruthy();
  });

  it('shows the hint and no stepping when nothing single matched', async () => {
    mockFetch.mockResolvedValue({ ...DOC, passages: [], blocks: [] });
    renderReader();

    expect(await screen.findByText(/Keine einzelnen Textstellen markiert/)).toBeTruthy();
    expect(screen.queryByLabelText('Nächste Stelle')).toBeNull();
  });

  it('offers the source in the browser when loading fails', async () => {
    mockFetch.mockRejectedValue(new Error('404'));
    renderReader();

    fireEvent.press(await screen.findByText('Im Web öffnen'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(DOC.sourceUrl);
  });

  it('goes back to the results', async () => {
    mockFetch.mockResolvedValue(DOC);
    renderReader();
    fireEvent.press(screen.getByLabelText('Zurück zu den Ergebnissen'));
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    [false, 1],
    [true, 0],
  ])('reduce transparency %s draws the stepper on %i see-through surface', async (reduce, n) => {
    useAuthStore.setState({ user: { reduce_transparency: reduce } as never });
    mockFetch.mockResolvedValue(DOC);
    renderReader();
    await screen.findByLabelText('Stelle 1 von 2');

    const seeThrough = [
      ...screen.UNSAFE_queryAllByType(BlurView),
      ...screen.UNSAFE_queryAllByType(GlassView),
    ];
    expect(seeThrough).toHaveLength(n);
  });
});

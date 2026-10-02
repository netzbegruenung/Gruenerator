import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { useNotebookOverview } from '../../hooks/notebook/useNotebookOverview';
import { useNotebookFilterStore } from '../../stores/notebookFilterStore';
import { lightTheme } from '../../theme/colors';

import { NotebookOverview } from './NotebookOverview';

import type { NotebookOverviewResponse } from '@gruenerator/contracts';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../hooks/notebook/useNotebookOverview', () => ({ useNotebookOverview: jest.fn() }));
// Reanimated does not load under jest-expo; the loading shimmer is not under test.
jest.mock('../common/Skeleton', () => ({ SkeletonBar: () => null, SkeletonGroup: () => null }));
// Both have their own data sources; only whether they are mounted matters here.
jest.mock('./NotebookAgentsSection', () => ({ NotebookAgentsSection: () => null }));
const mockLastAdded = jest.fn((_props: { collectionIds: string[] }) => null);
jest.mock('./LastAddedSection', () => ({
  LastAddedSection: (props: { collectionIds: string[] }) => mockLastAdded(props),
}));

const mockOverview = useNotebookOverview as unknown as jest.Mock<(id: string | null) => unknown>;

function overview(patch: Partial<NotebookOverviewResponse> = {}): NotebookOverviewResponse {
  return {
    collectionId: 'hamburg-system',
    computedAt: '2026-09-30T10:00:00.000Z',
    totals: {
      documents: 1548,
      undated: 326,
      last30Days: 26,
      previous30Days: 13,
      firstPublished: '2021-09-28',
      lastPublished: '2026-09-25',
    },
    monthly: [
      { month: '2026-08', count: 16, topTopic: 'klima' },
      { month: '2026-09', count: 23, topTopic: 'digital' },
    ],
    topics: [
      { topic: 'klima', count: 167, share: 0.14, trend: 'flat', baselineShare: 0.2 },
      { topic: 'sicherheit', count: 98, share: 0.08, trend: 'up', baselineShare: 0.07 },
    ],
    persons: [{ person: 'Katharina Fegebank', count: 337, recentCount: 28 }],
    contentTypes: [
      { value: 'presse', label: 'Pressemitteilung', count: 1047 },
      { value: 'beschluss', label: 'Beschluss/Resolution', count: 223 },
    ],
    sources: [],
    recent: [
      {
        id: '1',
        collectionId: 'hamburg-system',
        collectionName: 'Grüne Hamburg',
        title: 'Mehr Busse für Hamburg',
        snippet: null,
        url: 'https://gruene-hamburg.de/busse',
        publishedAt: '2026-09-29T10:00:00.000Z',
        sourceLabel: 'Grüne Hamburg Presse',
        contentTypeLabel: 'Pressemitteilung',
        themes: ['mobilitaet'],
      },
    ],
    instagram: [],
    terms: {
      documents: 1200,
      words: [
        { word: 'klimaschutz', count: 300 },
        { word: 'radverkehr', count: 120 },
      ],
      rising: [{ word: 'hitzeschutz', count: 40, recentCount: 12 }],
      signature: null,
    },
    ...patch,
  };
}

const loaded = (data: NotebookOverviewResponse) => ({
  data,
  isPending: false,
  isError: false,
  refetch: jest.fn(),
});

beforeEach(() => {
  mockPush.mockClear();
  mockOverview.mockReset();
  mockLastAdded.mockClear();
  useNotebookFilterStore.setState({ notebookId: null, keywordFilters: {}, collectionIds: null });
});

describe('NotebookOverview', () => {
  it('shows web’s sections for a single-collection notebook', () => {
    mockOverview.mockReturnValue(loaded(overview()));
    render(<NotebookOverview notebookId="hamburg-notebook" kind="system" theme={lightTheme} />);

    expect(mockOverview).toHaveBeenCalledWith('hamburg-system');
    for (const title of [
      'Aktivität',
      'Themenprofil',
      'Köpfe',
      'Zuletzt veröffentlicht',
      'Formate',
      'Begriffe',
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText('+13 gegenüber den 30 Tagen davor')).toBeTruthy();
    expect(screen.getByText('Häufigste Schlagwörter aus 1.200 von 1.548 Dokumenten')).toBeTruthy();
    expect(screen.queryByText('Neu auf Instagram')).toBeNull();
    expect(mockLastAdded).not.toHaveBeenCalled();
  });

  it('a topic sets exactly that theme filter and opens the notebook chat', () => {
    mockOverview.mockReturnValue(loaded(overview()));
    useNotebookFilterStore.setState({
      notebookId: 'hamburg-notebook',
      keywordFilters: { content_type: ['presse'], themes: ['bildung'] },
      collectionIds: null,
    });
    render(<NotebookOverview notebookId="hamburg-notebook" kind="system" theme={lightTheme} />);

    fireEvent.press(
      screen.getByLabelText(
        'Sicherheit: 8 %, im Aufwind, Durchschnitt aller Landesverbände 7 %. Im Chat nach diesem Thema filtern'
      )
    );

    expect(useNotebookFilterStore.getState()).toMatchObject({
      notebookId: 'hamburg-notebook',
      keywordFilters: { themes: ['sicherheit'] },
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/notebook/[id]/chat',
      params: { id: 'hamburg-notebook' },
    });
  });

  it('says so when the notebook has no documents', () => {
    mockOverview.mockReturnValue(
      loaded(overview({ totals: { ...overview().totals, documents: 0 } }))
    );
    render(<NotebookOverview notebookId="hamburg-notebook" kind="system" theme={lightTheme} />);

    expect(screen.getByText('Für dieses Notebook liegen noch keine Dokumente vor.')).toBeTruthy();
    expect(screen.queryByText('Themenprofil')).toBeNull();
  });

  it('offers a retry when the overview fails', () => {
    const refetch = jest.fn();
    mockOverview.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch });
    render(<NotebookOverview notebookId="hamburg-notebook" kind="system" theme={lightTheme} />);

    fireEvent.press(screen.getByText('Erneut versuchen'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the recent documents for a multi-collection notebook, which has no overview', () => {
    render(<NotebookOverview notebookId="gruenerator-notebook" kind="system" theme={lightTheme} />);

    expect(mockOverview).not.toHaveBeenCalled();
    expect(mockLastAdded).toHaveBeenCalledWith({
      collectionIds: expect.arrayContaining(['grundsatz-system', 'gruene-de-system']),
      theme: lightTheme,
    });
  });
});

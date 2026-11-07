import { type MonitorSnapshot } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { View as MockView } from 'react-native';

import { type BriefingNews } from '../../hooks/monitor/useBriefingNews';

import { BriefingView, type BriefingViewProps } from './BriefingView';

// The worklets runtime does not load under jest (see NoticeToast.test.tsx); the layout
// animations are not what these tests are about.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: MockView },
  LinearTransition: undefined,
  FadeIn: { duration: () => undefined },
  FadeOut: { duration: () => undefined },
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));

// `karte` comes from the route; each test sets it.
let mockKarte: string | undefined;
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ karte: mockKarte }),
  useIsFocused: () => true,
}));

const snapshot: MonitorSnapshot = {
  id: 's1',
  createdAt: '2026-11-07T08:05:00Z',
  topics: [],
  keywords: [{ keyword: 'Haushalt', count: 12, topic: null }],
  socialTrends: [{ rank: 1, name: '#Haushalt', url: 'https://example.org/t' }],
  totalArticles: 1234,
  sources: ['a', 'b'],
  articlesByLocale: { de: 1000, at: 234 },
};

const list = (title: string) => ({
  items: [
    {
      key: title,
      source: 'Quelle',
      time: 'vor 1 Std.',
      title,
      href: `https://example.org/${title}`,
    },
  ],
  pending: false,
});

const news = (landesverbaende: BriefingNews['landesverbaende']): BriefingNews => ({
  important: list('wichtig'),
  greens: list('gruene'),
  greensArticles: [],
  greensPending: false,
  landesverbaende,
  error: false,
  refetch: () => {},
});

const view = (over: Partial<BriefingViewProps> = {}) => (
  <BriefingView
    locale="de"
    snapshot={snapshot}
    snapshotPending={false}
    news={news(list('lv'))}
    error={false}
    onRetry={() => {}}
    refreshing={false}
    onRefresh={() => {}}
    {...over}
  />
);

const isOpen = (title: string) =>
  (screen.getByLabelText(title).props.accessibilityState as { expanded?: boolean } | undefined)
    ?.expanded === true;
const openCards = () =>
  ['Themen', 'Keywords', 'X-Trends', 'Heute wichtig', 'Über die Grünen', 'Landesverbände'].filter(
    (t) => screen.queryByLabelText(t) && isOpen(t)
  );

beforeEach(() => {
  mockKarte = undefined;
});

describe('BriefingView cards', () => {
  it('opens the card named by karte at start', async () => {
    mockKarte = 'keywords';
    await render(view());
    expect(openCards()).toEqual(['Keywords']);
  });

  it('closes the open card when another one is pressed', async () => {
    mockKarte = 'keywords';
    await render(view());
    await fireEvent.press(screen.getByLabelText('Themen'));
    expect(openCards()).toEqual(['Themen']);
  });

  it('closes a card by pressing it again', async () => {
    mockKarte = 'keywords';
    await render(view());
    await fireEvent.press(screen.getByLabelText('Keywords'));
    expect(openCards()).toEqual([]);
  });

  it('opens none for an unknown karte', async () => {
    mockKarte = 'quatsch';
    await render(view());
    expect(openCards()).toEqual([]);
  });

  it('has no Landesverbände card under at, and karte cannot open it there', async () => {
    mockKarte = 'landesverbaende';
    await render(view({ locale: 'at', news: news(null) }));
    expect(screen.queryByLabelText('Landesverbände')).toBeNull();
    expect(openCards()).toEqual([]);
  });

  it('shows the Landesverbände card under de', async () => {
    await render(view());
    expect(screen.getByLabelText('Landesverbände')).toBeTruthy();
  });

  it('shows the stand line only with a snapshot', async () => {
    const withSnapshot = await render(view());
    expect(screen.getByText(/^Stand \d\d:\d\d · 1\.234 Artikel aus 2 Quellen$/)).toBeTruthy();
    await withSnapshot.unmount();

    await render(view({ snapshot: null }));
    expect(screen.queryByText(/^Stand /)).toBeNull();
    // No snapshot (404) reads as empty cards, not as a crash.
    expect(screen.getByText('Gerade keine Themen.')).toBeTruthy();
  });

  it('says so when a load failed', async () => {
    await render(view({ error: true }));
    expect(screen.getByText('Erneut versuchen')).toBeTruthy();
  });
});

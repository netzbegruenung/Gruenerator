/* eslint-disable import-x/order -- `@jest/globals` must stay the first import so
   babel-plugin-jest-hoist keeps it above the hoisted `jest.mock` factories
   (see components/chat/ConfirmActionCard.test.tsx). */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  type MarketplaceItem,
  type MarketplaceItemOf,
  type MarketplaceSection,
} from '@gruenerator/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useUserProfileStore } from '@gruenerator/chat/stores';
import {
  DEFAULT_MARKETPLACE_FILTERS,
  MARKETPLACE_FEATURES,
  useMarketplaceFrontpage,
  useMarketplaceItem,
  useMarketplaceKind,
  useMarketplaceSections,
} from '@gruenerator/shared/marketplace';
import { composeFrontpage } from '@gruenerator/shared/marketplace/frontpage';
import { secureStorage } from '../../services/storage';

import { MarketplaceScreen } from './MarketplaceScreen';

jest.mock('@gruenerator/shared/marketplace', () => ({
  ...jest.requireActual<Record<string, unknown>>('@gruenerator/shared/marketplace'),
  useMarketplaceSections: jest.fn(),
  useMarketplaceKind: jest.fn(),
  useMarketplaceItem: jest.fn(),
  useMarketplaceFrontpage: jest.fn(),
  useMarketplaceSave: () => ({ mutate: jest.fn() }),
}));
// The short view (with its discussion and sheets) is MarketplaceScreen.test.tsx's.
jest.mock('./MarketplaceItemDetail', () => ({ MarketplaceItemDetail: () => null }));
jest.mock('../../services/storage', () => ({ secureStorage: { getToken: jest.fn() } }));
// Reanimated has no native module under jest; the placeholder is not under test.
jest.mock('../common/Skeleton', () => ({ SkeletonRows: () => null }));

interface SectionsParams {
  kinds: readonly string[];
  sort: string;
  origin: string | null;
  enabled: boolean;
}
const mockSections = useMarketplaceSections as unknown as jest.MockedFunction<
  (params: SectionsParams) => Record<string, unknown>
>;
const mockKind = useMarketplaceKind as unknown as jest.MockedFunction<
  (params: { kind: string; enabled: boolean }) => Record<string, unknown>
>;
const mockItem = useMarketplaceItem as unknown as jest.MockedFunction<
  (target: unknown, options: { platform?: string; enabled?: boolean }) => Record<string, unknown>
>;
const mockFrontpage = useMarketplaceFrontpage as unknown as jest.MockedFunction<
  (options: { platform?: string }) => Record<string, unknown>
>;
const mockGetToken = secureStorage.getToken as jest.MockedFunction<typeof secureStorage.getToken>;

function agent(ref: string, over: Partial<MarketplaceItemOf<'agent'>> = {}) {
  return {
    key: `agent:${ref}`,
    ref,
    kind: 'agent',
    origin: 'offiziell',
    title: `Agent ${ref}`,
    description: 'Hilft beim Schreiben.',
    thumbnailUrl: null,
    iconKey: null,
    authorName: null,
    audience: 'all',
    likesCount: 0,
    liked: false,
    saved: false,
    isOwn: false,
    reportKind: null,
    createdAt: '2026-10-01T00:00:00Z',
    agent: { identifier: ref, slug: ref, isUserAgent: false },
    ...over,
  } satisfies MarketplaceItemOf<'agent'>;
}

const leichteSprache = agent('gruenerator-leichte-sprache', { title: 'Leichte Sprache' });

interface Shelves {
  neu?: MarketplaceItem[];
  beliebt?: MarketplaceItem[];
  landesverband?: MarketplaceItem[];
}

function setup(shelves: Shelves, featured: MarketplaceItem | null = leichteSprache) {
  const answer = (items: MarketplaceItem[] = []): MarketplaceSection[] => [
    { kind: 'agent', items, hasMore: false },
  ];
  mockSections.mockImplementation((params) => {
    if (!params.enabled) return { sections: [], isLoading: false, isError: false };
    const items =
      params.origin === 'landesverband'
        ? shelves.landesverband
        : params.sort === 'neu'
          ? shelves.neu
          : params.sort === 'beliebt'
            ? shelves.beliebt
            : [];
    return { sections: answer(items), isLoading: false, isError: false };
  });
  mockKind.mockReturnValue({
    items: [],
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
  });
  // The server composes the page with shared's rules; the test does the same.
  mockFrontpage.mockReturnValue({
    data: composeFrontpage({
      sections: {
        landesverband: answer(shelves.landesverband),
        neu: answer(shelves.neu),
        beliebt: answer(shelves.beliebt),
        gestalten: [],
      },
      curated: featured ? { feature: MARKETPLACE_FEATURES[0], item: featured } : null,
    }),
    isPending: false,
    isError: false,
  });
  mockItem.mockImplementation((target) =>
    target && typeof target === 'object' && 'pitch' in target
      ? { data: featured ?? undefined, isPending: false, isError: featured === null }
      : { data: undefined, isPending: false, isError: false }
  );
}

async function renderStart() {
  render(<MarketplaceScreen initialFilters={DEFAULT_MARKETPLACE_FILTERS} />);
  await act(async () => {});
}

beforeEach(() => {
  mockGetToken.mockResolvedValue('tok');
  useUserProfileStore.setState({ roles: [], locale: 'de-DE', isHydrated: true });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('MarketplaceFrontpage', () => {
  it('opens on „Start" with the featured slot, its example and a chat button', async () => {
    setup({ neu: [agent('neu1')] });
    await renderStart();

    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Leichte Sprache' })).toBeTruthy();
    expect(screen.getByText(/Übersetzt Beschlüsse/)).toBeTruthy();
    // The example is decoration for screen readers, as on the web (aria-hidden).
    expect(screen.getByText(/Rad-Weg/, { includeHiddenElements: true })).toBeTruthy();
    // One request for the whole page, asking for what the app can open.
    expect(mockFrontpage).toHaveBeenCalledWith({ platform: 'mobile' });

    fireEvent.press(screen.getByText('Im Chat ausprobieren'));
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ agentId: 'gruenerator-leichte-sprache' }),
      })
    );
    expect(screen.getByText('Zu meinen Grüneratoren')).toBeTruthy();
  });

  it('hides a shelf below its minimum', async () => {
    // „Beliebt" needs five liked items; four is no list yet.
    const liked = [1, 2, 3, 4].map((n) => agent(`b${n}`, { likesCount: n }));
    setup({ neu: [agent('neu1')], beliebt: liked });
    await renderStart();

    expect(screen.getByRole('header', { name: 'Neu im Marktplatz' })).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Beliebt' })).toBeNull();
    expect(screen.queryByRole('header', { name: 'Zum Gestalten' })).toBeNull();
    // The browse grid and the call to share always stand.
    expect(screen.getByRole('header', { name: 'Nach Art stöbern' })).toBeTruthy();
    expect(screen.getByText('Rezept erstellen')).toBeTruthy();
  });

  it('shows five liked items as „Beliebt"', async () => {
    const liked = [1, 2, 3, 4, 5].map((n) => agent(`b${n}`, { likesCount: n }));
    setup({ beliebt: liked });
    await renderStart();
    expect(screen.getByRole('header', { name: 'Beliebt' })).toBeTruthy();
  });

  it('shows the Landesverband shelf only with a Landesverband', async () => {
    const lv = [
      agent('lv1', { origin: 'landesverband' }),
      agent('lv2', { origin: 'landesverband' }),
    ];
    setup({ landesverband: lv });
    await renderStart();
    // The server sends the shelf; without a Landesverband of their own the app has no label for it.
    expect(screen.queryByRole('header', { name: /Aus deinem Landesverband/ })).toBeNull();
  });

  it('shows the Landesverband shelf for a member of one', async () => {
    useUserProfileStore.setState({
      roles: [
        { ebene: 'land', rolle: 'Mitarbeiter*in Landesgeschäftsstelle', bundesland: 'Hessen' },
      ] as never,
      locale: 'de-DE',
      isHydrated: true,
    });
    const lv = [
      agent('lv1', { origin: 'landesverband' }),
      agent('lv2', { origin: 'landesverband' }),
    ];
    setup({ landesverband: lv });
    await renderStart();
    expect(screen.getByRole('header', { name: /Aus deinem Landesverband/ })).toBeTruthy();
  });

  it('a filter leaves the front page for the list', async () => {
    setup({ neu: [agent('neu1')] });
    await renderStart();
    fireEvent.press(screen.getByRole('button', { name: 'Alle anzeigen: Neu im Marktplatz' }));
    expect(screen.queryByRole('header', { name: 'Leichte Sprache' })).toBeNull();
    expect(mockSections).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'neu', enabled: true })
    );
  });
});

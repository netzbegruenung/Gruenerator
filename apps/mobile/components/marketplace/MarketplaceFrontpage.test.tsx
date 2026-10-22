/* eslint-disable import-x/order -- `@jest/globals` must stay the first import so
   babel-plugin-jest-hoist keeps it above the hoisted `jest.mock` factories
   (see components/chat/ConfirmActionCard.test.tsx). */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  type MarketplaceFrontpageCollection,
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
  collections?: MarketplaceFrontpageCollection[];
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
      collections: shelves.collections ?? [],
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

async function renderStart(filters: Partial<typeof DEFAULT_MARKETPLACE_FILTERS> = {}) {
  render(<MarketplaceScreen initialFilters={{ ...DEFAULT_MARKETPLACE_FILTERS, ...filters }} />);
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

    // As on the web, the front page's ways in are its shelves: no kind tabs, origins or sort.
    expect(screen.queryByRole('button', { name: 'Agents' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Offiziell' })).toBeNull();
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
    // The categories always stand.
    expect(screen.getByRole('header', { name: 'Kategorien' })).toBeTruthy();
  });

  it('lists the collections and themes, each opening its own page', async () => {
    setup({
      collections: [
        { collectionId: 'starter', items: [agent('a1'), agent('a2')] },
        { collectionId: 'queer', items: [] },
        // Unlisted: reachable by its link only.
        { collectionId: 'wahlkampf-moritz', items: [] },
      ],
    });
    await renderStart();

    expect(screen.getByRole('header', { name: 'Kollektionen' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Themen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Wahlkampf für Moritz' })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Queer und sichtbar' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(focused)/marktplatz',
      params: { kollektion: 'queer' },
    });
  });

  it('opens a category from its photo tile', async () => {
    setup({});
    await renderStart();
    fireEvent.press(screen.getByRole('button', { name: /^Zum Gestalten, Vorlagen/ }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(focused)/marktplatz',
      params: { kategorie: 'vorlagen' },
    });
  });

  it('marks the own Landesverband in the row and opens its page', async () => {
    useUserProfileStore.setState({
      roles: [
        { ebene: 'land', rolle: 'Mitarbeiter*in Landesgeschäftsstelle', bundesland: 'Hessen' },
      ] as never,
      locale: 'de-DE',
      isHydrated: true,
    });
    setup({});
    await renderStart();

    const own = screen.getByRole('button', { name: /Dein Landesverband/ });
    expect(own.props.accessibilityLabel).toBe('Hessen, Dein Landesverband');
    fireEvent.press(own);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(focused)/marktplatz/landesverband/[slug]',
      params: { slug: expect.stringContaining('hessen') },
    });
  });

  it('opens a collection page with its story and „Alle hinzufügen"', async () => {
    setup({ collections: [{ collectionId: 'starter', items: [agent('a1'), agent('a2')] }] });
    await renderStart({ collection: 'starter' });

    expect(screen.getByRole('header', { name: 'Starterpaket' })).toBeTruthy();
    expect(screen.getByText('Alle 2 hinzufügen')).toBeTruthy();
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
    // The filter shows as a chip, and „Zurücksetzen" leads back to the front page.
    expect(screen.getByRole('button', { name: 'Filter entfernen: Neu' })).toBeTruthy();
    fireEvent.press(screen.getByText('Zurücksetzen'));
    expect(screen.getByRole('header', { name: 'Leichte Sprache' })).toBeTruthy();
  });
});

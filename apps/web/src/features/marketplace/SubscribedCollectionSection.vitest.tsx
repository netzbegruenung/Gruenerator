import { type CollectionContents } from '@gruenerator/shared/marketplace/frontpage';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SubscribedCollectionSection } from './SubscribedCollectionSection';

import { axe, renderWithProviders, screen, waitFor } from '@/test-utils';

const store = vi.hoisted(() => {
  let contents: unknown[] = [];
  const listeners = new Set<() => void>();
  return {
    get: () => contents,
    set(next: unknown[]) {
      contents = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    unsubscribe: vi.fn(),
    library: [] as { kind: string; ref: string }[],
  };
});

vi.mock('@gruenerator/shared/marketplace', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSubscribedContents: () => useSyncExternalStore(store.subscribe, store.get),
  useCollectionSubscriptions: () => ({ unsubscribe: store.unsubscribe }),
  useMarketplaceFrontpage: () => ({
    data: {
      collections: [
        {
          collectionId: 'mustergruen-wahlkampf',
          items: [
            { kind: 'agent', ref: 'presse', title: 'Presse-Agent' },
            { kind: 'agent', ref: 'eigen', title: 'Eigener Agent' },
          ],
        },
      ],
    },
  }),
}));
vi.mock('../agentura/hooks/useUserLibrary', () => ({
  useUserLibrary: () => ({ items: store.library }),
}));
vi.mock('../vorlagen/hooks/useSharepicVorlagen', () => ({
  sharepicVorlagenQuery: () => ({ queryKey: ['sv'], queryFn: () => Promise.resolve([]) }),
  printVorlagenQuery: () => ({ queryKey: ['pv'], queryFn: () => Promise.resolve([]) }),
}));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));

const mustergruen = {
  collection: { id: 'mustergruen-wahlkampf', title: 'Mustergrün' },
  stickers: [{ id: 'mg-1', label: 'Mustersticker', src: '/s.png' }],
  frames: [],
  backgrounds: [
    {
      id: 'mg-bg',
      label: 'Musterhintergrund',
      base: { kind: 'color', color: '#fff' },
      overlays: [],
    },
  ],
  agents: [
    { kind: 'agent', ref: 'presse' },
    { kind: 'agent', ref: 'eigen' },
  ],
  sharepicVorlagen: [],
  printVorlagen: [],
} as unknown as CollectionContents;

beforeEach(() => {
  store.set([]);
  store.library = [];
  store.unsubscribe.mockReset();
  toastError.mockClear();
});

describe('SubscribedCollectionSection', () => {
  it('renders nothing without subscriptions', () => {
    const { container } = renderWithProviders(<SubscribedCollectionSection show="assets" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows „Aus Mustergrün“ with stickers and backgrounds for show=assets', () => {
    store.set([mustergruen]);
    renderWithProviders(<SubscribedCollectionSection show="assets" />);
    expect(screen.getByRole('heading', { name: 'Aus Mustergrün' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mustersticker' })).toHaveAttribute(
      'href',
      '/studio/profilbild?sticker=mg-1'
    );
    expect(screen.getByRole('link', { name: 'Musterhintergrund' })).toHaveAttribute(
      'href',
      '/studio/profilbild?hintergrund=mg-bg'
    );
  });

  it('„Kollektion abbestellen“ calls unsubscribe and the section disappears', async () => {
    store.set([mustergruen]);
    store.unsubscribe.mockImplementation(() => {
      store.set([]);
      return Promise.resolve();
    });
    const { user, container } = renderWithProviders(<SubscribedCollectionSection show="assets" />);
    await user.click(screen.getByRole('button', { name: 'Kollektion abbestellen' }));
    expect(store.unsubscribe).toHaveBeenCalledWith('mustergruen-wahlkampf');
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('agents section omits agents already in the user library', () => {
    store.set([mustergruen]);
    store.library = [{ kind: 'agent', ref: 'eigen' }];
    renderWithProviders(<SubscribedCollectionSection show="agents" />);
    expect(screen.getByRole('heading', { name: 'Aus Kollektionen' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Kollektion abbestellen' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Presse-Agent' })).toHaveAttribute(
      'href',
      '/agents/presse'
    );
    expect(screen.queryByRole('link', { name: 'Eigener Agent' })).not.toBeInTheDocument();
  });

  it('„Kollektion abbestellen“ sends one request on double click', async () => {
    store.set([mustergruen]);
    store.unsubscribe.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            store.set([]);
            resolve(undefined);
          }, 30);
        })
    );
    const { user } = renderWithProviders(<SubscribedCollectionSection show="assets" />);
    await user.dblClick(screen.getByRole('button', { name: 'Kollektion abbestellen' }));
    await waitFor(() => expect(screen.queryByRole('heading')).not.toBeInTheDocument());
    expect(store.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('a failed cancel toasts and keeps the section', async () => {
    store.set([mustergruen]);
    store.unsubscribe.mockRejectedValue(new Error('500'));
    const { user } = renderWithProviders(<SubscribedCollectionSection show="assets" />);
    await user.click(screen.getByRole('button', { name: 'Kollektion abbestellen' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Abbestellen fehlgeschlagen.'));
    expect(screen.getByRole('heading', { name: 'Aus Mustergrün' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kollektion abbestellen' })).toBeEnabled();
  });

  it('axe: no violations', async () => {
    store.set([mustergruen]);
    const { container } = renderWithProviders(<SubscribedCollectionSection show="assets" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

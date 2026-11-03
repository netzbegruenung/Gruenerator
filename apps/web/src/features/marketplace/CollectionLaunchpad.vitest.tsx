import { type CollectionContents } from '@gruenerator/shared/marketplace/frontpage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CollectionLaunchpad } from './CollectionLaunchpad';

import { axe, renderWithProviders, screen } from '@/test-utils';

const catalog = vi.hoisted(() => ({
  sharepics: [] as { id: string; titel: string }[],
  prints: [] as { id: string; titel: string }[],
}));

vi.mock('../vorlagen/hooks/useSharepicVorlagen', () => ({
  sharepicVorlagenQuery: () => ({
    queryKey: ['sharepic-vorlagen', null],
    queryFn: () => Promise.resolve(catalog.sharepics),
  }),
  printVorlagenQuery: () => ({
    queryKey: ['print-vorlagen', null],
    queryFn: () => Promise.resolve(catalog.prints),
  }),
}));

const contents = (over: Partial<CollectionContents> = {}): CollectionContents =>
  ({
    collection: { id: 'mustergruen-wahlkampf', title: 'Mustergrün' },
    stickers: [],
    frames: [],
    backgrounds: [],
    agents: [],
    sharepicVorlagen: [],
    printVorlagen: [],
    ...over,
  }) as unknown as CollectionContents;

const frame = { id: 'mg-rahmen', label: 'Rahmen', src: '/rahmen.png' };

beforeEach(() => {
  catalog.sharepics = [];
  catalog.prints = [];
});

describe('CollectionLaunchpad', () => {
  it('renders „Profilbild gestalten“ first with ?rahmen=', async () => {
    catalog.sharepics = [{ id: 'sp-1', titel: 'Wahlkampf-Sharepic' }];
    renderWithProviders(
      <CollectionLaunchpad
        contents={contents({
          frames: [frame] as unknown as CollectionContents['frames'],
          sharepicVorlagen: ['sp-1'],
        })}
      />
    );
    expect(await screen.findByRole('link', { name: 'Wahlkampf-Sharepic' })).toHaveAttribute(
      'href',
      '/studio/vorlage/sp-1'
    );
    expect(screen.getAllByRole('link')[0]).toHaveAccessibleName('Profilbild gestalten');
    expect(screen.getAllByRole('link')[0]).toHaveAttribute(
      'href',
      '/studio/profilbild?rahmen=mg-rahmen'
    );
  });

  it('drops vorlagen tiles whose id is not in the catalog', async () => {
    catalog.sharepics = [{ id: 'da', titel: 'Da' }];
    catalog.prints = [{ id: 'karte', titel: 'Visitenkarte' }];
    renderWithProviders(
      <CollectionLaunchpad
        contents={contents({ sharepicVorlagen: ['da', 'weg'], printVorlagen: ['karte', 'weg2'] })}
      />
    );
    expect(await screen.findByRole('link', { name: 'Da' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Visitenkarte' })).toHaveAttribute(
      'href',
      '/studio/druck/karte'
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('renders nothing when no tile remains', async () => {
    const { container } = renderWithProviders(
      <CollectionLaunchpad contents={contents({ sharepicVorlagen: ['weg'] })} />
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('axe: no violations', async () => {
    const { container } = renderWithProviders(
      <CollectionLaunchpad
        contents={contents({ frames: [frame] as unknown as CollectionContents['frames'] })}
      />
    );
    await screen.findByRole('link', { name: 'Profilbild gestalten' });
    expect(await axe(container)).toHaveNoViolations();
  });
});

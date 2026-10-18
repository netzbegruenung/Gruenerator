/**
 * Der Marktplatz als Popup: auf die Arten der aufrufenden Seite beschränkt,
 * mit einem Link auf dieselbe Ansicht unter `/marktplatz`, und im
 * Auswahlmodus (Profilbild) gibt eine Wahl das Bild zurück und schließt.
 */
import { type MarketplaceItem } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { item, sectionsResponse } from '../../test/marketplaceFixtures';
import { server } from '../../test/msw-server';
import { ProfilbildMarketplaceButton } from '../studio-tools/components/ProfilbildMarketplaceButton';

import { MarketplaceDialog, type MarketplaceDialogProps } from './MarketplaceDialog';

import { axe, renderWithProviders, screen, waitFor, within } from '@/test-utils';

vi.mock('@gruenerator/chat', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUserLandesverbaende: () => ({
    lvIds: null,
    headings: { agents: '', skills: '' },
    shelfLabel: '',
    isHydrated: true,
  }),
}));

const ITEMS: MarketplaceItem[] = [
  item('agent', 'Pressearbeit', { origin: 'offiziell' }),
  item('recipe', 'Fremdes Rezept', { authorName: 'Sam Beispiel' }),
  item('sticker', 'Sonnenblume', { authorName: 'Kim' }),
  item('background', 'Wiese', { authorName: 'Kim' }),
];

let queries: URLSearchParams[] = [];

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  queries = [];
  server.use(
    http.get('http://localhost/api/marketplace', ({ request }) => {
      const params = new URL(request.url).searchParams;
      queries.push(params);
      const kinds = params.get('kinds')?.split(',') ?? [];
      return HttpResponse.json(
        sectionsResponse(
          kinds.map((kind) => ({
            kind: kind as MarketplaceItem['kind'],
            items: ITEMS.filter((i) => i.kind === kind),
            hasMore: false,
          }))
        )
      );
    })
  );
});

function Harness(props: Omit<MarketplaceDialogProps, 'open' | 'onOpenChange'>) {
  const [open, setOpen] = useState(true);
  return <MarketplaceDialog {...props} open={open} onOpenChange={setOpen} />;
}

describe('MarketplaceDialog', () => {
  it('offers only the kinds it was opened for', async () => {
    renderWithProviders(<Harness kinds={['agent', 'recipe']} initialQuery="presse" />);
    const dialog = await screen.findByRole('dialog', { name: 'Marktplatz' });

    expect(await within(dialog).findByRole('region', { name: 'Agents' })).toBeInTheDocument();
    const tabs = within(within(dialog).getByRole('group', { name: 'Art' })).getAllByRole('button');
    expect(tabs.map((t) => t.textContent)).toEqual(['Alle', 'Agents', 'Rezepte']);
    expect(Object.fromEntries(queries[0])).toMatchObject({ kinds: 'agent,recipe', q: 'presse' });
    expect(within(dialog).getByRole('link', { name: 'Im Marktplatz öffnen' })).toHaveAttribute(
      'href',
      '/marktplatz?q=presse'
    );
  });

  it('shows no tabs for a single kind and links to its tab', async () => {
    renderWithProviders(<Harness kinds={['template']} title="Öffentliche Vorlagen" />);
    const dialog = await screen.findByRole('dialog', { name: 'Öffentliche Vorlagen' });

    await waitFor(() => expect(queries[0]?.get('kinds')).toBe('template'));
    expect(within(dialog).queryByRole('group', { name: 'Art' })).toBeNull();
    expect(within(dialog).getByRole('link', { name: 'Im Marktplatz öffnen' })).toHaveAttribute(
      'href',
      '/marktplatz?art=vorlagen'
    );
  });

  it('hands the picked sticker over and closes in picker mode', async () => {
    const onPick = vi.fn();
    const { user } = renderWithProviders(<Harness kinds={['sticker']} onPick={onPick} />);
    const dialog = await screen.findByRole('dialog');

    await user.click(await within(dialog).findByRole('button', { name: 'Sonnenblume' }));

    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'sticker', ref: 'sticker-sonnenblume' })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('has no axe violations', async () => {
    renderWithProviders(<Harness kinds={['agent', 'recipe']} />);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('region', { name: 'Agents' });
    expect(await axe(dialog)).toHaveNoViolations();
  });
});

describe('ProfilbildMarketplaceButton', () => {
  it('opens the Marktplatz for its one kind and returns the pick as a gallery asset', async () => {
    const onPick = vi.fn();
    const { user } = renderWithProviders(
      <ProfilbildMarketplaceButton kind="background" className="" onPick={onPick} />
    );

    await user.click(screen.getByRole('button', { name: 'Hintergründe entdecken' }));
    const dialog = await screen.findByRole('dialog', { name: 'Hintergründe entdecken' });
    await waitFor(() => expect(queries[0]?.get('kinds')).toBe('background'));
    await user.click(await within(dialog).findByRole('button', { name: 'Wiese' }));

    expect(onPick).toHaveBeenCalledWith({
      id: '0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10',
      kind: 'background',
      src: '/api/share/0123456789abcdef0123456789abcdef/download',
      title: 'Wiese',
      width: 512,
      height: 256,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

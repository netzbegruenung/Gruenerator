import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { axe, renderWithProviders } from '../../../test-utils';

import { formatRelativeDate, SpaceChatsSection } from './SpaceChatsSection';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

const thread = (
  id: string,
  title: string,
  updatedAt: string,
  groupId: string | null,
  extra: Record<string, unknown> = {}
) => ({
  id,
  userId: 'u1',
  agentId: 'a',
  title,
  status: 'active',
  threadType: 'chat',
  notebookCollectionId: null,
  groupId,
  tags: [],
  slugSuffix: null,
  createdAt: updatedAt,
  updatedAt,
  ...extra,
});

describe('formatRelativeDate', () => {
  const now = new Date('2026-11-13T12:00:00Z').getTime();
  it('is coarse and German', () => {
    expect(formatRelativeDate('2026-11-13T11:59:30Z', now)).toBe('gerade eben');
    expect(formatRelativeDate('2026-11-13T10:00:00Z', now)).toBe('vor 2 Stunden');
    expect(formatRelativeDate('2026-11-12T10:00:00Z', now)).toBe('gestern');
    expect(formatRelativeDate('nope', now)).toBe('');
  });
});

describe('SpaceChatsSection', () => {
  it('lists only this project’s chats, newest first, as links', async () => {
    server.use(
      http.get('http://localhost/api/chat-service/threads', () =>
        HttpResponse.json([
          thread('t1', 'Älterer Chat', '2026-11-01T10:00:00Z', 'g1'),
          thread('t2', 'Neuer Chat', '2026-11-12T10:00:00Z', 'g1'),
          thread('t3', 'Fremd', '2026-11-12T11:00:00Z', 'other'),
        ])
      )
    );
    const { container, user } = renderWithProviders(<SpaceChatsSection groupId="g1" />);
    // Eingeklappt: erst die Zeile, dann die Liste.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /Bisherige Chats\s*2/ }));
    const links = await screen.findAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining('Neuer Chat'),
      expect.stringContaining('Älterer Chat'),
    ]);
    expect(links[0]).toHaveAttribute('href', '/chat/t2');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows one short line when there are no chats', async () => {
    server.use(http.get('http://localhost/api/chat-service/threads', () => HttpResponse.json([])));
    const { user } = renderWithProviders(<SpaceChatsSection groupId="g1" />);
    await user.click(screen.getByRole('button', { name: /Bisherige Chats/ }));
    expect(await screen.findByText(/Noch keine Chats/)).toBeInTheDocument();
  });

  it('marks team chats with author and „Privat" only on own private chats', async () => {
    server.use(
      http.get('http://localhost/api/chat-service/threads', () =>
        HttpResponse.json([
          thread('t1', 'Förderung klären', '2026-11-12T10:00:00Z', 'g1', {
            teamShared: true,
            accessType: 'group',
            ownerName: 'Anna Beispiel',
          }),
          thread('t2', 'Mein Entwurf', '2026-11-11T10:00:00Z', 'g1', {
            teamShared: false,
            accessType: 'owner',
            ownerName: 'Ich',
          }),
          thread('t3', 'Wärmeplan', '2026-11-10T10:00:00Z', 'g1', {
            teamShared: true,
            accessType: 'owner',
            ownerName: 'Ich',
          }),
        ])
      )
    );
    const { container, user } = renderWithProviders(<SpaceChatsSection groupId="g1" />);
    await user.click(await screen.findByRole('button', { name: /Bisherige Chats\s*3/ }));
    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Team');
    expect(items[0]).toHaveTextContent('Anna Beispiel');
    expect(items[0]).not.toHaveTextContent('Privat');
    expect(items[1]).toHaveTextContent('Privat');
    expect(items[1]).not.toHaveTextContent('Team');
    expect(items[2]).toHaveTextContent('Team');
    expect(await axe(container)).toHaveNoViolations();
  });

  // App-Defaults (App.tsx): 5 min staleTime, 15 min gcTime. Ein Chat, der
  // angelegt wird, während die Liste nicht montiert ist (man ist dafür in
  // /chat), muss beim Zurückkommen da sein — nicht erst nach einem Reload.
  it('shows a chat created while the list was unmounted when it mounts again', async () => {
    let rows = [thread('t1', 'Alter Chat', '2026-11-01T10:00:00Z', 'g1')];
    server.use(
      http.get('http://localhost/api/chat-service/threads', () => HttpResponse.json(rows))
    );
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 5 * 60_000, gcTime: 15 * 60_000, retry: false } },
    });
    const ui = (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SpaceChatsSection groupId="g1" />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const first = render(ui);
    expect(await screen.findByRole('button', { name: /Bisherige Chats\s*1/ })).toBeInTheDocument();
    first.unmount();

    rows = [thread('t2', 'Neu im Projekt', '2026-11-12T10:00:00Z', 'g1'), ...rows];
    render(ui);
    expect(await screen.findByRole('button', { name: /Bisherige Chats\s*2/ })).toBeInTheDocument();
  });

  it('does not claim „no chats" while the list is still loading', async () => {
    server.use(
      http.get('http://localhost/api/chat-service/threads', async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      })
    );
    const { user } = renderWithProviders(<SpaceChatsSection groupId="g1" />);
    const toggle = screen.getByRole('button', { name: /Bisherige Chats/ });
    expect(toggle).not.toHaveTextContent(/\d/);
    await user.click(toggle);
    expect(screen.queryByText(/Noch keine Chats/)).not.toBeInTheDocument();
  });

  it('says the list failed instead of showing it as empty', async () => {
    server.use(
      http.get('http://localhost/api/chat-service/threads', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 })
      )
    );
    const { user } = renderWithProviders(<SpaceChatsSection groupId="g1" />);
    await user.click(screen.getByRole('button', { name: /Bisherige Chats/ }));
    expect(await screen.findByText(/konnten nicht geladen werden/)).toBeInTheDocument();
    expect(screen.queryByText(/Noch keine Chats/)).not.toBeInTheDocument();
  });

  it('shows five chats, then all of them on request', async () => {
    server.use(
      http.get('http://localhost/api/chat-service/threads', () =>
        HttpResponse.json(
          Array.from({ length: 7 }, (_, i) =>
            thread(`t${i}`, `Chat ${i}`, `2026-11-0${i + 1}T10:00:00Z`, 'g1')
          )
        )
      )
    );
    const { user } = renderWithProviders(
      <SpaceChatsSection groupId="g1" aside={<span>DANEBEN</span>} />
    );
    expect(screen.getByText('DANEBEN')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /Bisherige Chats\s*7/ }));
    expect(await screen.findAllByRole('link')).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: 'Alle 7 Chats anzeigen' }));
    expect(screen.getAllByRole('link')).toHaveLength(7);
  });
});

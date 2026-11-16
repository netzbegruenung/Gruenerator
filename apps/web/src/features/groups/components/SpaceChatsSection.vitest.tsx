import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { axe, renderWithProviders } from '../../../test-utils';

import { formatRelativeDate, SpaceChatsSection } from './SpaceChatsSection';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

const thread = (id: string, title: string, updatedAt: string, groupId: string | null) => ({
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
    const { container } = renderWithProviders(<SpaceChatsSection groupId="g1" />);
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
    renderWithProviders(<SpaceChatsSection groupId="g1" />);
    expect(await screen.findByText(/Noch keine Chats/)).toBeInTheDocument();
  });
});

import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import GroupMembersList from './GroupMembersList';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

const member = (id: string, name: string) => ({
  user_id: id,
  role: 'member',
  joined_at: '2026-11-01T10:00:00Z',
  display_name: name,
  first_name: name,
  last_name: null,
  email: null,
  avatar_robot_id: null,
});

describe('GroupMembersList', () => {
  // App-Defaults (App.tsx): 5 min staleTime, 15 min gcTime. Wer per Einladung
  // dazukommt, während die Liste nicht montiert ist, muss beim nächsten Öffnen
  // da sein — nicht erst nach einem Reload.
  it('shows a member who joined while the list was unmounted when it mounts again', async () => {
    let rows = [member('u1', 'Moritz')];
    server.use(
      http.get('http://localhost/api/auth/groups/g1/members', () =>
        HttpResponse.json({ success: true, members: rows })
      )
    );
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 5 * 60_000, gcTime: 15 * 60_000, retry: false } },
    });
    const ui = (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <GroupMembersList groupId="g1" />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const first = render(ui);
    expect(await screen.findByText(/Mitglieder \(1\)/)).toBeInTheDocument();
    first.unmount();

    rows = [...rows, member('u2', 'Aileen')];
    render(ui);
    expect(await screen.findByText(/Mitglieder \(2\)/)).toBeInTheDocument();
  });
});

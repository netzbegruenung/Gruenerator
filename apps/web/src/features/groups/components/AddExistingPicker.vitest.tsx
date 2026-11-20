import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test-utils';

import { AddExistingPicker } from './AddExistingPicker';

const GROUP = 'g1';
const ME = 'user-me';

const doc = (id: string, title: string, updatedAt: string, createdBy = ME) => ({
  id,
  title,
  created_by: createdBy,
  document_subtype: 'docs',
  updated_at: updatedAt,
});

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  server.use(
    http.get('*/api/user-agents', () => HttpResponse.json({ agents: [] })),
    http.get('*/api/text-forms', () => HttpResponse.json({ forms: [] })),
    http.get('*/api/boards', () => HttpResponse.json([])),
    http.get('*/api/documents/user', () => HttpResponse.json({ success: true, data: [] })),
    http.get('*/api/auth/notebook-collections', () =>
      HttpResponse.json({ success: true, collections: [] })
    ),
    http.get('*/api/docs', () =>
      HttpResponse.json([
        doc('d-old', 'Antrag Radweg', '2026-10-03T10:00:00.000Z'),
        doc('d-new', 'Antrag Radweg', '2026-11-19T10:00:00.000Z'),
        doc('d-in', 'Schon drin', '2026-11-18T10:00:00.000Z'),
        doc('d-foreign', 'Von Lena', '2026-11-19T11:00:00.000Z', 'user-lena'),
      ])
    )
  );
});

function setup() {
  const onAdded = vi.fn();
  const utils = renderWithProviders(
    <AddExistingPicker
      groupId={GROUP}
      sharedKeys={new Set(['collaborative_documents:d-in'])}
      currentUserId={ME}
      onAdded={onAdded}
    />
  );
  return { ...utils, onAdded };
}

const option = (name: RegExp) => screen.findByRole('option', { name });

describe('AddExistingPicker', () => {
  it('lists own items newest first, marks what is in the project, hides others’ docs', async () => {
    setup();
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Doc: Antrag Radweg19. Nov.',
      'Doc: Schon drinIm Projekt',
      'Doc: Antrag Radweg3. Okt.',
    ]);
    expect(options[1]).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('option', { name: /Von Lena/ })).not.toBeInTheDocument();
  });

  it('adds the time when two rows share title and day', async () => {
    server.use(
      http.get('*/api/docs', () =>
        HttpResponse.json([
          doc('d-a', 'Gastbeitrag', '2026-11-19T09:00:00.000Z'),
          doc('d-b', 'Gastbeitrag', '2026-11-19T13:30:00.000Z'),
          doc('d-c', 'Anderes', '2026-11-19T12:00:00.000Z'),
        ])
      )
    );
    setup();
    const options = await screen.findAllByRole('option');
    const texts = options.map((o) => o.textContent ?? '');
    expect(texts.filter((t) => t.startsWith('Doc: Gastbeitrag'))).toHaveLength(2);
    for (const t of texts.filter((x) => x.startsWith('Doc: Gastbeitrag')))
      expect(t).toMatch(/19\. Nov\., \d{2}:\d{2}$/);
    expect(texts).toContain('Doc: Anderes19. Nov.');
  });

  it('adds one item with a single click', async () => {
    let body: unknown = null;
    server.use(
      http.post(`*/api/auth/groups/${GROUP}/share`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    const { user, onAdded } = setup();

    await user.click(await option(/3\. Okt/));

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(onAdded.mock.calls[0]?.[0]).toMatchObject([{ id: 'd-old' }]);
    expect(onAdded.mock.calls[0]?.[1]).toBe(true);
    expect(body).toMatchObject({
      contentType: 'collaborative_documents',
      contentId: 'd-old',
      permissions: { read: true, write: false },
    });
  });

  it('shows the server message under the row that failed', async () => {
    server.use(
      http.post(`*/api/auth/groups/${GROUP}/share`, () =>
        HttpResponse.json(
          { success: false, message: 'Du bist nicht Besitzer*in dieses Inhalts.' },
          { status: 403 }
        )
      )
    );
    const { user, onAdded } = setup();

    await user.click(await option(/19\. Nov/));

    expect(await option(/Du bist nicht Besitzer\*in dieses Inhalts\./)).toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('marks several with shift-click and adds them with the button', async () => {
    const shared: string[] = [];
    server.use(
      http.post(`*/api/auth/groups/${GROUP}/share`, async ({ request }) => {
        shared.push(((await request.json()) as { contentId: string }).contentId);
        return HttpResponse.json({ success: true });
      })
    );
    const { user, onAdded } = setup();

    await user.keyboard('{Shift>}');
    await user.click(await option(/19\. Nov/));
    await user.click(await option(/3\. Okt/));
    await user.keyboard('{/Shift}');
    expect(shared).toEqual([]);

    await user.click(screen.getByRole('button', { name: '2 hinzufügen' }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(shared.sort()).toEqual(['d-new', 'd-old']);
    expect(onAdded.mock.calls[0]?.[1]).toBe(true);
  });
});

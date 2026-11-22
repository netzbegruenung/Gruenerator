import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { CanvasShareToProject } from './CanvasShareToProject';

import type { ShareNav } from '@ggraphic/editor/shell';

import { server } from '@/test/msw-server';
import { renderWithProviders } from '@/test-utils';

// 1x1 transparent PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const nav: ShareNav = {
  openPage: vi.fn(),
  back: vi.fn(),
  close: vi.fn(),
  captureImage: vi.fn(() => Promise.resolve(PNG)),
};

const groupsHandler = http.get('http://localhost/api/auth/groups', () =>
  HttpResponse.json({
    groups: [
      { id: 'p1', name: 'Mein Raum', role: 'admin', group_type: 'personal' },
      { id: 'g1', name: 'KV Rhein-Sieg', role: 'admin', group_type: 'standard' },
    ],
  })
);

describe('CanvasShareToProject', () => {
  beforeAll(() => {
    setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
  });

  it('offers every project, whatever its stored type, and posts the captured image as a file', async () => {
    let received: FormData | null = null;
    server.use(
      groupsHandler,
      http.post('http://localhost/api/auth/groups/g1/posts', async ({ request }) => {
        received = await request.formData();
        return HttpResponse.json({ id: 'post1', shareId: 's1' });
      })
    );
    const { user } = renderWithProviders(<CanvasShareToProject nav={nav} />);

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'KV Rhein-Sieg' })).toBeInTheDocument()
    );
    expect(screen.getByRole('option', { name: 'Mein Raum' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Projekt'), 'g1');
    await user.type(screen.getByLabelText('Text zum Beitrag'), 'Hallo');
    await user.click(screen.getByRole('button', { name: 'Posten' }));

    expect(await screen.findByText('Im Projekt gepostet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /KV Rhein-Sieg/ })).toHaveAttribute(
      'href',
      '/projekte/g1'
    );
    const form = received as FormData | null;
    expect(form?.get('body')).toBe('Hallo');
    const file = form?.get('files');
    // A multipart file part, not a string field (jsdom's File is another realm's class).
    expect(typeof file).not.toBe('string');
    expect((file as File).name).toBe('sharepic.png');
    expect((file as File).type).toBe('image/png');
  });

  it('shows the server message when posting fails', async () => {
    server.use(
      groupsHandler,
      http.post('http://localhost/api/auth/groups/g1/posts', () =>
        HttpResponse.json(
          { message: 'In diesem Projekt können nur Admins Beiträge schreiben.' },
          { status: 403 }
        )
      )
    );
    const { user } = renderWithProviders(<CanvasShareToProject nav={nav} />);
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'KV Rhein-Sieg' })).toBeInTheDocument()
    );
    await user.selectOptions(screen.getByLabelText('Projekt'), 'g1');
    await user.click(screen.getByRole('button', { name: 'Posten' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nur Admins');
  });
});

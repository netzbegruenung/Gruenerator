import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../../test/msw-server';
import { axe, renderWithProviders } from '../../../../test-utils';

import { GroupComposer } from './GroupComposer';

const GROUP = 'g1';
const POSTS_URL = `http://localhost/api/auth/groups/${GROUP}/posts`;

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
  URL.createObjectURL ??= () => 'blob:preview';
  URL.revokeObjectURL ??= () => {};
});

const props = {
  groupId: GROUP,
  groupName: 'Testgruppe',
  memberCount: 9,
  currentUserName: 'Moritz Wächter',
  onOpenShare: () => {},
};

describe('GroupComposer', () => {
  it('expands, posts text and files, and collapses again', async () => {
    // jsdom verliert beim FormData-Umweg über MSW den Dateinamen ("blob");
    // gezählt wird deshalb nur, dass die Datei mitgeht.
    let received: { body: FormDataEntryValue | null; files: number } | null = null;
    server.use(
      http.post(POSTS_URL, async ({ request }) => {
        const form = await request.formData();
        received = {
          body: form.get('body'),
          files: form.getAll('files').length,
        };
        return HttpResponse.json({ success: true, postId: 'p', shareId: 's' }, { status: 201 });
      })
    );
    const { user, container } = renderWithProviders(<GroupComposer {...props} />);
    await user.click(screen.getByRole('button', { name: 'Schreib etwas an die Gruppe …' }));
    expect(screen.getByText(/alle 9 Mitglieder sehen den Beitrag/)).toBeInTheDocument();

    const post = screen.getByRole('button', { name: 'Posten' });
    expect(post).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: 'Beitrag an die Gruppe' }), 'Infostand');
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(['%PDF'], 'Plan.pdf', { type: 'application/pdf' }));
    expect(screen.getByText('Plan.pdf')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(post);
    await waitFor(() => expect(received).toEqual({ body: 'Infostand', files: 1 }));
    expect(
      await screen.findByRole('button', { name: 'Schreib etwas an die Gruppe …' })
    ).toBeInTheDocument();
  });

  it('removes an attached file again', async () => {
    const { user, container } = renderWithProviders(<GroupComposer {...props} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(['x'], 'Notiz.txt', { type: 'text/plain' }));
    await user.click(screen.getByRole('button', { name: 'Notiz.txt entfernen' }));
    expect(screen.queryByText('Notiz.txt')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Posten' })).toBeDisabled();
  });

  it('shows the server message when the upload is refused', async () => {
    server.use(
      http.post(POSTS_URL, () =>
        HttpResponse.json(
          { success: false, message: 'Dateityp nicht erlaubt: tool.exe' },
          { status: 400 }
        )
      )
    );
    const { user } = renderWithProviders(<GroupComposer {...props} />);
    await user.click(screen.getByRole('button', { name: 'Schreib etwas an die Gruppe …' }));
    await user.type(screen.getByRole('textbox', { name: 'Beitrag an die Gruppe' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Posten' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dateityp nicht erlaubt: tool.exe');
  });

  it('hands the draft to the share dialog', async () => {
    const onOpenShare = vi.fn();
    const { user } = renderWithProviders(<GroupComposer {...props} onOpenShare={onOpenShare} />);
    await user.click(screen.getByRole('button', { name: 'Schreib etwas an die Gruppe …' }));
    await user.type(screen.getByRole('textbox', { name: 'Beitrag an die Gruppe' }), ' Lest das ');
    await user.click(screen.getByRole('button', { name: 'Aus meinen Inhalten' }));
    expect(onOpenShare).toHaveBeenCalledWith('Lest das');
  });
});

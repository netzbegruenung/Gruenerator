import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../../test/msw-server';
import { axe, renderWithProviders } from '../../../../test-utils';

import { GroupComposer } from './GroupComposer';
import { GroupMentionProvider } from './GroupMentions';

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

describe('GroupComposer mentions', () => {
  const ANNA = '11111111-1111-4111-8111-111111111111';

  it('offers @alle and members, and posts a picked member as a token', async () => {
    let received: FormDataEntryValue | null = null;
    server.use(
      http.post(POSTS_URL, async ({ request }) => {
        received = (await request.formData()).get('body');
        return HttpResponse.json({ success: true, postId: 'p', shareId: 's' }, { status: 201 });
      })
    );
    const { user, container } = renderWithProviders(
      <GroupMentionProvider
        value={{
          candidates: [{ userId: ANNA, label: 'Anna Beispiel' }],
          allowAll: true,
          memberCount: 9,
        }}
      >
        <GroupComposer {...props} />
      </GroupMentionProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Schreib etwas an die Gruppe …' }));
    const box = screen.getByRole('textbox', { name: 'Beitrag an die Gruppe' });

    await user.type(box, 'Hallo @');
    const list = screen.getByRole('listbox', { name: 'Erwähnen' });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '@allebenachrichtigt alle 9 Mitglieder',
      'Anna Beispiel',
    ]);
    expect(box).toHaveAttribute('aria-controls', list.id);
    expect(await axe(container)).toHaveNoViolations();

    await user.type(box, 'an{ArrowDown}{Enter}');
    expect(box).toHaveValue('Hallo @Anna Beispiel ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.type(box, 'und @al{Enter}bitte');
    expect(box).toHaveValue('Hallo @Anna Beispiel und @alle bitte');

    await user.click(screen.getByRole('button', { name: 'Posten' }));
    await waitFor(() =>
      expect(received).toBe(`Hallo @[Anna Beispiel](user:${ANNA}) und @alle bitte`)
    );
  });

  it('counts the stored token against the limit and forgets a deleted pick', async () => {
    let received: FormDataEntryValue | null = null;
    server.use(
      http.post(POSTS_URL, async ({ request }) => {
        received = (await request.formData()).get('body');
        return HttpResponse.json({ success: true, postId: 'p', shareId: 's' }, { status: 201 });
      })
    );
    const { user } = renderWithProviders(
      <GroupMentionProvider
        value={{
          candidates: [{ userId: ANNA, label: 'Anna Beispiel' }],
          allowAll: true,
          memberCount: 9,
        }}
      >
        <GroupComposer {...props} />
      </GroupMentionProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Schreib etwas an die Gruppe …' }));
    const box = screen.getByRole('textbox', { name: 'Beitrag an die Gruppe' });
    const free = Number(box.getAttribute('maxlength'));

    await user.type(box, '@an{ArrowDown}{Enter}');
    const token = `@[Anna Beispiel](user:${ANNA})`;
    expect(Number(box.getAttribute('maxlength'))).toBe(
      free - (token.length - '@Anna Beispiel'.length)
    );

    await user.clear(box);
    await user.type(box, 'Hi @Anna Beispiel');
    await user.click(screen.getByRole('button', { name: 'Posten' }));
    await waitFor(() => expect(received).toBe('Hi @Anna Beispiel'));
  });

  it('hides @alle when the viewer may not use it', async () => {
    const { user } = renderWithProviders(
      <GroupMentionProvider value={{ candidates: [], allowAll: false, memberCount: null }}>
        <GroupComposer {...props} memberCount={null} />
      </GroupMentionProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Schreib etwas an die Gruppe …' }));
    await user.type(screen.getByRole('textbox', { name: 'Beitrag an die Gruppe' }), '@');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../test/msw-server';
import { axe } from '../../test-utils';

import { ReportDialog } from './ReportDialog';

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('@gruenerator/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown> & { toast: object }>();
  return { ...actual, toast: { ...actual.toast, success: toastSuccess } };
});

const ENDPOINT = 'http://localhost/api/content-reports';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  toastSuccess.mockReset();
});

function renderDialog(onOpenChange = vi.fn(), onReported = vi.fn()) {
  render(
    <ReportDialog
      open
      onOpenChange={onOpenChange}
      onReported={onReported}
      kind="studio_asset"
      targetId="a-1"
      title="Herz"
    />
  );
  return onOpenChange;
}

describe('ReportDialog', () => {
  it('sends the chosen reason and note, then confirms and closes', async () => {
    let body: unknown = null;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    const onOpenChange = renderDialog();
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: 'Melden' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Belästigung' }));
    await user.type(screen.getByLabelText('Anmerkung (optional)'), '  zu grob ');
    await user.click(screen.getByRole('button', { name: 'Melden' }));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('Danke, wir schauen uns das an.')
    );
    expect(body).toEqual({
      kind: 'studio_asset',
      targetId: 'a-1',
      reason: 'harassment',
      note: 'zu grob',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('tells the caller once the report went through, and only then', async () => {
    let status = 404;
    server.use(
      http.post(ENDPOINT, () => HttpResponse.json({ success: status === 200 }, { status }))
    );
    const onReported = vi.fn();
    renderDialog(vi.fn(), onReported);
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Rechtswidrig' }));
    await user.click(screen.getByRole('button', { name: 'Melden' }));
    await screen.findByRole('alert');
    expect(onReported).not.toHaveBeenCalled();

    status = 200;
    await user.click(screen.getByRole('button', { name: 'Melden' }));
    await waitFor(() => expect(onReported).toHaveBeenCalledTimes(1));
  });

  it('shows a German message on 404 and stays open', async () => {
    server.use(
      http.post(ENDPOINT, () => HttpResponse.json({ success: false, error: 'x' }, { status: 404 }))
    );
    const onOpenChange = renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole('radio', { name: 'Rechtswidrig' }));
    await user.click(screen.getByRole('button', { name: 'Melden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('nicht mehr verfügbar');
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('focuses the first radio and has no axe violations', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Beleidigend oder hasserfüllt' })).toHaveFocus()
    );
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

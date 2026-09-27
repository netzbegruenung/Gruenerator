import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';

import ScriptAssistant from './ScriptAssistant';

import { axe, fireEvent, renderWithProviders, screen, waitFor } from '@/test-utils';

const ENDPOINT = 'http://localhost/api/voice/speech/script';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

async function open(preset: 'mailbox' | 'vorlesefassung' | 'audiodeskription', onDraft = vi.fn()) {
  const rendered = renderWithProviders(<ScriptAssistant preset={preset} onDraft={onDraft} />);
  await rendered.user.click(screen.getByRole('button', { name: /Text mit KI entwerfen/ }));
  return { ...rendered, onDraft };
}

describe('ScriptAssistant', () => {
  it('asks for the answering-machine fields on the mailbox preset', async () => {
    await open('mailbox');
    expect(screen.getByLabelText('Wen erreicht man?')).toBeInTheDocument();
    expect(screen.queryByLabelText('Geschriebener Text')).not.toBeInTheDocument();
  });

  it('asks for the written original on the Vorlesefassung preset', async () => {
    await open('vorlesefassung');
    expect(screen.getByLabelText('Geschriebener Text')).toBeInTheDocument();
    expect(screen.queryByLabelText('Wen erreicht man?')).not.toBeInTheDocument();
  });

  it('keeps the button disabled until the required field is filled', async () => {
    await open('mailbox');
    const button = screen.getByRole('button', { name: /Entwurf erstellen/ });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Wen erreicht man?'), {
      target: { value: 'Grünes Büro Musterstadt' },
    });

    expect(button).toBeEnabled();
  });

  it('sends the filled fields as null-for-empty and hands the draft up', async () => {
    let received: unknown = null;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ success: true, script: 'Guten Tag, hier ist das Grüne Büro.' });
      })
    );
    const { user, onDraft } = await open('mailbox');

    fireEvent.change(screen.getByLabelText('Wen erreicht man?'), {
      target: { value: 'Grünes Büro Musterstadt' },
    });
    await user.click(screen.getByRole('button', { name: /Entwurf erstellen/ }));

    await waitFor(() =>
      expect(onDraft).toHaveBeenCalledWith('Guten Tag, hier ist das Grüne Büro.')
    );
    expect(received).toEqual({
      preset: 'mailbox',
      organisation: 'Grünes Büro Musterstadt',
      person: null,
      reachability: null,
      alternative: null,
      tone: 'freundlich',
    });
  });

  it('shows a failure as an alert and does not fill the editor', async () => {
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json({ success: false, error: 'Es kam kein Entwurf zurück.' }, { status: 500 })
      )
    );
    const { user, onDraft } = await open('audiodeskription');

    fireEvent.change(screen.getByLabelText('Was ist zu sehen?'), {
      target: { value: 'Ein grünes Sharepic.' },
    });
    await user.click(screen.getByRole('button', { name: /Entwurf erstellen/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Es kam kein Entwurf zurück.')
    );
    expect(onDraft).not.toHaveBeenCalled();
  });

  it('has no axe violations when open', async () => {
    const { container } = await open('mailbox');
    expect(await axe(container)).toHaveNoViolations();
  });
});

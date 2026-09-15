import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../test/msw-server';

import VoicePage from './VoicePage';

import { useAuthStore } from '@/stores/authStore';
import { axe, fireEvent, renderWithProviders, screen, waitFor } from '@/test-utils';

const ENDPOINT = 'http://localhost/api/voice/speech/generate';

const okResponse = {
  success: true,
  durationSeconds: 12.3,
  chunks: 1,
  files: [
    {
      format: 'wav_phone',
      mediaId: 'm-wav',
      shareToken: 'tok-wav',
      mimeType: 'audio/wav',
      fileSize: 196_000,
      shareUrl: '/share/tok-wav',
    },
    {
      format: 'mp3',
      mediaId: 'm-mp3',
      shareToken: 'tok-mp3',
      mimeType: 'audio/mpeg',
      fileSize: 147_000,
      shareUrl: '/share/tok-mp3',
    },
  ],
  quota: { usedSeconds: 12, limitSeconds: 1800 },
};

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1', tts_voice_id: null } as never });
});

afterEach(() => {
  server.resetHandlers();
});

function textarea(): HTMLTextAreaElement {
  return screen.getByLabelText('Text');
}

describe('VoicePage', () => {
  it('starts on the mailbox preset with both formats and drops the telephone WAV for a Vorlesefassung', async () => {
    const { user } = renderWithProviders(<VoicePage />);

    expect(screen.getByRole('radio', { name: /Anrufbeantworter/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('checkbox', { name: /Telefon-WAV/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /MP3/ })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: /Vorlesefassung/ }));

    expect(screen.getByRole('checkbox', { name: /Telefon-WAV/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /MP3/ })).toBeChecked();
  });

  it('announces how many provider requests a long text needs', async () => {
    const { user } = renderWithProviders(<VoicePage />);
    await user.click(screen.getByRole('radio', { name: /Vorlesefassung/ }));

    fireEvent.change(textarea(), { target: { value: 'a'.repeat(9000) } });

    expect(screen.getByText(/wird in 2 Abschnitten erzeugt/)).toBeInTheDocument();
  });

  it('sends the preset and formats, then shows player, downloads and the Mediathek link', async () => {
    let received: unknown = null;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(okResponse);
      })
    );
    const { user } = renderWithProviders(<VoicePage />);

    fireEvent.change(textarea(), { target: { value: 'Hallo, hier ist der Kreisverband.' } });
    await user.click(screen.getByRole('button', { name: /Sprachausgabe erzeugen/ }));

    expect(await screen.findByRole('heading', { name: /Fertig – 0:12/ })).toBeInTheDocument();
    expect(received).toMatchObject({
      preset: 'mailbox',
      text: 'Hallo, hier ist der Kreisverband.',
      // The mailbox preset lists the telephone WAV first: it is the file the
      // person came for; the MP3 is the preview.
      formats: ['wav_phone', 'mp3'],
      speed: null,
    });

    // The MP3 is what the preview plays, even when the WAV came first.
    const audio = document.querySelector('audio[controls]');
    expect(audio).toHaveAttribute('src', '/api/share/tok-mp3/stream');
    expect(screen.getByRole('button', { name: /MP3 herunterladen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Telefon-WAV herunterladen/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mediathek' })).toHaveAttribute(
      'href',
      '/media-library'
    );
  });

  it('drops an AI draft into the editor instead of sending it straight off', async () => {
    let generateCalls = 0;
    server.use(
      http.post('http://localhost/api/voice/speech/script', () =>
        HttpResponse.json({ success: true, script: 'Guten Tag, hier ist das Grüne Büro.' })
      ),
      http.post(ENDPOINT, () => {
        generateCalls += 1;
        return HttpResponse.json(okResponse);
      })
    );
    const { user } = renderWithProviders(<VoicePage />);

    await user.click(screen.getByRole('button', { name: /Text mit KI entwerfen/ }));
    fireEvent.change(screen.getByLabelText('Wen erreicht man?'), {
      target: { value: 'Grünes Büro Musterstadt' },
    });
    await user.click(screen.getByRole('button', { name: /Entwurf erstellen/ }));

    await waitFor(() => expect(textarea()).toHaveValue('Guten Tag, hier ist das Grüne Büro.'));
    // The person reads and edits first — a draft must never synthesise by itself.
    expect(generateCalls).toBe(0);
  });

  it('shows the quota message from a 429 as an alert', async () => {
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json(
          { success: false, error: 'Das tägliche Kontingent ist aufgebraucht.' },
          { status: 429 }
        )
      )
    );
    const { user } = renderWithProviders(<VoicePage />);

    fireEvent.change(textarea(), { target: { value: 'Ein Satz.' } });
    await user.click(screen.getByRole('button', { name: /Sprachausgabe erzeugen/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Das tägliche Kontingent ist aufgebraucht.'
      )
    );
  });

  it('has no axe violations in its initial state', async () => {
    const { container } = renderWithProviders(<VoicePage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

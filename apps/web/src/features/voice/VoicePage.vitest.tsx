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
  it('starts on the Vorlesefassung preset with MP3 only and adds the telephone WAV for a mailbox greeting', async () => {
    const { user } = renderWithProviders(<VoicePage />);

    // The rail is open from the start — no disclosure to defeat first.
    expect(screen.getByRole('radio', { name: /Vorlesefassung/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('checkbox', { name: /MP3/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Telefon-WAV/ })).not.toBeChecked();

    await user.click(screen.getByRole('radio', { name: /Anrufbeantworter/ }));

    expect(screen.getByRole('checkbox', { name: /Telefon-WAV/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /MP3/ })).toBeChecked();
  });

  it('announces how many provider requests a long text needs', async () => {
    renderWithProviders(<VoicePage />);

    fireEvent.change(textarea(), { target: { value: 'a'.repeat(9000) } });

    expect(screen.getByText(/Wird in 2 Abschnitten erzeugt/)).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: /Vertonen/ }));

    expect(await screen.findByRole('heading', { name: /Fertig – 0:12/ })).toBeInTheDocument();
    expect(received).toMatchObject({
      preset: 'vorlesefassung',
      text: 'Hallo, hier ist der Kreisverband.',
      // Plain vertonen is the default: an MP3 and nothing else.
      formats: ['mp3'],
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

  it('estimates the audio length from the text and the tempo', async () => {
    const { user } = renderWithProviders(<VoicePage />);

    expect(screen.getByText('Dauer wird beim Eintippen geschätzt')).toBeInTheDocument();

    // 130 characters at ~13 per second is ten seconds of speech.
    fireEvent.change(textarea(), { target: { value: 'a'.repeat(130) } });
    expect(screen.getByText('≈ 0:10 Min. Audio')).toBeInTheDocument();

    // The estimate follows the tempo, so the rail and the number cannot disagree.
    await user.click(screen.getByRole('radio', { name: 'Langsam' }));
    expect(screen.getByText('≈ 0:11 Min. Audio')).toBeInTheDocument();
  });

  it('drafts in a dialog and drops the result into the editor instead of sending it off', async () => {
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
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Geschriebener Text'), {
      target: { value: 'Ein Antragstext, der vorgelesen werden soll.' },
    });
    await user.click(screen.getByRole('button', { name: /Entwurf erstellen/ }));

    await waitFor(() => expect(textarea()).toHaveValue('Guten Tag, hier ist das Grüne Büro.'));
    // The dialog gets out of the way once the draft has landed.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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
    await user.click(screen.getByRole('button', { name: /Vertonen/ }));

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

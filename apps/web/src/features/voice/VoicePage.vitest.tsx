import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../test/msw-server';

import VoicePage from './VoicePage';

import { useAuthStore } from '@/stores/authStore';
import { axe, fireEvent, renderWithProviders, screen, waitFor, within } from '@/test-utils';

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
  quota: {
    used: 0.07,
    limit: 10,
    remaining: 9.93,
    resetsAt: '2026-09-19T00:00:00.000Z',
    newsletterBonus: false,
  },
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
  it('keeps the settings folded behind a summary and opens them inside the editor card', async () => {
    const { user } = renderWithProviders(<VoicePage />);

    const toggle = screen.getByRole('button', { name: /Einstellungen: Vorlesefassung/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radio', { name: /Vorlesefassung/ })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('radio', { name: /Vorlesefassung/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );

    // The summary follows the choice, so the folded state never lies.
    await user.click(screen.getByRole('radio', { name: /Anrufbeantworter/ }));
    expect(
      screen.getByRole('button', { name: /Einstellungen: Anrufbeantworter/ })
    ).toBeInTheDocument();
  });

  it('moves the settings into a bottom sheet on a phone', async () => {
    const width = window.innerWidth;
    window.innerWidth = 390;
    try {
      const { user } = renderWithProviders(<VoicePage />);

      expect(screen.queryByRole('button', { name: /Einstellungen: / })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Einstellungen/ }));

      const sheet = await screen.findByRole('dialog', { name: 'Einstellungen' });
      expect(within(sheet).getByRole('radio', { name: /Audiodeskription/ })).toBeInTheDocument();
      await user.click(within(sheet).getByRole('button', { name: 'Fertig' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    } finally {
      window.innerWidth = width;
    }
  });

  it('announces how many provider requests a long text needs', async () => {
    renderWithProviders(<VoicePage />);

    fireEvent.change(textarea(), { target: { value: 'a'.repeat(9000) } });

    // "Announces" is the whole point: the notice has to sit in a live region the
    // textarea points at, or a screen-reader user first learns about the split
    // from the result heading after submitting.
    const notice = screen.getByText(/Wird in 2 Abschnitten erzeugt/);
    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(textarea().getAttribute('aria-describedby')?.split(' ')).toContain(notice.id);
  });

  it('always asks for both formats, then offers them in one download menu', async () => {
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

    expect(await screen.findByRole('heading', { name: 'Vorlesefassung' })).toBeInTheDocument();
    expect(screen.getByText(/0:12 Min\./)).toBeInTheDocument();
    expect(received).toMatchObject({
      preset: 'vorlesefassung',
      text: 'Hallo, hier ist der Kreisverband.',
      // One synthesis, two encodes: nobody has to pick a format up front.
      formats: ['mp3', 'wav_phone'],
      speed: null,
    });

    // The MP3 is what the preview plays, even when the WAV came first.
    const audio = document.querySelector('audio[controls]');
    expect(audio).toHaveAttribute('src', '/api/share/tok-mp3/stream');

    await user.click(screen.getByRole('button', { name: /Herunterladen/ }));
    expect(await screen.findByRole('menuitem', { name: /MP3/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Telefon-WAV/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.getByRole('link', { name: 'Mediathek' })).toHaveAttribute(
      'href',
      '/media-library'
    );
    expect(screen.getByRole('button', { name: /Link kopieren/ })).toBeInTheDocument();
  });

  it('says when the file no longer matches the text and offers to redo it', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json(okResponse)));
    const { user } = renderWithProviders(<VoicePage />);

    fireEvent.change(textarea(), { target: { value: 'Erster Satz.' } });
    await user.click(screen.getByRole('button', { name: /Vertonen/ }));
    await screen.findByRole('heading', { name: 'Vorlesefassung' });
    expect(screen.queryByText(/erneut vertonen/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Neu vertonen/ })).toBeInTheDocument();

    fireEvent.change(textarea(), { target: { value: 'Erster Satz. Zweiter Satz.' } });
    expect(screen.getByText(/erneut vertonen/)).toBeInTheDocument();
  });

  it('estimates the audio length from the text and the tempo', async () => {
    const { user } = renderWithProviders(<VoicePage />);

    expect(screen.getByText('Dauer wird beim Eintippen geschätzt')).toBeInTheDocument();

    // 130 characters at ~13 per second is ten seconds of speech.
    fireEvent.change(textarea(), { target: { value: 'a'.repeat(130) } });
    expect(screen.getByText('≈ 0:10 Min. Audio')).toBeInTheDocument();

    // The estimate follows the tempo, so the settings and the number cannot disagree.
    await user.click(screen.getByRole('button', { name: /Einstellungen: / }));
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

  it('shows a pause as a readable token and sends it as provider markup', async () => {
    let received: unknown = null;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(okResponse);
      })
    );
    const { user } = renderWithProviders(<VoicePage />);

    fireEvent.change(textarea(), { target: { value: 'Guten Tag.' } });
    await user.click(screen.getByRole('button', { name: /Pause einfügen/ }));

    // What the person reads is the token, never the provider's angle brackets.
    expect(textarea()).toHaveValue('Guten Tag.[Pause]');
    expect(textarea().value).not.toContain('<break');

    // The counter charges the full tag and says why the number jumped.
    expect(document.getElementById('voice-text-count')).toHaveTextContent(
      '31 / 24.576 Zeichen · 1 Pause'
    );

    await user.click(screen.getByRole('button', { name: /Vertonen/ }));

    await waitFor(() =>
      expect(received).toMatchObject({ text: 'Guten Tag.<break time="500ms"/>' })
    );
  });

  it('refuses a pause that would not fit and keeps the text unchanged', async () => {
    const { user } = renderWithProviders(<VoicePage />);

    // Anrufbeantworter caps at 1500 characters on the wire.
    await user.click(screen.getByRole('button', { name: /Einstellungen: / }));
    await user.click(screen.getByRole('radio', { name: /Anrufbeantworter/ }));
    fireEvent.change(textarea(), { target: { value: 'a'.repeat(1490) } });

    // 1490 + 21 is over the cap, so the button is out of reach rather than
    // inserting half a tag — a cut-off tag is read aloud.
    expect(screen.getByRole('button', { name: /Pause einfügen/ })).toBeDisabled();
    expect(textarea()).toHaveValue('a'.repeat(1490));
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

  it('has no axe violations, folded or with the settings open', async () => {
    const { container, user } = renderWithProviders(<VoicePage />);
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: /Einstellungen: / }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

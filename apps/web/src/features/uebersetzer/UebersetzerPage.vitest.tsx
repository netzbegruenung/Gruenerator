/**
 * The text tab end to end against MSW: languages populate the pickers,
 * a translation lands in the right pane with its detected language and the
 * glossary note, a budget refusal shows as an alert, and a server without a
 * key shows a notice rather than an error. Plus axe over the rendered page —
 * the pickers, the swap button and the output region carry hand-written labels.
 *
 * Since the redesign nothing is pressed to translate: it runs by itself after
 * a pause in typing. The guard rails around that are the expensive part to get
 * wrong (every run is billed), so they are asserted by counting the POSTs the
 * page actually sends.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../test/msw-server';
import { axe, renderWithProviders, screen, waitFor, within } from '../../test-utils';

import UebersetzerPage from './UebersetzerPage';

const LANGUAGES = 'http://localhost/api/translation/languages';
const TEXT = 'http://localhost/api/translation/text';

const LANGUAGE_LIST = {
  languages: [
    {
      code: 'de',
      name: 'Deutsch',
      usableAsSource: true,
      usableAsTarget: true,
      formality: true,
      glossary: true,
    },
    {
      code: 'en',
      name: 'Englisch',
      usableAsSource: true,
      usableAsTarget: false,
      formality: false,
      glossary: true,
    },
    {
      code: 'en-GB',
      name: 'Englisch (britisch)',
      usableAsSource: false,
      usableAsTarget: true,
      formality: false,
      glossary: true,
    },
    {
      code: 'fr',
      name: 'Französisch',
      usableAsSource: true,
      usableAsTarget: true,
      formality: true,
      glossary: true,
    },
  ],
  glossaryPairs: ['de>en'],
  quota: {
    used: 2,
    limit: 10,
    remaining: 8,
    resetsAt: '2026-09-19T00:00:00.000Z',
    newsletterBonus: false,
  },
};

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

function withLanguages() {
  server.use(http.get(LANGUAGES, () => HttpResponse.json(LANGUAGE_LIST)));
}

describe('UebersetzerPage', () => {
  it('fills the pickers from the API and translates into the right pane', async () => {
    withLanguages();
    let sent: unknown = null;
    server.use(
      http.post(TEXT, async ({ request }) => {
        sent = (await request.json()) as unknown;
        return HttpResponse.json({
          text: 'Hello world',
          detectedSourceLang: 'de',
          targetLang: 'en-GB',
          billedCharacters: 10,
          glossaryApplied: true,
          quota: {
            used: 2.1,
            limit: 10,
            remaining: 7.9,
            resetsAt: '2026-09-19T00:00:00.000Z',
            newsletterBonus: false,
          },
        });
      })
    );
    const { user } = renderWithProviders(<UebersetzerPage />);

    const source = await screen.findByLabelText('Von');
    expect(
      within(source)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['Automatisch erkennen', 'Deutsch', 'Englisch', 'Französisch']);
    const target = screen.getByLabelText('Nach') as HTMLSelectElement;
    expect(target.value).toBe('en-GB');
    expect(screen.getByText('Heute noch 8 von 10 Bäumen.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Ausgangstext'), 'Hallo Welt');

    await waitFor(
      () => expect(screen.getByLabelText('Übersetzung')).toHaveTextContent('Hello world'),
      { timeout: 4000 }
    );
    expect(sent).toEqual({
      text: 'Hallo Welt',
      targetLang: 'en-GB',
      sourceLang: null,
      formality: null,
    });
    expect(screen.getByText('Erkannt: Deutsch · Grünen-Glossar angewendet')).toBeInTheDocument();
    expect(screen.getByText('Heute noch 7,9 von 10 Bäumen.')).toBeInTheDocument();
  });

  it('shows the budget refusal as an alert and updates the budget line', async () => {
    withLanguages();
    server.use(
      http.post(TEXT, () =>
        HttpResponse.json(
          {
            success: false,
            error: 'Tagesbudget für Übersetzungen erschöpft (10 von 10 Bäumen).',
            quota: {
              used: 10,
              limit: 10,
              remaining: 0,
              resetsAt: '2026-09-19T00:00:00.000Z',
              newsletterBonus: false,
            },
          },
          { status: 429 }
        )
      )
    );
    const { user } = renderWithProviders(<UebersetzerPage />);
    await user.type(await screen.findByLabelText('Ausgangstext'), 'Hallo');

    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      /Tagesbudget/
    );
    expect(screen.getByText('Heute noch 0 von 10 Bäumen.')).toBeInTheDocument();
  });

  it('shows a notice, not an error, when the server has no DeepL key', async () => {
    server.use(
      http.get(LANGUAGES, () =>
        HttpResponse.json(
          { success: false, error: 'nicht eingerichtet', code: 'not_configured' },
          { status: 503 }
        )
      )
    );
    renderWithProviders(<UebersetzerPage />);
    expect(await screen.findByRole('status')).toHaveTextContent(/nicht eingerichtet/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the server sentence when a 503 is the budget, not a missing key', async () => {
    withLanguages();
    server.use(
      http.post(TEXT, () =>
        HttpResponse.json(
          {
            success: false,
            error: 'Das Kontingent lässt sich gerade nicht prüfen.',
            code: 'budget_unavailable',
          },
          { status: 503 }
        )
      )
    );
    const { user } = renderWithProviders(<UebersetzerPage />);
    await user.type(await screen.findByLabelText('Ausgangstext'), 'Hallo');

    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'Das Kontingent lässt sich gerade nicht prüfen.'
    );
  });

  it('offers the formality switch only for targets that support it', async () => {
    withLanguages();
    const { user } = renderWithProviders(<UebersetzerPage />);
    await screen.findByLabelText('Von');
    expect(screen.queryByRole('button', { name: 'Anrede' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Nach'), 'fr');
    expect(screen.getByRole('button', { name: 'Anrede' })).toBeInTheDocument();
  });

  it('translates a long text only on demand, never on its own', async () => {
    withLanguages();
    let posts = 0;
    server.use(
      http.post(TEXT, () => {
        posts += 1;
        return HttpResponse.json({
          text: 'long',
          detectedSourceLang: 'de',
          targetLang: 'en-GB',
          billedCharacters: 2001,
          glossaryApplied: false,
          quota: LANGUAGE_LIST.quota,
        });
      })
    );
    const { user } = renderWithProviders(<UebersetzerPage />);
    const input = await screen.findByLabelText('Ausgangstext');
    await user.click(input);
    // Past AUTO_MAX_CHARS a run would cost real Bäume per pause in typing.
    await user.paste('a'.repeat(2001));

    const button = await screen.findByRole('button', { name: 'Übersetzen' });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(posts).toBe(0);

    await user.click(button);
    await waitFor(() => expect(posts).toBe(1));
  });

  it('sends one request per text — a finished translation does not retrigger itself', async () => {
    withLanguages();
    let posts = 0;
    server.use(
      http.post(TEXT, () => {
        posts += 1;
        return HttpResponse.json({
          text: 'Hello',
          detectedSourceLang: 'de',
          targetLang: 'en-GB',
          billedCharacters: 5,
          glossaryApplied: false,
          // A changed quota re-renders the page; without the sent-key guard
          // that re-render would start the very same translation again.
          quota: { ...LANGUAGE_LIST.quota, used: 2.1, remaining: 7.9 },
        });
      })
    );
    const { user } = renderWithProviders(<UebersetzerPage />);
    await user.type(await screen.findByLabelText('Ausgangstext'), 'Hallo');
    await waitFor(() => expect(posts).toBe(1), { timeout: 4000 });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(posts).toBe(1);
  });

  it('does not translate by itself once the daily budget is used up', async () => {
    server.use(
      http.get(LANGUAGES, () =>
        HttpResponse.json({
          ...LANGUAGE_LIST,
          quota: { ...LANGUAGE_LIST.quota, used: 10, remaining: 0 },
        })
      )
    );
    let posts = 0;
    server.use(
      http.post(TEXT, () => {
        posts += 1;
        return HttpResponse.json({});
      })
    );
    const { user } = renderWithProviders(<UebersetzerPage />);
    await user.type(await screen.findByLabelText('Ausgangstext'), 'Hallo');
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(posts).toBe(0);
    expect(screen.getByText('Das Tagesbudget ist aufgebraucht.')).toBeInTheDocument();
  });

  it('has no axe violations once loaded', async () => {
    withLanguages();
    const { container } = renderWithProviders(<UebersetzerPage />);
    await screen.findByLabelText('Von');
    expect(await axe(container)).toHaveNoViolations();
  });
});

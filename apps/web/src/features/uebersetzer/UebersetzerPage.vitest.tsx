/**
 * The text tab end to end against MSW: languages populate the pickers,
 * a translation lands in the right pane with its detected language and the
 * glossary note, a budget refusal shows as an alert, and a server without a
 * key shows a notice rather than an error. Plus axe over the rendered page —
 * the selects and the swap button carry hand-written labels.
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
        sent = await request.json();
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
    await user.click(screen.getByRole('button', { name: 'Übersetzen' }));

    await waitFor(() => expect(screen.getByLabelText('Übersetzung')).toHaveValue('Hello world'));
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
    await user.click(screen.getByRole('button', { name: 'Übersetzen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Tagesbudget/);
    expect(screen.getByText('Heute noch 0 von 10 Bäumen.')).toBeInTheDocument();
  });

  it('shows a notice, not an error, when the server has no DeepL key', async () => {
    server.use(
      http.get(LANGUAGES, () =>
        HttpResponse.json({ success: false, error: 'nicht eingerichtet' }, { status: 503 })
      )
    );
    renderWithProviders(<UebersetzerPage />);
    expect(await screen.findByRole('status')).toHaveTextContent(/nicht eingerichtet/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers the formality switch only for targets that support it', async () => {
    withLanguages();
    const { user } = renderWithProviders(<UebersetzerPage />);
    await screen.findByLabelText('Von');
    expect(screen.queryByText('Anrede')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Nach'), 'fr');
    expect(screen.getByText('Anrede')).toBeInTheDocument();
  });

  it('has no axe violations once loaded', async () => {
    withLanguages();
    const { container } = renderWithProviders(<UebersetzerPage />);
    await screen.findByLabelText('Von');
    expect(await axe(container)).toHaveNoViolations();
  });
});

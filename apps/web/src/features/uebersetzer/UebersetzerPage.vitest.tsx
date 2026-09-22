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
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useExportStore } from '../../stores/core/exportStore';
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

/** A plain successful translation, for the tests that are about what follows it. */
function withTranslation() {
  server.use(
    http.post(TEXT, () =>
      HttpResponse.json({
        text: 'Hello world',
        detectedSourceLang: 'de',
        targetLang: 'en-GB',
        billedCharacters: 10,
        glossaryApplied: true,
        quota: { ...LANGUAGE_LIST.quota, used: 2.1, remaining: 7.9 },
      })
    )
  );
}

const DOC_ID = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';

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
    // 8 of 10 Bäume is a comfortable balance, so the chip keeps quiet.
    expect(screen.queryByText(/Heute noch/)).not.toBeInTheDocument();

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
    // The answer costs 0,1 Bäume — still nothing worth a chip.
    expect(screen.queryByText(/Heute noch/)).not.toBeInTheDocument();
  });

  it('shows the budget only once it gets tight', async () => {
    withLanguages();
    server.use(
      http.post(TEXT, () =>
        HttpResponse.json({
          text: 'Hello',
          detectedSourceLang: 'de',
          targetLang: 'en-GB',
          billedCharacters: 5,
          glossaryApplied: false,
          quota: { ...LANGUAGE_LIST.quota, used: 5.8, remaining: 4.2 },
        })
      )
    );
    const { user } = renderWithProviders(<UebersetzerPage />);
    await screen.findByLabelText('Von');
    // Starting at 8 of 10 there is nothing to say …
    expect(screen.queryByText(/Heute noch/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Ausgangstext'), 'Hallo');

    // … and the answer is what brings the balance under the threshold.
    expect(
      await screen.findByText('Heute noch 4,2 von 10 Bäumen.', {}, { timeout: 4000 })
    ).toBeInTheDocument();
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

  it('blocks auto-detect in both halves of the picker when a glossary needs the source', async () => {
    withLanguages();
    const { user } = renderWithProviders(<UebersetzerPage />);
    await screen.findByLabelText('Von');
    await user.click(screen.getByRole('tab', { name: /Dokument/ }));

    // `de>en` translates into the default target `en-GB`, so the source must be explicit.
    const source = await screen.findByLabelText('Von');
    expect(within(source).getByRole('option', { name: 'Bitte wählen' })).toBeDisabled();
    // The quick-pick tab is the same control — it must not hand `auto` back.
    expect(screen.getByRole('button', { name: 'Bitte wählen' })).toBeDisabled();

    // The reason is announced with the picker, not left as a loose paragraph.
    const hint = source.getAttribute('aria-describedby');
    expect(hint).toBeTruthy();
    expect(document.getElementById(hint!)).toHaveTextContent(
      'Für diese Zielsprache gibt es ein Glossar'
    );
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

  it('sends one request when the shortcut beats the debounce to the same text', async () => {
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
          quota: { ...LANGUAGE_LIST.quota, used: 2.1, remaining: 7.9 },
        });
      })
    );
    const { user } = renderWithProviders(<UebersetzerPage />);
    await user.type(await screen.findByLabelText('Ausgangstext'), 'Hallo');
    // Well inside the debounce — that is what the shortcut is for, since waiting
    // it out would have translated anyway.
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    await waitFor(() => expect(posts).toBe(1), { timeout: 4000 });

    // The timer the last keystroke scheduled must not bill the same text again.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(posts).toBe(1);
  });

  it('still translates text typed while an earlier request is in flight', async () => {
    withLanguages();
    const sent: string[] = [];
    server.use(
      http.post(TEXT, async ({ request }) => {
        sent.push(((await request.json()) as { text: string }).text);
        // Long enough that the next keystrokes land while this one is running.
        await delay(600);
        return HttpResponse.json({
          text: 'Hello',
          detectedSourceLang: 'de',
          targetLang: 'en-GB',
          billedCharacters: 5,
          glossaryApplied: false,
          quota: { ...LANGUAGE_LIST.quota, used: 2.1, remaining: 7.9 },
        });
      })
    );
    const { user } = renderWithProviders(<UebersetzerPage />);
    const input = await screen.findByLabelText('Ausgangstext');
    await user.type(input, 'Hallo');
    await waitFor(() => expect(sent).toEqual(['Hallo']), { timeout: 4000 });

    // Typing on while the answer is still out: the timer this schedules fires
    // into a closure that believes a run is going on, so only a fresh one sent
    // after the first settles gets this text translated at all.
    await user.type(input, 'x');
    await waitFor(() => expect(sent).toEqual(['Hallo', 'Hallox']), { timeout: 4000 });
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

  it('offers the document export only once there is a translation', async () => {
    withLanguages();
    withTranslation();
    const { user } = renderWithProviders(<UebersetzerPage />);
    await screen.findByLabelText('Von');

    const trigger = screen.getByRole('button', { name: 'Als Dokument' });
    expect(trigger).toBeDisabled();

    await user.type(screen.getByLabelText('Ausgangstext'), 'Hallo');
    await waitFor(() => expect(trigger).toBeEnabled(), { timeout: 4000 });

    await user.click(trigger);
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      'Im Editor bearbeiten',
      'Als Word (.docx)',
      'Als PDF',
    ]);
  });

  it('sends the translation, not the source text, to the editor', async () => {
    withLanguages();
    withTranslation();
    let body: { content?: string; title?: string; documentType?: string } | null = null;
    server.use(
      // A wildcard, not the absolute URL the other handlers use: the editor path
      // goes through apps/web's own axios instance, whose baseURL is the
      // relative '/api' — so the origin is jsdom's, not the one the contracts
      // client was configured with.
      http.post('*/api/docs/from-export', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ documentId: DOC_ID, url: `/document/${DOC_ID}`, success: true });
      })
    );
    // jsdom has no window.open; without the stub it only logs "Not implemented"
    // and the assertion below would have nothing to look at.
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { user } = renderWithProviders(<UebersetzerPage />);
    await user.type(await screen.findByLabelText('Ausgangstext'), 'Hallo');
    await waitFor(
      () => expect(screen.getByLabelText('Übersetzung')).toHaveTextContent('Hello world'),
      { timeout: 4000 }
    );

    await user.click(screen.getByRole('button', { name: 'Als Dokument' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Im Editor bearbeiten' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.content).toContain('Hello world');
    expect(body!.content).not.toContain('Hallo');
    expect(body!.title).toBe('Übersetzung: Deutsch → Englisch (britisch)');
    // Anything the server does not know is silently downgraded to 'blank', so
    // the subtype is only ever wrong-looking, never loud.
    expect(body!.documentType).toBe('notizen');
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(`/office/${DOC_ID}`, '_blank', 'noopener,noreferrer')
    );
    open.mockRestore();
  });

  /**
   * The two file formats are checked at the store's door rather than over MSW:
   * the store asks axios for a Blob, and msw's XHR interceptor cannot build a
   * Response around a jsdom Blob at all ("object.stream is not a function"), so
   * the request would always die on the way back. What the store then does with
   * the text has its own test (stores/core/exportStore.vitest.ts); what belongs
   * here is that the menu hands over the translation and not the source.
   */
  it('hands the translation and a title naming both languages to the file exports', async () => {
    withLanguages();
    withTranslation();
    const generateDOCX = vi.fn().mockResolvedValue(undefined);
    const generatePDF = vi.fn().mockResolvedValue(undefined);
    const original = useExportStore.getState();
    useExportStore.setState({ generateDOCX, generatePDF });

    const { user } = renderWithProviders(<UebersetzerPage />);
    await user.type(await screen.findByLabelText('Ausgangstext'), 'Hallo');
    await waitFor(
      () => expect(screen.getByLabelText('Übersetzung')).toHaveTextContent('Hello world'),
      { timeout: 4000 }
    );

    await user.click(screen.getByRole('button', { name: 'Als Dokument' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Als Word (.docx)' }));
    await waitFor(() =>
      expect(generateDOCX).toHaveBeenCalledWith(
        'Hello world',
        'Übersetzung: Deutsch → Englisch (britisch)'
      )
    );

    await user.click(screen.getByRole('button', { name: 'Als Dokument' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Als PDF' }));
    await waitFor(() =>
      expect(generatePDF).toHaveBeenCalledWith(
        'Hello world',
        'Übersetzung: Deutsch → Englisch (britisch)'
      )
    );

    useExportStore.setState(original);
  });

  it('reads the text out of an image into the source field and translates it', async () => {
    withLanguages();
    withTranslation();
    let uploaded: { type: string; size: number } | null = null;
    server.use(
      // Wildcard for the same reason as the editor handler above: the OCR call
      // rides on apps/web's own axios instance and its relative '/api'.
      http.post('*/api/scanner/extract', async ({ request }) => {
        const form = await request.formData();
        const entry = form.get('file');
        // Type and size, not the filename: by the time the multipart body has
        // been through axios' XHR adapter and msw's interceptor the name has
        // become "blob". That is the test environment, not the product — the
        // server reads `file.originalname` from a real request — so asserting
        // the name here would only guard the round trip.
        // Duck-typed, not `instanceof Blob`: msw's File comes from undici's
        // realm, so it fails an identity check against jsdom's global Blob
        // while being a perfectly good file.
        const datei = entry as { type?: string; size?: number } | null;
        uploaded =
          datei && typeof datei.size === 'number'
            ? { type: datei.type ?? '', size: datei.size }
            : null;
        return HttpResponse.json({
          success: true,
          text: '  Mehr Klimaschutz jetzt  ',
          pageCount: 1,
          method: 'mistral-ocr',
          fileInfo: { originalname: 'schild.png', size: 4, mimetype: 'image/png' },
        });
      })
    );

    const { user, container } = renderWithProviders(<UebersetzerPage />);
    await screen.findByLabelText('Von');
    await user.click(screen.getByRole('tab', { name: /Bild/ }));

    const picker = container.querySelector('input[type="file"]');
    await user.upload(
      picker as HTMLInputElement,
      new File(['png'], 'schild.png', { type: 'image/png' })
    );

    // The recognised text lands in the source field — trimmed — and the page is
    // back on the text tab, which is the whole point of the Bild tab.
    await waitFor(() =>
      expect(screen.getByLabelText('Ausgangstext')).toHaveValue('Mehr Klimaschutz jetzt')
    );
    // The exact byte count is not asserted either: the multipart round trip
    // through the interceptor does not preserve it. That an image-typed,
    // non-empty file arrived is the claim that matters here.
    expect(uploaded).not.toBeNull();
    expect(uploaded!.type).toBe('image/png');
    expect(uploaded!.size).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: /Text/ })).toHaveAttribute('aria-selected', 'true');

    // And it is translated like anything typed, without a second gesture.
    expect(
      await screen.findByText('Hello world', undefined, { timeout: 4000 })
    ).toBeInTheDocument();
  });

  it('says so when the picture carries no text, instead of switching to an empty field', async () => {
    withLanguages();
    server.use(
      http.post('*/api/scanner/extract', () =>
        HttpResponse.json({
          success: true,
          text: '   \n  ',
          pageCount: 1,
          method: 'mistral-ocr',
          fileInfo: { originalname: 'wiese.png', size: 4, mimetype: 'image/png' },
        })
      )
    );

    const { user, container } = renderWithProviders(<UebersetzerPage />);
    await screen.findByLabelText('Von');
    await user.click(screen.getByRole('tab', { name: /Bild/ }));

    const picker = container.querySelector('input[type="file"]');
    await user.upload(
      picker as HTMLInputElement,
      new File(['png'], 'wiese.png', { type: 'image/png' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Auf diesem Bild wurde kein Text gefunden.'
    );
    // Staying put matters: a jump to an empty source field would look like the
    // upload was lost rather than like a picture without writing on it.
    expect(screen.getByRole('tab', { name: /Bild/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('has no axe violations once loaded', async () => {
    withLanguages();
    const { container } = renderWithProviders(<UebersetzerPage />);
    await screen.findByLabelText('Von');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the Bild tab', async () => {
    withLanguages();
    const { user, container } = renderWithProviders(<UebersetzerPage />);
    await screen.findByLabelText('Von');
    await user.click(screen.getByRole('tab', { name: /Bild/ }));
    await screen.findByLabelText(/Bild auswählen oder hierher ziehen/);
    expect(await axe(container)).toHaveNoViolations();
  });
});

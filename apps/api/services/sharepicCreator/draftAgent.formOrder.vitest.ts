/**
 * Which form a draft gets: a chip picked in the UI fixes it; otherwise the
 * person's own words decide, as `bedarf_melden` reads them — never a form's
 * word in the content. Live 09.11.2026: „Insta-Karussell: … bei allen
 * Terminen im Stadtrat …" was held to a Terminübersicht by a word list and
 * failed on every attempt with „mindestens zwei Termine mit Datum".
 */
import { type SharepicFormId, type SharepicSpec } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { DraftFailedError, draftSharepic, needsPrompt } from './draftAgent.js';
import { draftFailedBody } from './draftFailure.js';
import { NEEDS_SCHEMA, needsSchema } from './draftSchemas.js';

type Folien = 'eine' | 'mehrere' | 'offen';

const needs = (
  form: SharepicFormId,
  over: { bestellt?: boolean; folien?: Folien; alternativen?: SharepicFormId[] } = {}
) => ({
  ok: true,
  data: {
    land: 'de-DE',
    anlass: [],
    kapitel: [],
    fotos_suchen: [],
    form,
    form_bestellt: over.bestellt ?? false,
    folien: over.folien ?? 'offen',
    alternativen: over.alternativen ?? [],
  },
});

const slide = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  logo: true,
  items,
  ...extra,
});
const headline = (lines: string[]) => ({ type: 'headline', lines });

type Call = { prompt: string; validate: (i: unknown, a: number, n: number) => unknown };

/** Needs answers with `needsAnswer`; the draft call stops, so only its prompt is read. */
function stopsAtDraft(needsAnswer: object) {
  aiObject
    .mockResolvedValueOnce(needsAnswer)
    .mockResolvedValue({ ok: false, error: 'stop', cause: 'outage' });
}

/** Needs answers with `needsAnswer`; every draft round (the rescue too) answers `raw` through its own validation. */
function draftsAs(needsAnswer: object, raw: unknown) {
  aiObject.mockImplementation(async (call: Call & { toolName: string }) => {
    if (call.toolName === 'bedarf_melden') return needsAnswer;
    const checked = call.validate(raw, 1, 1) as
      { ok: true; value: unknown } | { ok: false; error: string };
    return checked.ok ? { ok: true, data: checked.value } : checked;
  });
}

const needsCallPrompt = () => (aiObject.mock.calls[0]![0] as Call).prompt;
const draftCallPrompt = () => (aiObject.mock.calls[1]![0] as Call).prompt;
const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (err: unknown) => err
  );

// Braces: a hook returning the mock would have vitest call it as cleanup.
beforeEach(() => {
  aiObject.mockReset();
});

describe('a form word in the content orders nothing', () => {
  const USER_CASE =
    'Insta-Karussell: Unsere Fraktion war bei allen Terminen im Stadtrat und hat jedes Mal für den Radweg gestimmt.';

  it('drafts the carousel the person ordered, not a Terminübersicht', async () => {
    stopsAtDraft(needs('karussell', { bestellt: true, folien: 'mehrere' }));
    await failureOf(draftSharepic(USER_CASE, 'de-DE'));
    expect(aiObject).toHaveBeenCalledTimes(2);
    expect(draftCallPrompt()).toContain('Form: Karussell');
    expect(draftCallPrompt()).not.toContain('Form: Termine');
  });

  it('never asks for dates before the model has read the request', async () => {
    stopsAtDraft(needs('karussell', { bestellt: true, folien: 'mehrere' }));
    const err = await failureOf(draftSharepic(USER_CASE, 'de-DE'));
    expect(err).not.toMatchObject({ failure: { kind: 'material' } });
  });

  it.each([
    [
      'termine',
      'Sharepic: Bürgerämter brauchen mehr Personal – Termine gibt es erst in acht Wochen.',
    ],
    ['diagramm', 'Das Diagramm in der Studie zeigt es: Radwege machen Städte sicherer.'],
    ['rechnung', 'Sharepic zur Mietpreisbremse: Die Rechnung zahlen am Ende die Mieter*innen.'],
    ['faktenbild', 'Wie im Faktenbild von gestern: Bahn statt Flug.'],
  ] as const)(
    'swaps an unordered %s without its material for one that can be built',
    async (form, brief) => {
      draftsAs(needs(form), { slides: [slide([headline(['Mehr Personal', 'jetzt'])])] });
      const draft = await draftSharepic(brief, 'de-DE');
      expect(draft.form).toBe('einzelbild');
      expect(draft.bericht?.[0]).toEqual({
        art: 'form',
        form: 'einzelbild',
        von: 'creator',
        statt: form,
      });
    }
  );
});

describe('an ordered form', () => {
  it('is the form the draft is built and held to', async () => {
    draftsAs(needs('bingo', { bestellt: true }), {
      slides: [slide([headline(['Ausreden', 'der Autolobby'])])],
    });
    const err = await failureOf(draftSharepic('Als Bingo: die Ausreden der Autolobby', 'de-DE'));
    // The draft without a bingo block is sent back for the form the person asked for.
    expect(err).toBeInstanceOf(DraftFailedError);
    expect((err as DraftFailedError).failure).toEqual({ kind: 'form', form: 'bingo' });
    expect(draftCallPrompt()).toContain('Form: Bingo');
  });

  it('is reported as the person’s choice', async () => {
    draftsAs(needs('einzelbild', { bestellt: true, folien: 'eine' }), {
      slides: [slide([headline(['Busse statt Stau'])])],
    });
    const draft = await draftSharepic('Ein Einzelbild: Busse statt Stau', 'de-DE');
    expect(draft.bericht?.[0]).toEqual({ art: 'form', form: 'einzelbild', von: 'person' });
  });

  it('asks for the dates of a Terminübersicht without any, after one model call', async () => {
    stopsAtDraft(needs('termine', { bestellt: true }));
    const err = await failureOf(draftSharepic('Terminplan für den Wahlkampf-Endspurt', 'de-DE'));
    expect(aiObject).toHaveBeenCalledTimes(1);
    expect((err as DraftFailedError).failure).toEqual({
      kind: 'material',
      form: 'termine',
      ask: 'mindestens zwei Termine mit Datum',
    });
    expect(draftFailedBody(err as DraftFailedError).error).toBe(
      'Der Entwurf ist nicht gelungen. Für die Form „Termine“ brauche ich mindestens zwei Termine mit Datum. Schreib mir das dazu, oder wähl eine andere Form.'
    );
  });

  it.each([
    ['diagramm', 'Als Diagramm: Radwege machen Städte sicherer', 'mindestens zwei Zahlen'],
    ['rechnung', 'Als Rechnung: das Ticket lohnt sich', 'die Zahlen'],
    ['faktenbild', 'Faktenbild: Bahn statt Flug', 'eine Zahl'],
  ] as const)('asks for the material of an ordered %s', async (form, brief, ask) => {
    stopsAtDraft(needs(form, { bestellt: true }));
    const err = (await failureOf(draftSharepic(brief, 'de-DE'))) as DraftFailedError;
    expect(aiObject).toHaveBeenCalledTimes(1);
    expect(err.failure).toMatchObject({ kind: 'material', form });
    expect((err.failure as { ask: string }).ask).toContain(ask);
  });

  it('builds an ordered Terminübersicht with two dates', async () => {
    stopsAtDraft(needs('termine', { bestellt: true }));
    await failureOf(
      draftSharepic('Save the dates: 14.12. Weihnachtsfeier, 18.01. Neujahrsempfang', 'de-DE')
    );
    expect(draftCallPrompt()).toContain('Form: Termine');
  });

  // „warum eigentlich zwei Termine?" — one date is a Veranstaltung, not a failure.
  it.each([
    'Termin-Sharepic: Mitgliederversammlung am 20.11. um 19 Uhr im Bürgerhaus',
    'Terminübersicht: Mitgliederversammlung am Donnerstag um 19 Uhr',
  ])('makes a Veranstaltung of an ordered Terminübersicht with one date: %s', async (brief) => {
    stopsAtDraft(needs('termine', { bestellt: true }));
    await failureOf(draftSharepic(brief, 'de-DE'));
    expect(aiObject).toHaveBeenCalledTimes(2);
    expect(draftCallPrompt()).toContain('Form: Veranstaltung');
  });

  it('reports the swap from Termine to Veranstaltung', async () => {
    const order = 'Termin-Sharepic: Mitgliederversammlung am 20.11. um 19 Uhr';
    draftsAs(needs('termine', { bestellt: true }), {
      slides: [slide([headline(['Mitglieder', 'versammlung'])], { datum: { date: '20.11.' } })],
    });
    const draft = await draftSharepic(order, 'de-DE');
    expect(draft.form).toBe('veranstaltung');
    expect(draft.bericht?.[0]).toEqual({
      art: 'form',
      form: 'veranstaltung',
      von: 'person',
      statt: 'termine',
    });
  });

  it('makes a Veranstaltung of an unordered Terminübersicht with one date too', async () => {
    draftsAs(needs('termine'), {
      slides: [slide([headline(['Mitglieder', 'versammlung'])], { datum: { date: '20.11.' } })],
    });
    const draft = await draftSharepic('Mitgliederversammlung am 20.11. um 19 Uhr', 'de-DE');
    expect(draft.form).toBe('veranstaltung');
    expect(draft.bericht?.[0]).toMatchObject({ von: 'creator', statt: 'termine' });
  });

  it('counts dates from the conversation material for the chat', async () => {
    stopsAtDraft(needs('termine', { bestellt: true }));
    const prompt =
      'Aktionswoche Klima\n\nMaterial aus dem Gespräch (Grundlage, nichts dazuerfinden):\n10.11. Infostand, 12.11. Kleidertausch';
    await failureOf(
      draftSharepic(
        prompt,
        'de-DE',
        null,
        [],
        {},
        null,
        'Aktionswoche Klima',
        null,
        null,
        true,
        null,
        false,
        'als Terminübersicht bitte'
      )
    );
    expect(draftCallPrompt()).toContain('Form: Termine');
  });
});

describe('a form picked in the UI', () => {
  it('wins over what the model reads in the words', async () => {
    stopsAtDraft(needs('karussell', { bestellt: true, folien: 'mehrere' }));
    await failureOf(
      draftSharepic('Karussell: Lena Grün sagt „Busse statt Stau“', 'de-DE', null, [], {}, 'zitat')
    );
    expect(needsCallPrompt()).toContain('Die Form steht fest: `zitat`');
    expect(needsCallPrompt()).not.toContain('form_bestellt: true, wenn');
    expect(draftCallPrompt()).toContain('Form: Zitat');
  });

  it('asks for missing material before any model call', async () => {
    const err = await failureOf(
      draftSharepic('Radwege machen Städte sicherer', 'de-DE', null, [], {}, 'diagramm')
    );
    expect(aiObject).not.toHaveBeenCalled();
    expect((err as DraftFailedError).failure).toMatchObject({ kind: 'material', form: 'diagramm' });
  });

  it('turns a picked Termine with one date into a Veranstaltung', async () => {
    stopsAtDraft(needs('termine'));
    await failureOf(
      draftSharepic('Stammtisch am 14.11. im Café Linde', 'de-DE', null, [], {}, 'termine')
    );
    expect(draftCallPrompt()).toContain('Form: Veranstaltung');
  });
});

describe('a revision', () => {
  const current: SharepicSpec = {
    locale: 'de-DE',
    slides: [slide([headline(['Busse statt Stau'])])] as SharepicSpec['slides'],
  };

  it('keeps its form whatever the model reads in the change request', async () => {
    stopsAtDraft(needs('zitat', { bestellt: true, folien: 'mehrere' }));
    await failureOf(draftSharepic('das Zitat kürzer', 'de-DE', current));
    expect(draftCallPrompt()).not.toMatch(/Form: /);
    expect(draftCallPrompt()).not.toContain('im Karussell');
    expect(needsCallPrompt()).not.toContain('Was die Person selbst geschrieben hat');
  });

  it('asks for no material for a form the change request only mentions', async () => {
    stopsAtDraft(needs('termine', { bestellt: true }));
    const err = await failureOf(draftSharepic('Termine raus, nur die Headline', 'de-DE', current));
    expect(err).not.toMatchObject({ failure: { kind: 'material' } });
  });
});

describe('several slides of a form', () => {
  it.each(['bingo', 'infografik', 'zitat', 'faktenbild'] as const)(
    'holds an ordered %s with several slides to a carousel too',
    async (form) => {
      stopsAtDraft(needs(form, { bestellt: true, folien: 'mehrere' }));
      await failureOf(draftSharepic('Karussell mit 30 % und 50 % und Lena Grün', 'de-DE'));
      expect(draftCallPrompt()).toContain('im Karussell (2–8 Slides)');
    }
  );

  it.each(['karussell', 'einzelbild', 'interview'] as const)(
    'adds no carousel to a %s',
    async (form) => {
      stopsAtDraft(needs(form, { bestellt: true, folien: 'mehrere' }));
      await failureOf(draftSharepic('Mach mehrere Slides, Interview mit Lena Grün', 'de-DE'));
      expect(draftCallPrompt()).not.toContain('im Karussell (2–8 Slides)');
    }
  );

  it('adds no carousel when the count is open', async () => {
    stopsAtDraft(needs('bingo', { bestellt: true, folien: 'offen' }));
    await failureOf(draftSharepic('Bingo der Autolobby', 'de-DE'));
    expect(draftCallPrompt()).not.toContain('im Karussell');
  });
});

describe('alternatives', () => {
  it('offers only forms the brief can fill', async () => {
    draftsAs(needs('einzelbild', { alternativen: ['termine', 'diagramm'] }), {
      slides: [slide([headline(['Busse statt Stau'])])],
    });
    const draft = await draftSharepic('Busse statt Stau', 'de-DE');
    expect(draft.alternativen).toBeUndefined();
  });

  it('keeps fillable ones', async () => {
    draftsAs(needs('einzelbild', { alternativen: ['karussell', 'diagramm'] }), {
      slides: [slide([headline(['Busse statt Stau'])])],
    });
    const draft = await draftSharepic(
      'Busse statt Stau: 2019 waren es 12, heute 30 Linien',
      'de-DE'
    );
    expect(draft.alternativen).toEqual(['karussell', 'diagramm']);
  });
});

describe('needsPrompt', () => {
  const base = {
    task: 'Auftrag:\nX',
    ownPhotos: [],
    defaultLocale: 'de-DE' as const,
    fixed: null,
    named: null,
    prompt: 'X',
    oneSlide: false,
  };

  it('asks for the order judgement on a fresh draft', () => {
    const p = needsPrompt({ ...base, request: 'X' });
    expect(p).toContain('form_bestellt: true, wenn die Person sagt');
    expect(p).toContain('„Steckbrief: …“');
    expect(p).toContain('„bei allen Terminen“');
    expect(p).toContain('(bestellt mit: Terminübersicht, Save the Date)');
    expect(p).toContain('folien: "eine"');
    expect(p).toContain('Was der Inhalt aufzählt, legt die Zahl nicht fest');
  });

  it('shows the person’s own words when the prompt carries more', () => {
    const p = needsPrompt({
      ...base,
      prompt: 'Radwege\n\nMaterial …',
      request: 'mach ein karussell',
    });
    expect(p).toContain(
      'Was die Person selbst geschrieben hat – nur danach richten sich form_bestellt und folien:\nmach ein karussell'
    );
  });

  it('shows no second copy when the words are the prompt', () => {
    expect(needsPrompt({ ...base, request: ' X ' })).not.toContain('Was die Person selbst');
  });

  it('defaults an open count to one slide only where the caller does', () => {
    expect(needsPrompt({ ...base, request: 'X', oneSlide: true })).toContain(
      'Ist folien "offen", wird es ein einzelnes Bild'
    );
    expect(needsPrompt({ ...base, request: 'X' })).not.toContain('Ist folien "offen"');
  });

  it('states a picked form as fixed', () => {
    const p = needsPrompt({ ...base, request: 'X', named: 'termine' });
    expect(p).toContain('Die Form steht fest: `termine`');
    expect(p).not.toContain('form_bestellt: true, wenn');
  });

  it('keeps the country rule', () => {
    expect(needsPrompt({ ...base, request: 'X' })).toContain('Standard ist de-DE');
    expect(needsPrompt({ ...base, request: 'X', fixed: 'de-AT' })).toContain('de-AT (steht fest)');
  });
});

describe('the needs schema', () => {
  it('requires every field the zod schema reads, and only those', () => {
    const keys = Object.keys(needsSchema.shape).sort();
    expect([...NEEDS_SCHEMA.required].sort()).toEqual(keys);
    expect(Object.keys(NEEDS_SCHEMA.properties).sort()).toEqual(keys);
  });

  it('rejects an answer without the order judgement', () => {
    const answer = needs('karussell').data as Record<string, unknown>;
    expect(needsSchema.safeParse(answer).success).toBe(true);
    const { form_bestellt: _b, ...withoutOrder } = answer;
    const { folien: _f, ...withoutCount } = answer;
    expect(needsSchema.safeParse(withoutOrder).success).toBe(false);
    expect(needsSchema.safeParse(withoutCount).success).toBe(false);
    expect(needsSchema.safeParse({ ...answer, folien: 'viele' }).success).toBe(false);
  });
});

describe('a picked form the brief cannot fill', () => {
  it('reports the swap from the picked Termine', async () => {
    draftsAs(needs('karussell', { bestellt: true }), {
      slides: [slide([headline(['Stammtisch', 'im Café Linde'])], { datum: { date: '14.11.' } })],
    });
    const draft = await draftSharepic(
      'Stammtisch am 14.11. im Café Linde',
      'de-DE',
      null,
      [],
      {},
      'termine'
    );
    expect(draft.form).toBe('veranstaltung');
    expect(draft.bericht?.[0]).toEqual({
      art: 'form',
      form: 'veranstaltung',
      von: 'person',
      statt: 'termine',
    });
  });
});

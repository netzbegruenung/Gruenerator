/**
 * Die `heavy`- und `hedge`-Stufen laufen seit 21.08.2026 auf Cortecs
 * (`provider: 'cortecs'`), NICHT mehr direkt auf Scaleway. Drei Dinge tragen
 * diese Lane, und keines davon bewacht der Compiler.
 *
 *  1. `reasoning_effort: 'none'`. Gemma 4 26B-A4B denkt per Default und
 *     antwortet dann mit LEEREM `content` — über Cortecs am 21.08.2026
 *     nachgemessen: ohne den Wert 0 Zeichen Inhalt nach 550 Zeichen Denken bei
 *     120 Token Budget, mit ihm 477 Zeichen und `finish: stop`. Leerer Inhalt
 *     ist für die Fassade kein Fehler, sondern startet die Fallback-Kette — der
 *     Ausfall wäre also teuer UND unsichtbar.
 *  2. Die WHITELIST um diesen Pin. Anders als Scaleway ist Cortecs ein Fan-out:
 *     `gemma-4-31b-it` liegt dort beim Unteranbieter infercom und weist `none`
 *     mit HTTP 400 ab. Ein bedingungsloser Pin — wie ihn der Scaleway-Wrapper
 *     mit ausdrücklicher Begründung trägt — machte jedes künftig ergänzte
 *     Cortecs-Modell zum harten Fehler.
 *  3. Dass die Lane-Tabelle überhaupt hierher zeigt. `intermediateLanes.ts` ist
 *     eine Datenstruktur; ein Zurückfallen auf `scaleway` wäre kein Typfehler.
 */

import { describe, expect, it, vi } from 'vitest';

/** Der Wächter meldet über den Winston-Logger, nicht über console. */
const gemeldet: { fehler: string[]; warnung: string[] } = { fehler: [], warnung: [] };
vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({
    error: (msg: string) => gemeldet.fehler.push(String(msg)),
    warn: (msg: string) => gemeldet.warnung.push(String(msg)),
    info: () => undefined,
    debug: () => undefined,
  }),
}));

import { cortecsFetchWithPolicy, SOVEREIGN_ZDR_PROVIDERS } from '../cortecsRequestPolicy.js';
import { intermediateLane } from '../intermediateLanes.js';

/** Fängt den Body ab, den der Wrapper tatsächlich auf die Leitung gibt. */
async function sentBody(
  payload: unknown,
  url = 'https://example.invalid/chat/completions',
  upstream?: string,
  servedModel?: string
) {
  let sent: string | null = null;
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
    sent = String(init?.body);
    return Promise.resolve(
      new Response('{}', {
        status: 200,
        headers: {
          ...(upstream === undefined ? {} : { 'x-cortecs-provider': upstream }),
          ...(servedModel === undefined ? {} : { 'x-cortecs-model': servedModel }),
        },
      })
    );
  }) as typeof fetch;
  try {
    await cortecsFetchWithPolicy(url, {
      method: 'POST',
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });
  } finally {
    globalThis.fetch = original;
  }
  return sent;
}

describe('cortecs text lane', () => {
  it('erzwingt reasoning_effort none für das Modell der Lane', async () => {
    const sent = await sentBody({ model: 'gemma-4-26b-a4b-it', messages: [], max_tokens: 20 });
    const parsed = JSON.parse(String(sent)) as Record<string, unknown>;
    expect(parsed.reasoning_effort).toBe('none');
  });

  it('pinnt NICHT auf einem Modell, dessen Unteranbieter den Wert ablehnt', async () => {
    // gemma-4-31b-it läuft bei Cortecs auf infercom und antwortet auf `none`
    // mit HTTP 400 ("value must be one of 'low', 'medium', 'high'"), gemessen
    // am 21.08.2026. Ein Pin hier verwandelte einen teuren Erfolg in einen
    // harten Fehler — und seit dem 21.08.2026 ist das kein hypothetisches
    // Modell mehr, sondern der Primär der `pruefung`-Stufe: JEDER Prüfbericht
    // liefe in diesen 400er.
    const sent = await sentBody({ model: 'gemma-4-31b-it', messages: [], max_tokens: 20 });
    const parsed = JSON.parse(String(sent)) as Record<string, unknown>;
    expect(parsed.reasoning_effort).toBeUndefined();
  });

  it('lässt einen bereits gesetzten Wert auf einem fremden Modell stehen', async () => {
    const sent = await sentBody({
      model: 'mistral-medium-3.5',
      messages: [],
      reasoning_effort: 'low',
    });
    const parsed = JSON.parse(String(sent)) as Record<string, unknown>;
    expect(parsed.reasoning_effort).toBe('low');
  });

  it('lässt Nicht-Chat-Bodies unangetastet', async () => {
    expect(await sentBody('nicht-json', 'https://example.invalid/files')).toBe('nicht-json');
  });

  it('legt die Souveraenitaets-Weisung an jede Chat-Anfrage', async () => {
    // Nach Ziffer 2.11 der DPA ist die Routing-Konfiguration die dokumentierte
    // Weisung: eine unbeschraenkte Auswahl autorisiert jeden kuenftig
    // aufgenommenen Unterauftragnehmer automatisch.
    const sent = await sentBody({ model: 'gemma-4-26b-a4b-it', messages: [], max_tokens: 20 });
    const parsed = JSON.parse(String(sent)) as Record<string, unknown>;
    expect(parsed.eu_native).toBe(true);
    expect(parsed.allow_zero_data_retention).toBe(true);
    expect(parsed.allowed_providers).toEqual(SOVEREIGN_ZDR_PROVIDERS);
  });

  it('legt die Weisung auch an Embeddings-Anfragen, die statt messages ein input tragen', async () => {
    // POST /v1/embeddings kennt keine `messages`; ohne diesen Zweig ging die
    // Anfrage ohne Weisung hinaus und niemand haette es gemerkt (#3192).
    const sent = await sentBody(
      { model: 'bge-m3', input: ['erster Text', 'zweiter Text'] },
      'https://example.invalid/embeddings'
    );
    const parsed = JSON.parse(String(sent)) as Record<string, unknown>;
    expect(parsed.eu_native).toBe(true);
    expect(parsed.allow_zero_data_retention).toBe(true);
    expect(parsed.allowed_providers).toEqual(SOVEREIGN_ZDR_PROVIDERS);
    expect(parsed.input).toEqual(['erster Text', 'zweiter Text']);
  });

  it('legt die Weisung nach Vorhandensein des Felds an, nicht nach Wahrheitswert', async () => {
    // `input: ''` ist eine Anfrage, die hinausgeht — ein Truthiness-Check
    // liesse genau sie ohne Weisung passieren.
    const sent = await sentBody(
      { model: 'bge-m3', input: '' },
      'https://example.invalid/embeddings'
    );
    const parsed = JSON.parse(String(sent)) as Record<string, unknown>;
    expect(parsed.eu_native).toBe(true);
    expect(parsed.allowed_providers).toEqual(SOVEREIGN_ZDR_PROVIDERS);
  });

  it('pinnt den Denk-Modus nicht auf eine Embeddings-Anfrage, auch nicht fuer ein Pin-Modell', async () => {
    const sent = await sentBody(
      { model: 'gemma-4-26b-a4b-it', input: ['Text'] },
      'https://example.invalid/embeddings'
    );
    const parsed = JSON.parse(String(sent)) as Record<string, unknown>;
    expect(parsed.eu_native).toBe(true);
    expect(parsed).not.toHaveProperty('reasoning_effort');
  });

  it('haelt die drei Unterauftragnehmer heraus, die ZDR oder EU-Ansaessigkeit fehlen', () => {
    // DPA-Tabelle vom 11.08.2026: Microsoft Ireland fuehrt kein Zero Data
    // Retention, Google Cloud EMEA und AWS EMEA uebertragen ins Drittland
    // ueber das EU-US Data Privacy Framework.
    for (const verboten of ['microsoft', 'google', 'amazon']) {
      expect(SOVEREIGN_ZDR_PROVIDERS).not.toContain(verboten);
    }
    // Und die belegten Kurznamen sind da — sie stammen aus Antwort-Headern
    // bzw. einer 404-Meldung, nicht aus dem Firmennamen geraten.
    for (const erlaubt of ['scaleway', 'mistral', 'infercom', 'ovh', 'aki']) {
      expect(SOVEREIGN_ZDR_PROVIDERS).toContain(erlaubt);
    }
  });

  it('meldet lautstark, wenn ein nicht zugelassener Unterauftragnehmer geantwortet hat', async () => {
    // Der Filter ist fail-open (gemessen 21.08.2026: ein unbekannter Name in
    // allowed_providers hebt ihn auf, statt zu sperren), also ist der
    // Antwort-Header die einzige Stelle, an der das ueberhaupt auffaellt.
    gemeldet.fehler.length = 0;
    await sentBody(
      { model: 'gemma-4-26b-a4b-it', messages: [] },
      'https://example.invalid/chat/completions',
      'microsoft'
    );
    expect(gemeldet.fehler.join(' ')).toContain('microsoft');
  });

  it('schweigt, wenn ein zugelassener Unterauftragnehmer geantwortet hat', async () => {
    gemeldet.fehler.length = 0;
    await sentBody(
      { model: 'gemma-4-26b-a4b-it', messages: [] },
      'https://example.invalid/chat/completions',
      'scaleway'
    );
    expect(gemeldet.fehler).toEqual([]);
  });

  it('meldet lautstark, wenn der Router still ein anderes Modell rechnen liess', async () => {
    // Gemessen 07.10.2026: `gemma-4-31b-it` mit ~228k Tokens kam als
    // `gemma-4-26b-a4b-it` bei scaleway zurück — HTTP 200, die Nadel fehlte.
    gemeldet.fehler.length = 0;
    await sentBody(
      { model: 'gemma-4-31b-it', messages: [] },
      'https://example.invalid/chat/completions',
      'scaleway',
      'gemma-4-26b-a4b-it'
    );
    expect(gemeldet.fehler.join(' ')).toContain('gemma-4-26b-a4b-it');
  });

  it('schweigt, wenn das angefragte Modell gerechnet hat', async () => {
    gemeldet.fehler.length = 0;
    await sentBody(
      { model: 'gemma-4-31b-it', messages: [] },
      'https://example.invalid/chat/completions',
      'berget',
      'gemma-4-31b-it'
    );
    expect(gemeldet.fehler).toEqual([]);
  });

  it('heavy zeigt auf die Cortecs-Lane', () => {
    // Seit 21.08.2026 das dichte 31B statt der MoE-Variante — nicht wegen der
    // Qualität, sondern weil das MoE über Cortecs an einen einzigen
    // Unterauftragnehmer gebunden war und der binnen einer Stunde aus dem
    // Katalog verschwand. Siehe den Doc-Block bei `heavy`.
    // `toMatchObject` wie bei der Prüf-Stufe darunter: geprüft wird, WORAUF die
    // Stufe zeigt, nicht welche Felder eine Lane-Config sonst noch trägt.
    expect(intermediateLane('heavy')).toMatchObject({
      provider: 'cortecs',
      model: 'gemma-4-31b-it',
    });
  });

  it('die Prüf-Stufe liegt auf ZWEI Vertragspartnern, Cortecs voran', () => {
    // Die ganze Absicht des Hedges: ein Einbruch bei einem Anbieter darf nicht
    // beide Seiten der Stufe nehmen. Stünden Primär und Ausweich beim selben,
    // wäre der Hedge ein zweiter Aufruf ohne Absicherung — teurer, nicht
    // sicherer.
    const lane = intermediateLane('pruefung');
    expect(lane).toMatchObject({ provider: 'cortecs', model: 'gemma-4-31b-it' });
    expect(lane.hedge).toEqual({ provider: 'melious', model: 'gemma-4-31b:balanced' });
    expect(lane.hedge?.provider).not.toBe(lane.provider);
  });
});

/**
 * Kolibri-1 (Unteranbieter aki) denkt per Default und weist `json_object` ab —
 * beides am 28.10.2026 gegen api.cortecs.ai gemessen: ohne `none` steht die
 * Antwort in `reasoning_content` und `content` bleibt leer; mit
 * `response_format: {type:'json_object'}` kommt HTTP 400 („Only json_schema,
 * regex, grammar, choice are allowed"). Werkzeugaufrufe mit `tool_choice:
 * 'required'` gehen mit `none` durch.
 */
describe('cortecs kolibri-1', () => {
  it('pinnt reasoning_effort none', async () => {
    const sent = await sentBody({ model: 'kolibri-1', messages: [], max_tokens: 20 });
    expect((JSON.parse(String(sent)) as Record<string, unknown>).reasoning_effort).toBe('none');
  });

  it('nimmt json_object vom Draht, weil der Unteranbieter es mit 400 ablehnt', async () => {
    const sent = await sentBody({
      model: 'kolibri-1',
      messages: [],
      response_format: { type: 'json_object' },
    });
    expect(JSON.parse(String(sent))).not.toHaveProperty('response_format');
  });

  it('lässt json_object auf anderen Modellen stehen', async () => {
    const sent = await sentBody({
      model: 'gemma-4-31b-it',
      messages: [],
      response_format: { type: 'json_object' },
    });
    expect((JSON.parse(String(sent)) as Record<string, unknown>).response_format).toEqual({
      type: 'json_object',
    });
  });

  // tool_choice 'required' hält kolibri-1 nicht ein (28.10.2026: 3 von 6 Läufen
  // Fliesstext statt Aufruf); json_schema traf 6 von 6.
  it('macht aus dem erzwungenen Werkzeug ein json_schema', async () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    const sent = await sentBody({
      model: 'kolibri-1',
      messages: [],
      tools: [{ type: 'function', function: { name: 'melden', parameters: schema } }],
      tool_choice: 'required',
      response_format: { type: 'json_object' },
    });
    const parsed = JSON.parse(String(sent)) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('tools');
    expect(parsed.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'melden', schema },
    });
  });

  // Die Antwortseite: nach der Souveränitätsprüfung wird das JSON zum Werkzeugaufruf.
  it('legt die JSON-Antwort als Aufruf des erzwungenen Werkzeugs zurück', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            model: 'kolibri-1',
            choices: [
              { message: { role: 'assistant', content: '{"a":"x"}' }, finish_reason: 'stop' },
            ],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-cortecs-provider': 'aki',
              'x-cortecs-model': 'kolibri-1',
            },
          }
        )
      )) as typeof fetch;
    try {
      const res = await cortecsFetchWithPolicy('https://example.invalid/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: 'kolibri-1',
          messages: [],
          tools: [
            { type: 'function', function: { name: 'melden', parameters: { type: 'object' } } },
          ],
          tool_choice: 'required',
        }),
      });
      const json = (await res.json()) as {
        choices: {
          message: { content: unknown; tool_calls: { function: unknown }[] };
          finish_reason: string;
        }[];
      };
      expect(json.choices[0].message.content).toBeNull();
      expect(json.choices[0].message.tool_calls[0].function).toEqual({
        name: 'melden',
        arguments: '{"a":"x"}',
      });
      expect(json.choices[0].finish_reason).toBe('tool_calls');
      expect(res.headers.get('x-cortecs-provider')).toBe('aki');
    } finally {
      globalThis.fetch = original;
    }
  });
});

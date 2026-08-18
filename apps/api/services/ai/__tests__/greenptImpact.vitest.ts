import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const recordImpact = vi.fn();
vi.mock('../../usage/UsageTrackingService.js', () => ({ recordImpact }));
vi.mock('../../../utils/usageContext.js', () => ({
  getUsageUserId: () => 'user-1',
  getUsageFeature: () => 'chat',
}));

const { captureImpact, modelFromRequestBody, parseImpact, parseImpactFromSse } =
  await import('../greenptImpact.js');

/** Verbatim from api.greenpt.ai on 2026-07-31 — the shape this parser exists for. */
const MEASURED = {
  model: 'mistral-medium-3.5-128b',
  usage: { prompt_tokens: 36, completion_tokens: 187, total_tokens: 223 },
  impact: {
    version: '20250922',
    inferenceTime: { total: 2851, unit: 'ms' },
    energy: { total: 3_112_097, unit: 'Wms' },
    emissions: { total: 26_311, unit: 'ugCO2e' },
  },
};

describe('parseImpact', () => {
  it('reads energy and emissions off a real response', () => {
    expect(parseImpact(MEASURED)).toEqual({ energyWms: 3_112_097, emissionsUg: 26_311 });
  });

  it('returns null for the speech-to-text response shape', () => {
    // /v1/listen carries no impact field at all — verified against the live
    // endpoint. A transcription must not be recorded as a zero-cost inference.
    expect(
      parseImpact({ metadata: { duration: 8.68 }, results: {}, model: 'green-s-pro' })
    ).toBeNull();
  });

  it('rejects a malformed impact object instead of recording zeros', () => {
    expect(parseImpact({ impact: { energy: { total: 'viel' }, emissions: {} } })).toBeNull();
    expect(parseImpact({ impact: { energy: { total: 0 }, emissions: { total: 0 } } })).toBeNull();
    expect(parseImpact(null)).toBeNull();
  });
});

describe('parseImpactFromSse', () => {
  it('finds the impact on the final usage event', () => {
    // The impact rides the same event as `usage`, which has an empty `choices`.
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hallo"}}]}',
      '',
      `data: ${JSON.stringify({ choices: [], usage: { total_tokens: 37 }, impact: MEASURED.impact })}`,
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    expect(parseImpactFromSse(sse)).toEqual({ energyWms: 3_112_097, emissionsUg: 26_311 });
  });

  it('survives a truncated leading frame', () => {
    const sse = `data: {"choices":[{"delta":\ndata: ${JSON.stringify({ impact: MEASURED.impact })}\n`;
    expect(parseImpactFromSse(sse)).not.toBeNull();
  });

  it('returns null for a stream that never reported impact', () => {
    expect(parseImpactFromSse('data: {"choices":[]}\n\ndata: [DONE]\n')).toBeNull();
  });
});

describe('modelFromRequestBody', () => {
  it('reads the model so the row keys match the token row', () => {
    expect(modelFromRequestBody(JSON.stringify({ model: 'gemma4', messages: [] }))).toBe('gemma4');
  });

  it('shrugs off a non-JSON body', () => {
    expect(modelFromRequestBody('------WebKitFormBoundary')).toBeNull();
    expect(modelFromRequestBody(undefined)).toBeNull();
  });
});

describe('captureImpact', () => {
  beforeEach(() => recordImpact.mockClear());
  afterEach(() => vi.restoreAllMocks());

  it('records the buffered response without consuming it', async () => {
    const response = new Response(JSON.stringify(MEASURED), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const passed = captureImpact(response, 'mistral-medium-3.5-128b');

    // The caller must still get a readable body — that is the whole point of
    // cloning rather than reading.
    await expect(passed.json()).resolves.toMatchObject({ model: 'mistral-medium-3.5-128b' });
    await vi.waitFor(() => expect(recordImpact).toHaveBeenCalledTimes(1));
    expect(recordImpact).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'greenpt',
        model: 'mistral-medium-3.5-128b',
        userId: 'user-1',
        feature: 'chat',
        energyWms: 3_112_097,
        emissionsUg: 26_311,
      })
    );
  });

  it('passes a stream through byte-for-byte while tapping it', async () => {
    const body = [
      'data: {"choices":[{"delta":{"content":"Hallo"}}]}',
      '',
      `data: ${JSON.stringify({ choices: [], impact: MEASURED.impact })}`,
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });

    const passed = captureImpact(response, 'gemma4');
    await expect(passed.text()).resolves.toBe(body);
    await vi.waitFor(() => expect(recordImpact).toHaveBeenCalledTimes(1));
    expect(recordImpact).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemma4', energyWms: 3_112_097 })
    );
  });

  it('leaves an error response alone', () => {
    const response = new Response('{"error":"nope"}', { status: 429 });
    expect(captureImpact(response, 'gemma4')).toBe(response);
    expect(recordImpact).not.toHaveBeenCalled();
  });

  /**
   * Der Tap darf die Anfrage nicht ÜBERLEBEN. `tee()` gibt den Körper erst
   * frei, wenn beide Zweige fertig sind — ohne diesen Abbruch las der Tap
   * weiter, während der Aufrufer längst abgebrochen hatte, und hielt die
   * Verbindung offen. Live gemessen am 18.08.2026: ein Turn lief 1.229 s und
   * endete erst, als undici von sich aus abbrach.
   */
  it('stops tapping when the caller aborts', async () => {
    let cancelled = false;
    const never = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n'));
        // …und danach nie wieder etwas: der hängende Anbieter.
      },
      cancel() {
        cancelled = true;
      },
    });
    const controller = new AbortController();
    const response = new Response(never, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });

    const passed = captureImpact(response, 'gemma4', controller.signal);
    // Der Zweig des Aufrufers bleibt lesbar — der Abbruch gilt nur dem Tap.
    expect(passed.body).not.toBeNull();

    controller.abort();
    // Ein einzelner abgebrochener tee-Zweig bricht die QUELLE nicht ab — genau
    // deshalb stört der Abbruch den Aufrufer nicht. Sichtbar wird er erst, wenn
    // auch der Aufrufer loslässt: dann sind beide Zweige fertig und die
    // Verbindung fällt. Ohne den Abbruch oben läse der Tap weiter und die
    // Quelle bliebe für immer offen.
    await passed.body?.cancel();
    await vi.waitFor(() => expect(cancelled).toBe(true));
  });
});
